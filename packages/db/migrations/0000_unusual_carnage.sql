CREATE TYPE "public"."ai_role" AS ENUM('user', 'assistant', 'tool');--> statement-breakpoint
CREATE TYPE "public"."asset" AS ENUM('ETB', 'XAU', 'XPT');--> statement-breakpoint
CREATE TYPE "public"."compliance_action" AS ENUM('flag', 'freeze', 'review');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('requested', 'reviewing', 'approved', 'scheduled', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."kyc_doc_type" AS ENUM('fayda', 'passport', 'driving_licence', 'kebele_id');--> statement-breakpoint
CREATE TYPE "public"."kyc_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('am', 'en');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."order_side" AS ENUM('buy', 'sell');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('created', 'review', 'settled', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."owner_type" AS ENUM('user', 'system');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('initiated', 'webhook_received', 'verified', 'credited', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('requested', 'approved', 'processing', 'settled', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('open', 'consumed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'administrator', 'compliance', 'finance');--> statement-breakpoint
CREATE TYPE "public"."txn_kind" AS ENUM('deposit', 'buy', 'sell', 'withdrawal', 'treasury');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'frozen');--> statement-breakpoint
CREATE TYPE "public"."vault_kind" AS ENUM('intake', 'outtake');--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" "owner_type" NOT NULL,
	"user_id" uuid,
	"system_name" text,
	"asset" "asset" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "ai_role" NOT NULL,
	"content" text NOT NULL,
	"tool_calls" jsonb,
	"tokens_in" integer,
	"tokens_out" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "badge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name_en" text NOT NULL,
	"name_am" text NOT NULL,
	"criteria" jsonb,
	CONSTRAINT "badge_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "compliance_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"rule_key" text NOT NULL,
	"evidence" jsonb,
	"action" "compliance_action" NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"asset" "asset" NOT NULL,
	"grams_mg" bigint NOT NULL,
	"eligibility_snapshot" jsonb,
	"status" "delivery_status" DEFAULT 'requested' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"commission_pct_milli" integer NOT NULL,
	"service_fee_cents" bigint NOT NULL,
	"tax_pct_milli" integer NOT NULL,
	"reforest_pct_milli" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "freeze" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"lifted_by" uuid,
	"lifted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holding_tier_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"rank" integer NOT NULL,
	"max_usd" integer,
	"per_txn_cap_cents" bigint,
	"daily_cap_cents" bigint,
	"delivery_eligible" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kyc_submission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"doc_type" "kyc_doc_type" NOT NULL,
	"file_ref" text NOT NULL,
	"status" "kyc_status" DEFAULT 'pending' NOT NULL,
	"reviewer_id" uuid,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ledger_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"asset" "asset" NOT NULL,
	"amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "txn_kind" NOT NULL,
	"order_id" uuid,
	"payment_id" uuid,
	"payout_id" uuid,
	"initiated_by" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"channel" text DEFAULT 'email' NOT NULL,
	"template" text NOT NULL,
	"payload" jsonb,
	"status" "notification_status" DEFAULT 'queued' NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"side" "order_side" NOT NULL,
	"asset" "asset" NOT NULL,
	"status" "order_status" DEFAULT 'created' NOT NULL,
	"idempotency_key" text NOT NULL,
	"ledger_transaction_id" uuid,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"chapa_tx_ref" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"status" "payment_status" DEFAULT 'initiated' NOT NULL,
	"raw_webhook" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"credited_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payout" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"status" "payout_status" DEFAULT 'requested' NOT NULL,
	"approved_by" uuid,
	"chapa_transfer_ref" text,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "price_tick" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset" "asset" NOT NULL,
	"usd_per_oz_micro" bigint NOT NULL,
	"etb_rate_micro" bigint NOT NULL,
	"etb_cents_per_gram" bigint NOT NULL,
	"source" text NOT NULL,
	"fx_source" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"side" "order_side" NOT NULL,
	"asset" "asset" NOT NULL,
	"grams_mg" bigint NOT NULL,
	"price_tick_id" uuid NOT NULL,
	"unit_etb_cents_per_gram" bigint NOT NULL,
	"subtotal_cents" bigint NOT NULL,
	"fee_cents" bigint NOT NULL,
	"tax_cents" bigint NOT NULL,
	"total_cents" bigint NOT NULL,
	"status" "quote_status" DEFAULT 'open' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treasury_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"float_target_cents" bigint NOT NULL,
	"halt_threshold_cents" bigint NOT NULL,
	"daily_sellback_ceiling_cents" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_badge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"badge_id" uuid NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"locale" "locale" DEFAULT 'am' NOT NULL,
	"role" "role" DEFAULT 'user' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"kyc_tier" integer DEFAULT 0 NOT NULL,
	"holding_tier" text,
	"refresh_token_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vault_holding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset" "asset" NOT NULL,
	"kind" "vault_kind" NOT NULL,
	"grams_mg" bigint NOT NULL,
	"reference" text NOT NULL,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversation" ADD CONSTRAINT "ai_conversation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_message" ADD CONSTRAINT "ai_message_conversation_id_ai_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_event" ADD CONSTRAINT "compliance_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_event" ADD CONSTRAINT "compliance_event_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_request" ADD CONSTRAINT "delivery_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "freeze" ADD CONSTRAINT "freeze_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "freeze" ADD CONSTRAINT "freeze_lifted_by_user_id_fk" FOREIGN KEY ("lifted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_submission" ADD CONSTRAINT "kyc_submission_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_submission" ADD CONSTRAINT "kyc_submission_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_transaction_id_ledger_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."ledger_transaction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transaction" ADD CONSTRAINT "ledger_transaction_initiated_by_user_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_quote_id_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quote"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_ledger_transaction_id_ledger_transaction_id_fk" FOREIGN KEY ("ledger_transaction_id") REFERENCES "public"."ledger_transaction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout" ADD CONSTRAINT "payout_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout" ADD CONSTRAINT "payout_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_price_tick_id_price_tick_id_fk" FOREIGN KEY ("price_tick_id") REFERENCES "public"."price_tick"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badge" ADD CONSTRAINT "user_badge_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badge" ADD CONSTRAINT "user_badge_badge_id_badge_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badge"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_holding" ADD CONSTRAINT "vault_holding_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_user_asset_uq" ON "account" USING btree ("user_id","asset") WHERE "account"."owner_type" = 'user';--> statement-breakpoint
