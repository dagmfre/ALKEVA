# Phase 2 — Manual Testing Steps (for Dagmfre)

The money core. Every step says what you should see — anything else is a bug: report the step number and we fix before the phase closes.

**Setup used throughout:** local stack running (`docker compose up -d`, then `pnpm db:migrate && pnpm db:seed`, then `pnpm dev:api`, `pnpm dev:worker`, `pnpm dev:web`). psql shell: `docker exec -it alkeva-postgres psql -U alkeva -d alkeva`.

## A. Seed & groundwork

1. `pnpm db:seed` twice → second run prints `✓ system:cash already funded, skipping opening float` (the 10M-birr opening float posts exactly once).
2. psql: `SELECT asset, SUM(amount) FROM ledger_entry GROUP BY asset;` → every row is **0** (zero-sum invariant — repeat this query any time during testing; it must never change).

## B. The done-when core (browser, phone-sized)

3. Register a fresh user → dashboard shows a **balances strip** (ETB 0.00, Gold 0 g, Platinum 0 g) above the price cards, and a **Trade** panel below them.
4. Tap **Get demo birr** → success notice; ETB balance becomes 200,000.00. (Tap it 6× fast → the 6th is rate-limited; wait a minute.)
5. **Buy 5 g gold:** enter `5`, tap Buy → quote breakdown appears: price/gram × 5 = subtotal; commission = 2% of subtotal (check it on a calculator — the numbers must multiply out exactly); countdown from ~30s. Tap Confirm → "Order settled ✓", ETB drops by exactly *You pay*, Gold shows 5 g.
6. **Sell 2 g:** same flow with Sell → *You receive* = subtotal − commission; after Confirm, Gold 3 g, ETB up by exactly *You receive*.
7. Reconcile: ETB balance = 200,000 − buy-total + sell-total exactly, to the cent.

## C. Idempotency (button-mashing)

8. Get a buy quote for 1 g, then **click Confirm 5+ times as fast as you can** (the button stays enabled on purpose).
9. UI shows one success. psql:
   `SELECT count(*) FROM "order" WHERE status = 'settled' AND created_at > now() - interval '2 minutes';` → **1** new order;
   `SELECT count(*) FROM ledger_transaction WHERE created_at > now() - interval '2 minutes';` → **1**. Money moved exactly once.

## D. Rejections (each shows a clear localized message, and balances never change)

10. **Expired quote:** get a quote, let the countdown reach 0, tap Confirm → "quote expired" message. psql shows the order as `rejected / quote_expired`.
11. **Insufficient balance:** try to buy more than your ETB can cover but **under 500,000 birr total** (e.g. 8 g with ~85k birr left) → "not enough birr".
12. **Insufficient metal:** sell more grams than you hold → "not enough metal".
13. **Reused quote:** in psql grab the id of any consumed quote, then (curl or repeat step via a second tab that kept the old quote open) confirming it again → "already used".

## E. Treasury gates (psql-assisted; restore after each)

14. **Reserve halt** (never sell a gram the vault doesn't hold):
    `INSERT INTO vault_holding (asset, kind, grams_mg, reference) VALUES ('XAU','outtake',4996000,'TEST-SHRINK');`
    Check `GET /treasury/summary` (curl with your session or the API directly): `availableMg` is now tiny. Buy 2 g → **"Buying is paused — vault reserve limit reached."** Buy within `availableMg` → settles.
    Restore: `INSERT INTO vault_holding (asset, kind, grams_mg, reference) VALUES ('XAU','intake',4996000,'TEST-RESTORE');`
15. **Float halt:** `UPDATE treasury_config SET halt_threshold_cents = 2000000000 WHERE id = 1;` → any sell → **"Selling is paused…"**. Restore: `UPDATE treasury_config SET halt_threshold_cents = 150000000 WHERE id = 1;`
16. **Daily sell-back ceiling:** `UPDATE treasury_config SET daily_sellback_ceiling_cents = 1000 WHERE id = 1;` → any sell → **"Today's sell-back ceiling has been reached."** Restore: `UPDATE treasury_config SET daily_sellback_ceiling_cents = 500000000 WHERE id = 1;`
17. **Frozen account:** `UPDATE "user" SET status = 'frozen' WHERE email = '<your test email>';` → any order → **"Your account is frozen."** Restore with `status = 'active'`.

## F. Compliance review (500k rule)

18. Faucet up to ~600k birr (3 calls, ~1 min apart for the rate limit), then buy ~30 g gold (total ≥ 500,000 birr) → the order returns **"submitted for review"** (not settled, not an error). psql: `SELECT rule_key, action FROM compliance_event ORDER BY created_at DESC LIMIT 1;` → `txn_over_500k | review`; balances **unchanged** (nothing posted); the quote is consumed.

## G. Stale-price protection

19. Stop the worker (`Ctrl+C` in its terminal), wait 3+ minutes, then request any quote → **"Price feed is delayed — please try again shortly."** No quote is created. Restart the worker → quoting resumes within ~30s.

## H. Ledger immutability & final reconciliation

20. psql: `UPDATE ledger_entry SET amount = 1 WHERE amount <> 1;` → FAILS: `ledger_entry is append-only`.
21. `SELECT asset, SUM(amount) FROM ledger_entry GROUP BY asset;` → all **0**. `SELECT count(*) FROM ledger_entry WHERE amount = 0;` → **0**.
22. `GET /treasury/summary` → hand-check: `float.cashCents` = 1,000,000,000 (opening) + Σ buy subtotals − Σ sell subtotals; `reserves[XAU].issuedMg` = total user gold in mg.

## I. Amharic pass

23. Switch to አማ and repeat steps 5, 10, 11, 15 → every label, notice, and error renders in Amharic (no English leaking, no tofu boxes).

## J. Phase 1 carry-over (production — once the Render deploy is green)

24. `https://alkeva-api.onrender.com/healthz` → all ok (per `docs/deploy/render-setup.md`; DATABASE_URL fix from 7 Aug applies).
25. Repeat Phase 1 steps 8–16 on the production URL.
26. Repeat this doc's steps 3–7 (the money core) on production, on your phone.

---
**Result:** note each failed step number (if any) and report back. Phase 2 closes only when A–I pass locally; J closes the Phase 1 deploy carry-over.
