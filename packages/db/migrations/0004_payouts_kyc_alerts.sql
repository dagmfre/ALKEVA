-- Phase 4 — money in/out destinations, KYC document storage, price alerts.
--
-- payout gains its Chapa transfer destination (bank_code from GET /v1/banks,
-- account number/name) and an idempotency key: a withdrawal request moves the
-- user's cents into the payout-hold account, so a double-submit must map to
-- exactly one hold — the same insert-first claim pattern orders use.
-- All four are NOT NULL: no code has ever written a payout row before this
-- migration, so there is nothing to backfill.

ALTER TABLE "payout" ADD COLUMN "bank_code" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE "payout" ADD COLUMN "account_number" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "payout" ADD COLUMN "account_name" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "payout" ADD COLUMN "idempotency_key" text NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "payout_idem_uq" ON "payout" ("idempotency_key");
--> statement-breakpoint
-- KYC documents live in the row itself (bytea, ≤2 MB enforced at the API):
-- no object storage is provisioned, Render disks are ephemeral, and a demo
-- document is small. file_ref (already present) stays as the display name.
ALTER TABLE "kyc_submission" ADD COLUMN "file_data" bytea;
--> statement-breakpoint
ALTER TABLE "kyc_submission" ADD COLUMN "file_mime" text;
--> statement-breakpoint
-- Price alerts (F24): deterministic threshold checks in the price worker —
-- "the LLM phrases; thresholds trigger" (design doc §8). One-shot: triggered_at
-- set means fired; the user re-arms by creating a new alert.
CREATE TYPE "alert_direction" AS ENUM ('above', 'below');
--> statement-breakpoint
CREATE TABLE "price_alert" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "asset" "asset" NOT NULL,
  "direction" "alert_direction" NOT NULL,
  "threshold_cents_per_gram" bigint NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "triggered_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "price_alert" ADD CONSTRAINT "price_alert_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "alert_user_idx" ON "price_alert" ("user_id");
--> statement-breakpoint
CREATE INDEX "alert_pending_idx" ON "price_alert" ("asset") WHERE "active" AND "triggered_at" IS NULL;
--> statement-breakpoint
-- Grandfather every existing account to KYC tier 1: the KYC gate on
-- deposit/withdraw/trade lands with Phase 4, and users created before the
-- gate (demo/test accounts with live history) must not be locked out of
-- flows they already used. New registrations start at tier 0 and go through
-- the real submission → review path. One-time by construction: a migration
-- runs once, unlike the seed, which runs on every deploy.
UPDATE "user" SET kyc_tier = 1 WHERE kyc_tier = 0;
