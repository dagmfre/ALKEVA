-- Phase 10C — notifications that work: read state, an outbox the worker
-- delivers from (email + browser push, with retries), push subscriptions and
-- per-user preferences.

-- In-app read state. One row is still one notice; `status` remains the EMAIL
-- delivery state, `push_status` is the browser-push delivery state.
ALTER TABLE "notification" ADD COLUMN "read_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "push_status" text DEFAULT 'skipped' NOT NULL;
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "last_error" text;
--> statement-breakpoint
-- Email the user opted out of (or nothing to send through) — distinct from
-- "queued" so the dispatcher never loops on it.
ALTER TYPE "notification_status" ADD VALUE IF NOT EXISTS 'skipped';
--> statement-breakpoint
-- Everything that existed before the outbox has been shown in the app; old
-- rows must not resurface as a wall of "unread" or be re-mailed.
UPDATE "notification" SET "read_at" = "created_at" WHERE "read_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "notif_user_unread_idx" ON "notification" ("user_id") WHERE "read_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "notif_outbox_idx" ON "notification" ("next_attempt_at")
  WHERE "status" = 'queued' OR "push_status" = 'queued';
--> statement-breakpoint

-- Browser push subscriptions (Web Push / VAPID). One row per browser.
CREATE TABLE "push_subscription" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_success_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscription_endpoint_uq" ON "push_subscription" ("endpoint");
--> statement-breakpoint
CREATE INDEX "push_subscription_user_idx" ON "push_subscription" ("user_id");
--> statement-breakpoint

-- Per-user channel preferences; {} = everything on. Security notices always email.
ALTER TABLE "user" ADD COLUMN "notify_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL;
