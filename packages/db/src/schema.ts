import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { Locale } from "@alkeva/shared";

/** drizzle has no built-in bytea; KYC documents are stored in-row (≤2 MB). */
const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/**
 * ALKEVA schema — Design §3 (docs/System_Design_and_Architecture.md).
 * Money rules: ETB in cents (bigint), metal in milligrams (bigint).
 * ledger_entry and audit_log are append-only — enforced by triggers in
 * migrations/0001_append_only_and_zero_sum.sql, not just by convention.
 */

// ── Enums ─────────────────────────────────────────────────────────
export const assetEnum = pgEnum("asset", ["ETB", "XAU", "XPT"]);
export const roleEnum = pgEnum("role", ["user", "administrator", "compliance", "finance"]);
export const userStatusEnum = pgEnum("user_status", ["active", "frozen"]);
/**
 * Locale is plain text, not a pgEnum (migration 0009). Ethiopia has many
 * working languages and the product intends to keep adding them; widening a
 * Postgres enum needs a migration per language and `ALTER TYPE … ADD VALUE`
 * cannot be used in the same transaction that writes it. The allowed set lives
 * in `@alkeva/shared` LOCALES and is enforced by zod at the API boundary, so a
 * new language is a translation file and nothing else.
 */
export const ownerTypeEnum = pgEnum("owner_type", ["user", "system"]);
export const txnKindEnum = pgEnum("txn_kind", [
  "deposit",
  "buy",
  "sell",
  "withdrawal",
  "treasury",
]);
export const orderSideEnum = pgEnum("order_side", ["buy", "sell"]);
export const orderStatusEnum = pgEnum("order_status", [
  "created",
  "review",
  "settled",
  "rejected",
]);
export const quoteStatusEnum = pgEnum("quote_status", ["open", "consumed", "expired"]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "initiated",
  "webhook_received",
  "verified",
  "credited",
  "failed",
]);
export const payoutStatusEnum = pgEnum("payout_status", [
  "requested",
  "approved",
  "processing",
  "settled",
  "rejected",
]);
export const kycStatusEnum = pgEnum("kyc_status", ["pending", "approved", "rejected"]);
export const kycDocTypeEnum = pgEnum("kyc_doc_type", [
  "fayda",
  "passport",
  "driving_licence",
  "kebele_id",
]);
export const vaultKindEnum = pgEnum("vault_kind", ["intake", "outtake"]);
export const complianceActionEnum = pgEnum("compliance_action", ["flag", "freeze", "review"]);
export const deliveryStatusEnum = pgEnum("delivery_status", [
  "requested",
  "reviewing",
  "approved",
  "scheduled",
  "rejected",
]);
export const notificationStatusEnum = pgEnum("notification_status", [
  "queued",
  "sent",
  "failed",
]);
export const aiRoleEnum = pgEnum("ai_role", ["user", "assistant", "tool"]);
export const alertDirectionEnum = pgEnum("alert_direction", ["above", "below"]);

// ── Identity ──────────────────────────────────────────────────────
export const users = pgTable(
  "user",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    /** NULL for provider-only accounts (Google sign-in, migration 0006) —
        they gain a password through the reset flow, never through login. */
    passwordHash: text("password_hash"),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    locale: text("locale").notNull().default("am").$type<Locale>(),
    role: roleEnum("role").notNull().default("user"),
    status: userStatusEnum("status").notNull().default("active"),
    kycTier: integer("kyc_tier").notNull().default(0),
    /** Cached holding tier name; authoritative value recomputed from holdings. */
    holdingTier: text("holding_tier"),
    refreshTokenHash: text("refresh_token_hash"),
    /** When the user accepted terms+privacy at registration (migration 0005).
        NULL for accounts that predate the consent gate — grandfathered. */
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("user_email_uq").on(sql`lower(${t.email})`)],
);

/**
 * Password reset tokens (migration 0005). Only the sha256 of the raw token is
 * stored — a database leak must not mint working reset links. 30-minute TTL,
 * single use (used_at), and issuing a new token invalidates prior unused ones.
 */
export const passwordResetTokens = pgTable(
  "password_reset_token",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("prt_user_idx").on(t.userId)],
);

