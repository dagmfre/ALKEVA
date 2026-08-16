-- Delivery request workflow (spec F18; production stage).
--
-- The table existed schema-only since Phase 1. These columns carry the
-- request's contact details and the officer's decision. delivery_request
-- records INTENT — it never posts ledger entries; the metal handover ledger
-- movement is the physical fulfilment step, deliberately out of scope.

ALTER TABLE "delivery_request" ADD COLUMN "contact_phone" text;
--> statement-breakpoint
ALTER TABLE "delivery_request" ADD COLUMN "address" text;
--> statement-breakpoint
ALTER TABLE "delivery_request" ADD COLUMN "note" text;
--> statement-breakpoint
ALTER TABLE "delivery_request" ADD COLUMN "reviewer_id" uuid;
--> statement-breakpoint
ALTER TABLE "delivery_request" ADD CONSTRAINT "delivery_request_reviewer_id_user_id_fk"
  FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "delivery_request" ADD COLUMN "review_note" text;
--> statement-breakpoint
ALTER TABLE "delivery_request" ADD COLUMN "reviewed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "delivery_request" ADD COLUMN "scheduled_for" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX "delivery_status_idx" ON "delivery_request" ("status");
