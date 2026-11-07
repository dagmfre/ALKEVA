-- Phase 11 — Telegram Mini App + bot.
--
-- The Telegram account a user signs in with is an ordinary auth_identity row
-- (provider 'telegram', provider_user_id = the Telegram user id), so the
-- existing UNIQUE (provider, provider_user_id) makes one Telegram account
-- open at most one ALKEVA account. This table holds only what the bot needs
-- to message that person — Telegram's developer terms (§4) ask for nothing
-- beyond what is essential, so no photo, no phone, no language history.
CREATE TABLE "telegram_chat" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "tg_user_id" bigint NOT NULL,
  "username" text,
  "first_name" text,
  -- true once the person has started the bot or granted write access; the
  -- bot may only message people who allowed it.
  "can_message" boolean DEFAULT false NOT NULL,
  -- set when Telegram answers 403 (bot blocked / user deactivated).
  "blocked_at" timestamp with time zone,
  "linked_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "telegram_chat" ADD CONSTRAINT "telegram_chat_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_chat_tg_user_uq" ON "telegram_chat" ("tg_user_id");
--> statement-breakpoint

-- A third, independent delivery channel on the notification outbox.
-- queued | sent | failed | skipped — same vocabulary as push_status.
ALTER TABLE "notification" ADD COLUMN "tg_status" text DEFAULT 'skipped' NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "notif_outbox_idx";
--> statement-breakpoint
CREATE INDEX "notif_outbox_idx" ON "notification" ("next_attempt_at")
  WHERE "status" = 'queued' OR "push_status" = 'queued' OR "tg_status" = 'queued';