/**
 * External identity providers (migration 0006). One row per (provider, sub);
 * a user may hold both a password and a Google identity. The API issues its
 * own JWT/refresh cookies either way — the provider only proves the email.
 */
export const authIdentities = pgTable(
  "auth_identity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    provider: text("provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("auth_identity_provider_uq").on(t.provider, t.providerUserId),
    index("auth_identity_user_idx").on(t.userId),
  ],
);

/**
 * WebAuthn/passkey credentials (migration 0007). credential_id is base64url;
 * the signature counter is checked and advanced on every assertion (a cloned
 * authenticator replays an old counter and is refused).
 */
export const webauthnCredentials = pgTable(
  "webauthn_credential",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    credentialId: text("credential_id").notNull().unique(),
    publicKey: bytea("public_key").notNull(),
    counter: bigint("counter", { mode: "bigint" }).notNull().default(sql`0`),
    /** JSON array string of transports ("internal", "hybrid", …). */
    transports: text("transports"),
    deviceType: text("device_type"),
    backedUp: boolean("backed_up").notNull().default(false),
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [index("webauthn_user_idx").on(t.userId)],
);

export const kycSubmissions = pgTable(
  "kyc_submission",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    docType: kycDocTypeEnum("doc_type").notNull(),
    fileRef: text("file_ref").notNull(),
    /** The document itself, in-row (migration 0004); ≤2 MB enforced at the API. */
    fileData: bytea("file_data"),
    fileMime: text("file_mime"),
    status: kycStatusEnum("status").notNull().default("pending"),
    reviewerId: uuid("reviewer_id").references(() => users.id),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [index("kyc_user_idx").on(t.userId), index("kyc_status_idx").on(t.status)],
);

// ── Ledger core ───────────────────────────────────────────────────
export const accounts = pgTable(
  "account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerType: ownerTypeEnum("owner_type").notNull(),
    userId: uuid("user_id").references(() => users.id),
    systemName: text("system_name"),
    asset: assetEnum("asset").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("account_user_asset_uq")
      .on(t.userId, t.asset)
      .where(sql`${t.ownerType} = 'user'`),
    uniqueIndex("account_system_uq")
      .on(t.systemName)
      .where(sql`${t.ownerType} = 'system'`),
    index("account_asset_idx").on(t.asset),
  ],
);

export const ledgerTransactions = pgTable(
  "ledger_transaction",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: txnKindEnum("kind").notNull(),
    orderId: uuid("order_id"),
    paymentId: uuid("payment_id"),
    payoutId: uuid("payout_id"),
    initiatedBy: uuid("initiated_by").references(() => users.id),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ltx_kind_idx").on(t.kind), index("ltx_created_idx").on(t.createdAt)],
);

export const ledgerEntries = pgTable(
  "ledger_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => ledgerTransactions.id),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    asset: assetEnum("asset").notNull(),
    /** Signed. ETB → cents, metals → milligrams. */
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("le_account_idx").on(t.accountId),
    index("le_txn_idx").on(t.transactionId),
    index("le_created_idx").on(t.createdAt),
  ],
);

// ── Trading ───────────────────────────────────────────────────────
export const priceTicks = pgTable(
  "price_tick",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    asset: assetEnum("asset").notNull(),
    /** USD per troy ounce × 1e6 (integer micro-units). */
    usdPerOzMicro: bigint("usd_per_oz_micro", { mode: "bigint" }).notNull(),
    /** USD→ETB rate × 1e6. */
    etbRateMicro: bigint("etb_rate_micro", { mode: "bigint" }).notNull(),
    /** Derived: ETB cents per gram (integer, display/quote-ready). */
    etbCentsPerGram: bigint("etb_cents_per_gram", { mode: "bigint" }).notNull(),
    source: text("source").notNull(),
    fxSource: text("fx_source").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tick_asset_at_idx").on(t.asset, t.at)],
);

