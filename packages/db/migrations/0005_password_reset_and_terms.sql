-- Production stage — real password recovery + terms consent.
--
-- password_reset_token stores only the sha256 of the raw token: a database
-- leak must not mint working reset links. 30-minute TTL enforced at the API;
-- used_at makes each token single-use; issuing a new token invalidates the
-- user's prior unused ones (API-side UPDATE).
--
-- user.terms_accepted_at records registration consent. NULL for accounts
-- that predate the consent gate — grandfathered, not backfilled.

CREATE TABLE "password_reset_token" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "password_reset_token" ADD CONSTRAINT "password_reset_token_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "prt_user_idx" ON "password_reset_token" ("user_id");
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "terms_accepted_at" timestamp with time zone;