CREATE UNIQUE INDEX "account_system_uq" ON "account" USING btree ("system_name") WHERE "account"."owner_type" = 'system';--> statement-breakpoint
CREATE INDEX "account_asset_idx" ON "account" USING btree ("asset");--> statement-breakpoint
CREATE INDEX "ai_conv_user_idx" ON "ai_conversation" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_msg_conv_idx" ON "ai_message" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "ce_user_idx" ON "compliance_event" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ce_rule_idx" ON "compliance_event" USING btree ("rule_key");--> statement-breakpoint
CREATE INDEX "delivery_user_idx" ON "delivery_request" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "freeze_user_idx" ON "freeze" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tier_name_uq" ON "holding_tier_config" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "tier_rank_uq" ON "holding_tier_config" USING btree ("rank");--> statement-breakpoint
CREATE INDEX "kyc_user_idx" ON "kyc_submission" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "kyc_status_idx" ON "kyc_submission" USING btree ("status");--> statement-breakpoint
CREATE INDEX "le_account_idx" ON "ledger_entry" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "le_txn_idx" ON "ledger_entry" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "le_created_idx" ON "ledger_entry" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ltx_kind_idx" ON "ledger_transaction" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "ltx_created_idx" ON "ledger_transaction" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notif_user_idx" ON "notification" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notif_status_idx" ON "notification" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "order_idem_uq" ON "order" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "order_user_idx" ON "order" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "order_status_idx" ON "order" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_txref_uq" ON "payment" USING btree ("chapa_tx_ref");--> statement-breakpoint
CREATE INDEX "payment_user_idx" ON "payment" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payout_user_idx" ON "payout" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payout_status_idx" ON "payout" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tick_asset_at_idx" ON "price_tick" USING btree ("asset","at");--> statement-breakpoint
CREATE INDEX "quote_user_idx" ON "quote" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "quote_expires_idx" ON "quote" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_badge_uq" ON "user_badge" USING btree ("user_id","badge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_uq" ON "user" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "vault_asset_idx" ON "vault_holding" USING btree ("asset");