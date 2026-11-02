-- Phase 10 — real-money readiness (sessions, identity, email codes, delivery
-- hold, price guard, append-only vault).

-- 1. Per-device sessions. The old single user.refresh_token_hash meant a
-- sign-in on one device silently invalidated every other device (the "blank
-- Portfolio on the phone" report). Each row is one device's session; the
-- refresh token is `${id}.${secret}` and only sha256(secret) is stored.
-- previous_hash + rotated_at let a racing second tab within a short grace be
-- told "already rotated" instead of being treated as token theft; any other
-- mismatch revokes the session (refresh-token reuse detection).
CREATE TABLE "auth_session" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "refresh_hash" text NOT NULL,
  "previous_hash" text,
  "rotated_at" timestamp with time zone,
  "amr" text[] DEFAULT '{}'::text[] NOT NULL,
  "auth_time" timestamp with time zone DEFAULT now() NOT NULL,
  "user_agent" text,
  "ip" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "revoked_reason" text
);
--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "auth_session_user_idx" ON "auth_session" ("user_id");
--> statement-breakpoint

-- 2. Verified national identity (Fayda / eSignet). One row per user; the
-- (provider, subject) pair is also in auth_identity for sign-in. Kept apart
-- from `user` so the PII lives in one place.
CREATE TABLE "identity_verification" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "subject" text NOT NULL,
  "legal_name" text NOT NULL,
  "birthdate" text,
  "gender" text,
  "phone" text,
  "email" text,
  "address" jsonb,
  "nationality" text,
  "picture" bytea,
  "picture_mime" text,
  "verified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity_verification" ADD CONSTRAINT "identity_verification_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "identity_verification_user_uq" ON "identity_verification" ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "identity_verification_subject_uq" ON "identity_verification" ("provider", "subject");
--> statement-breakpoint

-- 3. One-time email codes (email verification, withdrawal confirmation).
-- sha256 of the 6-digit code only; 10-minute life, 5 attempts.
CREATE TABLE "email_code" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "purpose" text NOT NULL,
  "code_hash" text NOT NULL,
  "payload" jsonb,
  "attempts" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_code" ADD CONSTRAINT "email_code_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "email_code_user_purpose_idx" ON "email_code" ("user_id", "purpose");
--> statement-breakpoint

-- 4. Verified email. Accounts that already exist are marked verified as of
-- creation: production is recreated at go-live (docs/deploy/GO_LIVE.md), so
-- this only keeps dev/staging data usable. Every new account must confirm.
ALTER TABLE "user" ADD COLUMN "email_verified_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "user" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL;
--> statement-breakpoint

-- 5. Delivery fulfilment. Approval now moves the metal into
-- system:delivery_hold:<asset>; `delivered` is the handover.
ALTER TYPE "delivery_status" ADD VALUE IF NOT EXISTS 'delivered';
--> statement-breakpoint
ALTER TABLE "delivery_request" ADD COLUMN "delivered_at" timestamp with time zone;
--> statement-breakpoint
ALTER TYPE "txn_kind" ADD VALUE IF NOT EXISTS 'delivery';
--> statement-breakpoint

-- 5b. A credited deposit the provider later refunded/reversed (verified).
ALTER TYPE "payment_status" ADD VALUE IF NOT EXISTS 'reversed';
--> statement-breakpoint

-- 6. Price guard. A tick whose move the secondary feed could not confirm is
-- stored (so the record is honest) but flagged, and the quote engine refuses it.
ALTER TABLE "price_tick" ADD COLUMN "suspect" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

-- 7. Physical inventory is append-only, like the ledger. A wrong intake is
-- corrected with an outtake, never by editing the row.
CREATE TRIGGER vault_holding_append_only
  BEFORE UPDATE OR DELETE ON "vault_holding"
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
