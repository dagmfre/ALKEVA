-- WebAuthn / passkeys (production stage; formerly cut-list #6).
--
-- credential_id is base64url and globally unique. The signature counter is
-- checked and advanced on every assertion — a cloned authenticator replaying
-- an old counter is refused. public_key is the COSE key bytes as delivered by
-- the authenticator at registration.

CREATE TABLE "webauthn_credential" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "credential_id" text NOT NULL,
  "public_key" bytea NOT NULL,
  "counter" bigint DEFAULT 0 NOT NULL,
  "transports" text,
  "device_type" text,
  "backed_up" boolean DEFAULT false NOT NULL,
  "label" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_used_at" timestamp with time zone,
  CONSTRAINT "webauthn_credential_credential_id_unique" UNIQUE ("credential_id")
);
--> statement-breakpoint
ALTER TABLE "webauthn_credential" ADD CONSTRAINT "webauthn_credential_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "webauthn_user_idx" ON "webauthn_credential" ("user_id");
