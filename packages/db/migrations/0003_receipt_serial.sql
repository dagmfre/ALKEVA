-- Phase 3.4 — serial-numbered receipts (spec F12).
--
-- The serial is allocated when an order SETTLES, not when the row is inserted,
-- because a receipt exists only for a settled order. Rejected and review orders
-- keep receipt_serial NULL, so the column also answers "does this order have a
-- receipt?" without a status join. Postgres allows many NULLs under a unique
-- index, so the constraint still guarantees one serial per receipt.
--
-- Gaps are possible (a settle that rolls back on infrastructure error consumes
-- a sequence value) and are normal for financial document numbering — the
-- guarantee is uniqueness and monotonicity, not density.

CREATE SEQUENCE IF NOT EXISTS receipt_serial_seq START 1;
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "receipt_serial" bigint;
--> statement-breakpoint
CREATE UNIQUE INDEX "order_receipt_serial_uq" ON "order" ("receipt_serial");
--> statement-breakpoint
-- Backfill any orders that already settled (Phase 2 test data), oldest first,
-- so existing history reads in the same order it happened.
UPDATE "order" o
SET receipt_serial = s.rn
FROM (
  SELECT id, row_number() OVER (ORDER BY settled_at NULLS LAST, created_at) AS rn
  FROM "order"
  WHERE status = 'settled'
) s
WHERE o.id = s.id;
--> statement-breakpoint
SELECT setval(
  'receipt_serial_seq',
  COALESCE((SELECT max(receipt_serial) FROM "order"), 0) + 1,
  false
);