export const quotes = pgTable(
  "quote",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    side: orderSideEnum("side").notNull(),
    asset: assetEnum("asset").notNull(),
    gramsMg: bigint("grams_mg", { mode: "bigint" }).notNull(),
    priceTickId: uuid("price_tick_id")
      .notNull()
      .references(() => priceTicks.id),
    unitEtbCentsPerGram: bigint("unit_etb_cents_per_gram", { mode: "bigint" }).notNull(),
    subtotalCents: bigint("subtotal_cents", { mode: "bigint" }).notNull(),
    feeCents: bigint("fee_cents", { mode: "bigint" }).notNull(),
    taxCents: bigint("tax_cents", { mode: "bigint" }).notNull(),
    reforestCents: bigint("reforest_cents", { mode: "bigint" }).notNull().default(sql`0`),
    totalCents: bigint("total_cents", { mode: "bigint" }).notNull(),
    status: quoteStatusEnum("status").notNull().default("open"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("quote_user_idx").on(t.userId), index("quote_expires_idx").on(t.expiresAt)],
);

export const orders = pgTable(
  "order",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    side: orderSideEnum("side").notNull(),
    asset: assetEnum("asset").notNull(),
    status: orderStatusEnum("status").notNull().default("created"),
    idempotencyKey: text("idempotency_key").notNull(),
    ledgerTransactionId: uuid("ledger_transaction_id").references(
      () => ledgerTransactions.id,
    ),
    failureReason: text("failure_reason"),
    /**
     * Receipt number (F12). Allocated from `receipt_serial_seq` when the order
     * settles — NULL for created/review/rejected, because only a settled order
     * has a receipt. Migration 0003.
     */
    receiptSerial: bigint("receipt_serial", { mode: "bigint" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("order_idem_uq").on(t.idempotencyKey),
    uniqueIndex("order_receipt_serial_uq").on(t.receiptSerial),
    index("order_user_idx").on(t.userId),
    index("order_status_idx").on(t.status),
  ],
);

// ── Config tables (seeded from env — Decisions A1/A2/A3) ─────────
export const feeConfig = pgTable("fee_config", {
  id: integer("id").primaryKey().default(1),
  commissionPctMilli: integer("commission_pct_milli").notNull(), // 2.0% → 2000
  serviceFeeCents: bigint("service_fee_cents", { mode: "bigint" }).notNull(),
  taxPctMilli: integer("tax_pct_milli").notNull(),
  reforestPctMilli: integer("reforest_pct_milli").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const treasuryConfig = pgTable("treasury_config", {
  id: integer("id").primaryKey().default(1),
  floatTargetCents: bigint("float_target_cents", { mode: "bigint" }).notNull(),
  haltThresholdCents: bigint("halt_threshold_cents", { mode: "bigint" }).notNull(),
  dailySellbackCeilingCents: bigint("daily_sellback_ceiling_cents", {
    mode: "bigint",
  }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const holdingTierConfig = pgTable(
  "holding_tier_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    rank: integer("rank").notNull(),
    /** Band upper bound in USD reference; null = unbounded top tier. */
    maxUsd: integer("max_usd"),
    perTxnCapCents: bigint("per_txn_cap_cents", { mode: "bigint" }),
    dailyCapCents: bigint("daily_cap_cents", { mode: "bigint" }),
    deliveryEligible: boolean("delivery_eligible").notNull().default(false),
  },
  (t) => [uniqueIndex("tier_name_uq").on(t.name), uniqueIndex("tier_rank_uq").on(t.rank)],
);

// ── Money in/out ──────────────────────────────────────────────────
export const payments = pgTable(
  "payment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    chapaTxRef: text("chapa_tx_ref").notNull(),
    amountCents: bigint("amount_cents", { mode: "bigint" }).notNull(),
    status: paymentStatusEnum("status").notNull().default("initiated"),
    rawWebhook: jsonb("raw_webhook"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    creditedAt: timestamp("credited_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("payment_txref_uq").on(t.chapaTxRef), index("payment_user_idx").on(t.userId)],
);

export const payouts = pgTable(
  "payout",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    amountCents: bigint("amount_cents", { mode: "bigint" }).notNull(),
    status: payoutStatusEnum("status").notNull().default("requested"),
    /** Chapa transfer destination (migration 0004): code from GET /v1/banks. */
    bankCode: integer("bank_code").notNull(),
    accountNumber: text("account_number").notNull(),
    accountName: text("account_name").notNull(),
    /** Namespaced `${userId}:${clientKey}` — one hold per double-submit. */
    idempotencyKey: text("idempotency_key").notNull(),
    approvedBy: uuid("approved_by").references(() => users.id),
    chapaTransferRef: text("chapa_transfer_ref"),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("payout_idem_uq").on(t.idempotencyKey),
    index("payout_user_idx").on(t.userId),
    index("payout_status_idx").on(t.status),
  ],
);

// ── Inventory & treasury ──────────────────────────────────────────
export const vaultHoldings = pgTable(
  "vault_holding",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    asset: assetEnum("asset").notNull(),
    kind: vaultKindEnum("kind").notNull(),
    gramsMg: bigint("grams_mg", { mode: "bigint" }).notNull(),
    reference: text("reference").notNull(),
    recordedBy: uuid("recorded_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("vault_asset_idx").on(t.asset)],
);

// ── Compliance & audit ────────────────────────────────────────────
export const complianceEvents = pgTable(
  "compliance_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    ruleKey: text("rule_key").notNull(),
    evidence: jsonb("evidence"),
    action: complianceActionEnum("action").notNull(),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ce_user_idx").on(t.userId), index("ce_rule_idx").on(t.ruleKey)],
);

export const freezes = pgTable(
  "freeze",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    reason: text("reason").notNull(),
    createdBy: text("created_by").notNull(), // 'rules-engine' or a staff user id
    liftedBy: uuid("lifted_by").references(() => users.id),
    liftedAt: timestamp("lifted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("freeze_user_idx").on(t.userId)],
);

export const auditLogs = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id),
    actorLabel: text("actor_label").notNull(), // email or 'system'/'rules-engine'
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_actor_idx").on(t.actorId), index("audit_action_idx").on(t.action)],
);

// ── Delivery, badges, AI, notifications ───────────────────────────
export const deliveryRequests = pgTable(
  "delivery_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    asset: assetEnum("asset").notNull(),
    gramsMg: bigint("grams_mg", { mode: "bigint" }).notNull(),
    eligibilitySnapshot: jsonb("eligibility_snapshot"),
    status: deliveryStatusEnum("status").notNull().default("requested"),
    /** Contact + review fields (migration 0008) — the request workflow.
        This table records intent; it never posts ledger entries. The metal
        handover ledger movement is the fulfilment step, out of scope here. */
    contactPhone: text("contact_phone"),
    address: text("address"),
    note: text("note"),
    reviewerId: uuid("reviewer_id").references(() => users.id),
    reviewNote: text("review_note"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("delivery_user_idx").on(t.userId), index("delivery_status_idx").on(t.status)],
);

export const badges = pgTable("badge", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  nameEn: text("name_en").notNull(),
  nameAm: text("name_am").notNull(),
  criteria: jsonb("criteria"),
});

export const userBadges = pgTable(
  "user_badge",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    badgeId: uuid("badge_id")
      .notNull()
      .references(() => badges.id),
    awardedAt: timestamp("awarded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("user_badge_uq").on(t.userId, t.badgeId)],
);

export const aiConversations = pgTable(
  "ai_conversation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_conv_user_idx").on(t.userId)],
);

export const aiMessages = pgTable(
  "ai_message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => aiConversations.id),
    role: aiRoleEnum("role").notNull(),
    content: text("content").notNull(),
    toolCalls: jsonb("tool_calls"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_msg_conv_idx").on(t.conversationId)],
);

/**
 * Price alerts (F24) — deterministic worker threshold checks, one-shot.
 * `triggered_at` set = fired; users re-arm by creating a new alert.
 */
export const priceAlerts = pgTable(
  "price_alert",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    asset: assetEnum("asset").notNull(),
    direction: alertDirectionEnum("direction").notNull(),
    thresholdCentsPerGram: bigint("threshold_cents_per_gram", { mode: "bigint" }).notNull(),
    active: boolean("active").notNull().default(true),
    triggeredAt: timestamp("triggered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("alert_user_idx").on(t.userId),
    index("alert_pending_idx")
      .on(t.asset)
      .where(sql`${t.active} and ${t.triggeredAt} is null`),
  ],
);

export const notifications = pgTable(
  "notification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    channel: text("channel").notNull().default("email"),
    template: text("template").notNull(),
    payload: jsonb("payload"),
    status: notificationStatusEnum("status").notNull().default("queued"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notif_user_idx").on(t.userId), index("notif_status_idx").on(t.status)],
);
