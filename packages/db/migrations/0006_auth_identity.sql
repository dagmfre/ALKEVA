-- Google sign-in (production stage).
--
-- auth_identity maps (provider, provider_user_id) → user. The provider only
-- proves the email; the API still issues its own JWT/refresh cookies through
-- the existing AuthService, so every guard and the cookie proxy are unchanged.
--
-- password_hash becomes nullable: a Google-created account has no password
-- until the user sets one through the reset flow. Login refuses NULL-hash
-- accounts with the same uniform invalid_credentials (no enumeration).

CREATE TABLE "auth_identity" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "provider_user_id" text NOT NULL,
  "email" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_identity" ADD CONSTRAINT "auth_identity_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identity_provider_uq" ON "auth_identity" ("provider", "provider_user_id");
--> statement-breakpoint
CREATE INDEX "auth_identity_user_idx" ON "auth_identity" ("user_id");
--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "password_hash" DROP NOT NULL;
