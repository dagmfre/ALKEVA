-- Non-negotiable #2: balances are never edited.
-- ledger_entry and audit_log rows can be inserted, never updated or deleted —
-- enforced by the database itself, not by application discipline.

CREATE OR REPLACE FUNCTION reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'raise_exception';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entry_append_only
  BEFORE UPDATE OR DELETE ON "ledger_entry"
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint

-- Zero-sum invariant: within one ledger_transaction, entries must sum to zero
-- per asset. Checked as a DEFERRABLE constraint trigger at COMMIT time, so a
-- transaction can insert its entries in any order but can never commit
-- unbalanced.

CREATE OR REPLACE FUNCTION check_transaction_balance() RETURNS trigger AS $$
DECLARE
  unbalanced RECORD;
BEGIN
  SELECT le.transaction_id, le.asset, SUM(le.amount) AS total
    INTO unbalanced
    FROM "ledger_entry" le
   WHERE le.transaction_id = NEW.transaction_id
   GROUP BY le.transaction_id, le.asset
  HAVING SUM(le.amount) <> 0
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'ledger transaction % is unbalanced for asset % (sum=%)',
      unbalanced.transaction_id, unbalanced.asset, unbalanced.total
      USING ERRCODE = 'raise_exception';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ledger_entry_zero_sum
  AFTER INSERT ON "ledger_entry"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_transaction_balance();
--> statement-breakpoint

-- Entry sanity: amount must be non-zero, and the entry's asset must match its
-- account's asset (a XAU entry can never land on an ETB account).

ALTER TABLE "ledger_entry"
  ADD CONSTRAINT ledger_entry_amount_nonzero CHECK (amount <> 0);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION check_entry_asset_matches_account() RETURNS trigger AS $$
DECLARE
  acct_asset "asset";
BEGIN
  SELECT a.asset INTO acct_asset FROM "account" a WHERE a.id = NEW.account_id;
  IF acct_asset IS NULL THEN
    RAISE EXCEPTION 'ledger entry references missing account %', NEW.account_id;
  END IF;
  IF acct_asset <> NEW.asset THEN
    RAISE EXCEPTION 'ledger entry asset % does not match account asset %',
      NEW.asset, acct_asset;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entry_asset_match
  BEFORE INSERT ON "ledger_entry"
  FOR EACH ROW EXECUTE FUNCTION check_entry_asset_matches_account();
