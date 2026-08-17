-- AML rules engine: risk cases on the existing compliance_event table
-- (spec F20/F22, design §"compliance engine").
--
-- compliance_event has carried flagged activity since Phase 1, but only one
-- rule ever wrote to it (txn_over_500k, inline in the order path). A scanning
-- engine needs three things that row could not express: how serious the finding
-- is, which window it covers, and whether a duplicate of it already exists.
--
-- window_start is what makes a re-scan safe. Every rule buckets its evidence on
-- a window (midnight EAT for daily rules), so (user, rule, window) names one
-- finding exactly once — the unique index below turns a repeated scan into a
-- no-op instead of a queue full of the same case. It is deliberately nullable:
-- the pre-existing txn_over_500k rows have no window, and a partial index lets
-- them keep coexisting without a backfill that would invent one.
--
-- narrative holds a plain-language summary written by the assistant for the
-- reviewing officer. It is display text only: nothing reads it back, and no
-- action anywhere keys off its contents. The decision stays the officer's, and
-- the audit log records the officer, never the model.

ALTER TABLE "compliance_event" ADD COLUMN "score" integer;
--> statement-breakpoint
ALTER TABLE "compliance_event" ADD COLUMN "severity" text;
--> statement-breakpoint
ALTER TABLE "compliance_event" ADD COLUMN "window_start" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "compliance_event" ADD COLUMN "narrative" text;
--> statement-breakpoint
ALTER TABLE "compliance_event" ADD COLUMN "narrative_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "compliance_event" ADD COLUMN "narrative_locale" text;
--> statement-breakpoint
ALTER TABLE "compliance_event" ADD COLUMN "resolution_note" text;
--> statement-breakpoint
-- One open finding per (user, rule, window). Partial: rows without a window
-- (the original inline rule) are exempt rather than colliding on NULL.
CREATE UNIQUE INDEX "ce_user_rule_window_uq" ON "compliance_event" ("user_id", "rule_key", "window_start")
  WHERE "window_start" IS NOT NULL;
--> statement-breakpoint
-- The queue's own filter: open cases, newest first.
CREATE INDEX "ce_resolved_idx" ON "compliance_event" ("resolved_at");
