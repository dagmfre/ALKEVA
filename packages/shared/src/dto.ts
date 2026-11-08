import { z } from "zod";
import { METAL_ASSETS, ORDER_SIDES } from "./constants.js";
import type { Asset, MetalAsset, OrderSide, PriceRange, Role } from "./constants.js";
import { DEFAULT_LOCALE, LOCALES } from "./locales.js";
import type { Locale } from "./locales.js";

// ── Auth ──────────────────────────────────────────────────────────
export const registerDto = z.object({
  email: z.string().email(),
  password: z.string().min(10).max(128),
  fullName: z.string().min(2).max(120),
  locale: z.enum(LOCALES).default(DEFAULT_LOCALE),
  /** Terms+privacy consent is a hard gate: literal true, not a boolean —
      an unchecked box must fail validation, not save `false`. */
  acceptTerms: z.literal(true),
});
export type RegisterDto = z.infer<typeof registerDto>;

export const loginDto = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginDto = z.infer<typeof loginDto>;

export interface MeResponse {
  id: string;
  email: string;
  fullName: string;
  locale: Locale;
  role: Role;
  status: "active" | "frozen";
  kycTier: number;
  /** Confirmed with an emailed code — money endpoints require it. */
  emailVerified: boolean;
  /** A verified Fayda (national ID) identity is on file. */
  identityVerified: boolean;
  hasPassword: boolean;
}

/** What the sign-in and verification screens may offer (AUTH_METHODS / KYC_METHODS). */
export interface ProvidersResponse {
  fayda: boolean;
  password: boolean;
  google: boolean;
  passkey: boolean;
  /** Same as `passkey` — kept for screens written before Phase 10. */
  webauthn: boolean;
  kyc: { fayda: boolean; document: boolean };
  /** Telegram Mini App sign-in (Phase 11). Null fields = not configured. */
  telegram: {
    enabled: boolean;
    botUsername: string | null;
    appShortName: string | null;
    /** The Mini App's own origin, e.g. https://tg.allkeva.com. */
    origin: string | null;
  };
}

/** One signed-in device (Account › Signed-in devices). */
export interface SessionItem {
  id: string;
  userAgent: string | null;
  ip: string | null;
  amr: string[];
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

/** The part of a verified Fayda profile shown on "Complete your account". */
export interface FaydaProfileSummary {
  name: string;
  email: string | null;
}

export type FaydaCallbackResponse =
  | { status: "signed_in"; user: MeResponse }
  | { status: "linked"; user: MeResponse }
  /** Telegram handoff: verified here, confirmed back inside the Mini App. */
  | { status: "handoff_parked"; returnUrl: string | null }
  | { status: "needs_profile"; token: string; profile: FaydaProfileSummary };

export const faydaCompleteDto = z.object({
  token: z.string().min(16).max(128),
  email: z.string().email().max(254),
  locale: z.enum(LOCALES).default(DEFAULT_LOCALE),
  acceptTerms: z.literal(true),
});
export type FaydaCompleteDto = z.infer<typeof faydaCompleteDto>;

// ── Prices ────────────────────────────────────────────────────────
export interface PriceLatestResponse {
  asset: Asset;
  /** ETB per gram, in cents — integer, display-ready after /100. */
  etbCentsPerGram: string;
  usdPerOzMicro: string;
  fxRateMicro: string;
  source: string;
  fxSource: string;
  at: string; // ISO timestamp of the tick
  stale: boolean;
  /**
   * Canonical 24h change in milli-percent: (latest − ref24h) × 100_000 / ref24h,
   * where ref24h is the newest raw tick at least 24h old (oldest tick when the
   * dataset is younger). Null when no distinct reference exists. Every surface
   * (ticker, cards, AI) renders THIS number — never a bucket-derived change.
   */
  change24hPctMilli: string | null;
}

/** One payload carrying every metal — what the SSE stream pushes and the poll fallback fetches. */
export interface PriceSnapshotResponse {
  prices: PriceLatestResponse[];
  at: string; // server time the snapshot was assembled
}

export interface PricePointDto {
  at: string;
  etbCentsPerGram: string;
}

export interface PriceHistoryResponse {
  asset: Asset;
  range: PriceRange;
  points: PricePointDto[];
}

/** One leg of the double-entry pair behind an order. */
export interface LedgerLegDto {
  /** "you" for the signed-in user's own account, else the system account name. */
  account: string;
  owner: "user" | "system";
  asset: Asset;
  /** Signed integer: ETB in cents, metals in milligrams. */
  amount: string;
}

/** Per-asset zero-sum: every asset touched must net to exactly zero. */
export interface LedgerBalanceCheckDto {
  asset: Asset;
  sum: string;
  balanced: boolean;
}

/**
 * The record behind one settled order, assembled from the rows themselves —
 * the ledger legs, the quote that locked the price, and the tick the quote was
 * struck against. Nothing here is a summary of policy; it is the evidence.
 */
export interface OrderProofResponse {
  orderId: string;
  serial: string;
  side: OrderSide;
  asset: MetalAsset;
  gramsMg: string;
  settledAt: string;
  ledgerTransactionId: string | null;
  /** Legs vary in count: zero-amount entries are never posted, so a zero-tax
      buy has fewer legs than one carrying tax and reforestation. */
  legs: LedgerLegDto[];
  checks: LedgerBalanceCheckDto[];
  /** True only when every asset touched nets to zero. */
  balanced: boolean;
  quote: {
    id: string;
    unitEtbCentsPerGram: string;
    subtotalCents: string;
    feeCents: string;
    taxCents: string;
    reforestCents: string;
    totalCents: string;
    createdAt: string;
    expiresAt: string;
  };
  price: {
    source: string;
    fxSource: string;
    usdPerOzMicro: string;
    etbRateMicro: string;
    at: string;
  };
}

// ── Health ────────────────────────────────────────────────────────
export interface HealthResponse {
  ok: boolean;
  db: "ok" | "down";
  redis: "ok" | "down";
  priceFeed: "ok" | "stale" | "empty";
  latestTickAgeSec: number | null;
}

// ── Trading (Phase 2) ─────────────────────────────────────────────
// Wire format: every money amount is a base-10 digit string (bigint-safe).
// At most 15 digits: far above any real amount, far below int8's 9.2e18, so a
// hostile 30-digit value is a 400 instead of a database overflow 500.
const bigintString = z
  .string()
  .regex(/^[0-9]{1,15}$/)
  .transform(BigInt);

export const createQuoteDto = z
  .object({
    side: z.enum(ORDER_SIDES),
    asset: z.enum(METAL_ASSETS),
    /** Milligrams of metal — exactly one of gramsMg | etbCents. */
    gramsMg: bigintString.optional(),
    /** ETB spend in cents — exactly one of gramsMg | etbCents. */
    etbCents: bigintString.optional(),
  })
  .refine((d) => (d.gramsMg === undefined) !== (d.etbCents === undefined), {
    message: "exactly_one_amount",
  });
export type CreateQuoteDto = z.infer<typeof createQuoteDto>;

export interface QuoteResponse {
  id: string;
  side: OrderSide;
  asset: MetalAsset;
  gramsMg: string;
  unitEtbCentsPerGram: string;
  subtotalCents: string;
  feeCents: string;
  taxCents: string;
  reforestCents: string;
  totalCents: string;
  status: "open" | "consumed" | "expired";
  expiresAt: string; // ISO
  priceAt: string; // ISO timestamp of the referenced tick
}

export const createOrderDto = z.object({
  quoteId: z.string().uuid(),
  /** Client part only — the server namespaces it `${userId}:${key}`. */
  idempotencyKey: z.string().min(8).max(64),
});
export type CreateOrderDto = z.infer<typeof createOrderDto>;

export interface OrderResponse {
  id: string;
  quoteId: string;
  side: OrderSide;
  asset: MetalAsset;
  status: "created" | "review" | "settled" | "rejected";
  failureReason: string | null;
  ledgerTransactionId: string | null;
  gramsMg: string;
  totalCents: string;
  createdAt: string;
  settledAt: string | null;
}

export interface BalancesResponse {
  etbCents: string;
  xauMg: string;
  xptMg: string;
}

// ── Treasury entries (Phase 10): real vault stock and capital ─────

export const treasuryVaultEntryDto = z.object({
  asset: z.enum(METAL_ASSETS),
  kind: z.enum(["intake", "outtake"]),
  gramsMg: z
    .string()
    .regex(/^[0-9]{1,15}$/)
    .transform(BigInt)
    .refine((v) => v > 0n),
  /** Bar serial(s) + assay certificate reference — what an auditor checks. */
  reference: z.string().trim().min(3).max(300),
});
export type TreasuryVaultEntryDto = z.infer<typeof treasuryVaultEntryDto>;

export const treasuryCapitalEntryDto = z.object({
  direction: z.enum(["in", "out"]),
  amountCents: z
    .string()
    .regex(/^[0-9]{1,15}$/)
    .transform(BigInt)
    .refine((v) => v > 0n),
  /** Bank / Chapa reference for the transfer. */
  reference: z.string().trim().min(3).max(300),
});
export type TreasuryCapitalEntryDto = z.infer<typeof treasuryCapitalEntryDto>;

export interface TreasuryEntriesResponse {
  vault: {
    id: string;
    asset: MetalAsset;
    kind: "intake" | "outtake";
    gramsMg: string;
    reference: string;
    createdAt: string;
  }[];
  capital: {
    id: string;
    direction: "in" | "out";
    amountCents: string;
    reference: string;
    createdAt: string;
  }[];
}

export interface TreasuryReserveDto {
  asset: MetalAsset;
  /** SUM(vault_holding intake − outtake). */
  physicalMg: string;
  /** Grams currently owed to users: max(0, −balance(system:vault:asset)). */
  issuedMg: string;
  /** What buys can still take: physicalMg + vault ledger balance. */
  availableMg: string;
  /** physical/issued × 100_000 (milli-percent); null while nothing issued. */
  reserveRatioPctMilli: string | null;
}

// ── Portfolio, history, receipts (Phase 3) ────────────────────────
// All read-only projections. Money stays a digit string on the wire; signed
// values (gain/loss) may carry a leading "-".

export type OrderStatus = "created" | "review" | "settled" | "rejected";

export interface HoldingDto {
  asset: MetalAsset;
  gramsMg: string;
  /** Live mark: gramsMg × latest unit price, floored to cents. */
  valueCents: string;
  /** Weighted-average acquisition cost of the grams still held, fees included. */
  costBasisCents: string;
  /** valueCents − costBasisCents. Signed. */
  gainLossCents: string;
  /** gain/cost × 100_000 (milli-percent). Signed; null when cost basis is 0. */
  gainLossPctMilli: string | null;
  unitEtbCentsPerGram: string | null;
  priceAt: string | null;
}

export interface TierDto {
  /** null until the user holds anything, or when no bands are configured. */
  name: string | null;
  rank: number | null;
  /** Total holdings expressed in USD cents — the reference the bands use. */
  holdingUsdCents: string;
  /** Upper bound of the current band, whole USD; null at the top tier. */
  bandMaxUsd: number | null;
  nextName: string | null;
  nextThresholdUsd: number | null;
  /** Progress through the current band, milli-percent; null at the top tier. */
  progressPctMilli: string | null;
  deliveryEligible: boolean;
  perTxnCapCents: string | null;
  dailyCapCents: string | null;
}

/**
 * Achievement badges — COMPUTED ON READ from data the portfolio already
 * queries; nothing is ever written. Names/criteria live in the locale files.
 */
export type BadgeKey =
  | "first_purchase"
  | "ten_trades"
  | "gold_holder"
  | "platinum_holder"
  | "early_adopter";

export interface BadgeDto {
  key: BadgeKey;
  earned: boolean;
  /** When derivable from a ledgered event (e.g. the settling order); null for state badges. */
  earnedAt: string | null;
}

/** Header profile menu: the holding tier as a game level + achievements. */
export interface ProgressResponse {
  tier: TierDto;
  totalTiers: number;
  /** What reaching the next tier changes; null at the top tier. */
  next: {
    name: string;
    perTxnCapCents: string | null;
    dailyCapCents: string | null;
    deliveryEligible: boolean;
  } | null;
  badges: BadgeDto[];
}

/** The wallet "cart": balances plus everything still in flight. */
export interface WalletPendingItem {
  kind: "withdrawal" | "deposit" | "delivery";
  id: string;
  status: string;
  amountCents: string | null;
  asset: MetalAsset | null;
  gramsMg: string | null;
  createdAt: string;
}

export interface WalletResponse {
  etbCents: string;
  xauMg: string;
  xptMg: string;
  pending: WalletPendingItem[];
  pendingCount: number;
}

export interface PortfolioResponse {
  etbCents: string;
  holdings: HoldingDto[];
  totalMetalValueCents: string;
  /** etbCents + totalMetalValueCents. */
  totalValueCents: string;
  totalCostBasisCents: string;
  totalGainLossCents: string;
  totalGainLossPctMilli: string | null;
  tier: TierDto;
  badges: BadgeDto[];
  asOf: string;
}

export const listOrdersDto = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  /** Keyset cursor: return orders created strictly before this ISO instant. */
  before: z.string().datetime().optional(),
});
export type ListOrdersDto = z.infer<typeof listOrdersDto>;

export interface OrderListItem {
  id: string;
  side: OrderSide;
  asset: MetalAsset;
  status: OrderStatus;
  failureReason: string | null;
  gramsMg: string;
  unitEtbCentsPerGram: string;
  totalCents: string;
  /** Present only on settled orders — the receipt number. */
  receiptSerial: string | null;
  createdAt: string;
  settledAt: string | null;
}

export interface OrderListResponse {
  orders: OrderListItem[];
  /** Pass back as `before` for the next page; null when the list is exhausted. */
  nextCursor: string | null;
}

export interface ReceiptResponse {
  orderId: string;
  /** Display form, e.g. "ALK-2026-000148". */
  serial: string;
  serialNumber: string;
  side: OrderSide;
  asset: MetalAsset;
  gramsMg: string;
  unitEtbCentsPerGram: string;
  subtotalCents: string;
  feeCents: string;
  taxCents: string;
  reforestCents: string;
  totalCents: string;
  /** The commission rate that produced feeCents, in milli-percent (2% → 2000). */
  commissionPctMilli: number;
  settledAt: string;
  ledgerTransactionId: string | null;
  /** Where the price came from — the line that makes this a receipt, not a note. */
  price: {
    source: string;
    fxSource: string;
    usdPerOzMicro: string;
    etbRateMicro: string;
    at: string;
  };
}

// ── Money in/out (Phase 4) ────────────────────────────────────────

export const createPaymentDto = z.object({
  amountCents: bigintString.refine((v) => v > 0n),
});
export type CreatePaymentDto = z.infer<typeof createPaymentDto>;

export type PaymentStatus =
  | "initiated"
  | "webhook_received"
  | "verified"
  | "credited"
  | "failed"
  | "reversed";

export interface PaymentResponse {
  id: string;
  txRef: string;
  amountCents: string;
  status: PaymentStatus;
  /** Present only on the creating response — where to send the browser. */
  checkoutUrl?: string;
  createdAt: string;
  creditedAt: string | null;
}

export interface DepositChannelsResponse {
  channels: {
    key: string;
    minInCents: string | null;
    maxInCents: string | null;
    maxOutCents: string | null;
  }[];
  minDepositCents: string;
}

/**
 * Step 1 of a withdrawal: describe it. The server checks every gate, then
 * emails a 6-digit code bound to exactly this request (Phase 10).
 */
export const payoutIntentDto = z.object({
  amountCents: bigintString.refine((v) => v > 0n),
  bankCode: z.number().int().positive(),
  accountNumber: z
    .string()
    .trim()
    .regex(/^[0-9A-Za-z+ -]{4,34}$/),
  accountName: z.string().trim().min(2).max(120),
});
export type PayoutIntentDto = z.infer<typeof payoutIntentDto>;

export interface PayoutIntentResponse {
  intentId: string;
  expiresAt: string;
  /** Masked address the code went to ("da•••@gmail.com"). */
  sentTo: string;
}

/** Step 2: the emailed code turns the intent into a held payout. */
export const confirmPayoutDto = z.object({
  intentId: z.string().uuid(),
  code: z.string().regex(/^[0-9]{6}$/),
  /** Client part only — the server namespaces it `${userId}:${key}`. */
  idempotencyKey: z.string().min(8).max(64),
});
export type ConfirmPayoutDto = z.infer<typeof confirmPayoutDto>;

/** What a payout request carries once the code has confirmed it. */
export interface PayoutRequestSpec {
  amountCents: bigint;
  bankCode: number;
  accountNumber: string;
  accountName: string;
}

export type PayoutStatus = "requested" | "approved" | "processing" | "settled" | "rejected";

export interface PayoutResponse {
  id: string;
  amountCents: string;
  status: PayoutStatus;
  bankCode: number;
  accountNumber: string;
  accountName: string;
  failureReason: string | null;
  createdAt: string;
  settledAt: string | null;
}

export interface BankDto {
  id: number;
  name: string;
  isMobileMoney: boolean;
  accountLength: number | null;
}

// ── Notifications (Phase 5.5, records written from Phase 4 on) ────

export interface NotificationItem {
  id: string;
  template: string;
  payload: Record<string, string> | null;
  status: "queued" | "sent" | "failed" | "skipped";
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: NotificationItem[];
  unreadCount: number;
  /** Pass as ?before= for the next page; null at the end. */
  nextCursor: string | null;
}

export const markReadDto = z.union([
  z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }),
  z.object({ all: z.literal(true) }),
]);
export type MarkReadDto = z.infer<typeof markReadDto>;

/** Channel preferences per category. Security notices always email. */
export interface NotifyPrefs {
  alerts: { email: boolean; push: boolean; telegram: boolean };
  money: { email: boolean; push: boolean; telegram: boolean };
  security: { push: boolean; telegram: boolean };
}

export const notifyPrefsDto = z.object({
  alerts: z
    .object({ email: z.boolean(), push: z.boolean(), telegram: z.boolean().optional() })
    .optional(),
  money: z
    .object({ email: z.boolean(), push: z.boolean(), telegram: z.boolean().optional() })
    .optional(),
  security: z.object({ push: z.boolean(), telegram: z.boolean().optional() }).optional(),
});
export type NotifyPrefsDto = z.infer<typeof notifyPrefsDto>;

export interface PushConfigResponse {
  enabled: boolean;
  publicKey: string | null;
  /** This user's browsers currently subscribed. */
  subscriptions: number;
}

export const pushSubscriptionDto = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});
export type PushSubscriptionDto = z.infer<typeof pushSubscriptionDto>;

// ── KYC (Phase 4.3) ───────────────────────────────────────────────

export const KYC_DOC_TYPES = ["fayda", "passport", "driving_licence", "kebele_id"] as const;
export type KycDocType = (typeof KYC_DOC_TYPES)[number];
export type KycStatus = "pending" | "approved" | "rejected";

export interface KycMeResponse {
  kycTier: number;
  /** Which identity checks this deployment offers (KYC_METHODS). */
  methods: { fayda: boolean; document: boolean };
  /** The verified national identity, when the user has done the Fayda check. */
  identity: { provider: "fayda"; legalName: string; verifiedAt: string } | null;
  /** Latest submission, if any. */
  submission: {
    id: string;
    docType: KycDocType;
    status: KycStatus;
    reviewNote: string | null;
    createdAt: string;
    reviewedAt: string | null;
  } | null;
}

// ── Price alerts (F24) ────────────────────────────────────────────

export const createAlertDto = z.object({
  asset: z.enum(METAL_ASSETS),
  direction: z.enum(["above", "below"]),
  thresholdCentsPerGram: bigintString.refine((v) => v > 0n),
});
export type CreateAlertDto = z.infer<typeof createAlertDto>;

export interface AlertItem {
  id: string;
  asset: MetalAsset;
  direction: "above" | "below";
  thresholdCentsPerGram: string;
  active: boolean;
  triggeredAt: string | null;
  createdAt: string;
}

export interface AlertsResponse {
  alerts: AlertItem[];
}

// ── AI assistant (Phase 5.4) ──────────────────────────────────────

export const aiChatDto = z.object({
  message: z.string().min(1).max(2000),
  conversationId: z.string().uuid().optional(),
});
export type AiChatDto = z.infer<typeof aiChatDto>;

export interface AiChatResponse {
  conversationId: string;
  reply: string;
}

export interface AiConversationResponse {
  conversationId: string | null;
  messages: {
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
  }[];
}

export interface AiConversationSummary {
  id: string;
  /** The first user message, trimmed server-side — the thread's display name. */
  title: string;
  /** Timestamp of the newest message in the thread. */
  lastAt: string;
  messageCount: number;
}

export interface AiConversationsResponse {
  conversations: AiConversationSummary[];
}

// ── Admin console (Phase 5) ───────────────────────────────────────

export interface AdminOverviewResponse {
  pendingKyc: number;
  pendingPayouts: number;
  openReviews: number;
  frozenUsers: number;
}

/** One calendar day of platform activity (UTC day buckets, zero-filled). */
export interface AdminAnalyticsPointDto {
  day: string; // YYYY-MM-DD
  /** Settled buy / sell volume, ETB cents. */
  buyCents: string;
  sellCents: string;
  settledOrders: number;
  /** Credited deposits / settled payouts, ETB cents. */
  depositCents: string;
  payoutCents: string;
  newUsers: number;
  kycSubmissions: number;
}

export interface AdminAnalyticsResponse {
  days: number;
  points: AdminAnalyticsPointDto[];
  totals: {
    tradeCents: string;
    settledOrders: number;
    depositCents: string;
    payoutCents: string;
    newUsers: number;
  };
}

// ── Revenue (the owner's P&L) ─────────────────────────────────────
//
// The platform earns exactly one thing: commission, which lands in
// `system:fees` on every settled order. Tax and reforestation are collected
// into their own accounts and are NOT the owner's money — they are reported
// separately so the two can never be read as one number.

/** One day of commission, split by the side that produced it. */
export interface AdminRevenuePointDto {
  day: string; // YYYY-MM-DD
  buyFeeCents: string;
  sellFeeCents: string;
  /** Settled trade value that day — the base the commission came from. */
  volumeCents: string;
  orders: number;
}

export interface AdminRevenueAssetDto {
  asset: MetalAsset;
  feeCents: string;
  volumeCents: string;
  orders: number;
}

export interface AdminRevenueContributorDto {
  userId: string;
  email: string;
  fullName: string;
  feeCents: string;
  orders: number;
}

/** Metal sold to customers and not yet bought back — the dealer's price risk. */
export interface AdminRevenueExposureDto {
  asset: MetalAsset;
  issuedMg: string;
  unitPriceCents: string;
  valueCents: string;
}

export interface AdminRevenueResponse {
  days: number;
  /** The rate in force right now, straight from fee_config. */
  rate: {
    commissionPctMilli: number;
    serviceFeeCents: string;
    taxPctMilli: number;
    reforestPctMilli: number;
  };
  earnings: {
    /** The `system:fees` balance — every birr of commission ever taken. */
    allTimeCents: string;
    windowCents: string;
    /** The equally-long window before this one, for an honest comparison. */
    prevWindowCents: string;
    todayCents: string;
    monthToDateCents: string;
    windowVolumeCents: string;
    windowOrders: number;
    /** window commission ÷ window volume, pct-milli. null when no volume. */
    effectiveRatePctMilli: string | null;
    /** Collected for third parties — never the owner's to withdraw. */
    taxAllTimeCents: string;
    reforestAllTimeCents: string;
  };
  points: AdminRevenuePointDto[];
  byAsset: AdminRevenueAssetDto[];
  topContributors: AdminRevenueContributorDto[];
  /**
   * What is genuinely withdrawable. Customer balances are a liability, not
   * income: sweeping them would be spending money the platform owes.
   */
  position: {
    userEtbLiabilityCents: string;
    payoutHoldCents: string;
    systemCashCents: string;
    haltThresholdCents: string;
    /** Chapa merchant available balance, cents. null when unconfigured. */
    chapaAvailableCents: string | null;
    /** max(0, chapa − liability − hold − halt). null when chapa is null. */
    safeToSweepCents: string | null;
  };
  exposure: AdminRevenueExposureDto[];
  asOf: string;
}

export const adminSearchDto = z.object({
  q: z.string().max(200).optional(),
  status: z.string().max(30).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type AdminSearchDto = z.infer<typeof adminSearchDto>;

export const freezeDto = z.object({
  reason: z.string().min(3).max(500),
});
export type FreezeDto = z.infer<typeof freezeDto>;

export const decisionNoteDto = z.object({
  note: z.string().max(500).optional(),
});
export type DecisionNoteDto = z.infer<typeof decisionNoteDto>;

export interface AdminUserItem {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  status: "active" | "frozen";
  kycTier: number;
  holdingTier: string | null;
  createdAt: string;
}

export interface AdminUserDetailResponse extends AdminUserItem {
  balances: BalancesResponse;
  emailVerified: boolean;
  /** The verified Fayda identity (legal name, birthdate…), if any. */
  identity: {
    provider: string;
    legalName: string;
    birthdate: string | null;
    gender: string | null;
    phone: string | null;
    nationality: string | null;
    hasPicture: boolean;
    verifiedAt: string;
  } | null;
  activeFreeze: {
    id: string;
    reason: string;
    createdBy: string;
    createdAt: string;
  } | null;
  recentOrders: OrderListItem[];
  complianceEvents: {
    id: string;
    ruleKey: string;
    action: string;
    createdAt: string;
    resolvedAt: string | null;
  }[];
}

export interface AdminKycItem {
  id: string;
  userEmail: string;
  docType: KycDocType;
  status: KycStatus;
  fileName: string;
  createdAt: string;
}

export interface AdminReviewItem {
  orderId: string;
  userEmail: string;
  side: OrderSide;
  asset: MetalAsset;
  gramsMg: string;
  totalCents: string;
  ruleKey: string | null;
  createdAt: string;
}

export interface AdminOrderSearchItem extends OrderListItem {
  userEmail: string;
}

export interface AdminAuditItem {
  id: string;
  actorLabel: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  after: unknown;
  createdAt: string;
}

export interface AdminTreasuryResponse {
  summary: TreasurySummaryResponse;
  /** Chapa merchant balances; null when Chapa is unconfigured/unreachable. */
  chapa: { currency: string; availableBalance: number; ledgerBalance: number }[] | null;
}

export interface TreasurySummaryResponse {
  reserves: TreasuryReserveDto[];
  float: {
    cashCents: string;
    floatTargetCents: string;
    haltThresholdCents: string;
    /** max(0, cash − haltThreshold): what sells can still pay out today. */
    sellHeadroomCents: string;
    sellbackUsedTodayCents: string;
    sellbackCeilingCents: string;
  };
  asOf: string;
}

// ── Delivery requests (spec F18; production stage) ────────────────
export const createDeliveryDto = z.object({
  asset: z.enum(METAL_ASSETS),
  /** Milligrams, as a string bigint — same convention as orders. */
  gramsMg: z.string().regex(/^[0-9]+$/),
  contactPhone: z.string().min(7).max(20),
  address: z.string().min(10).max(400),
  note: z.string().max(400).optional(),
});
export type CreateDeliveryDto = z.infer<typeof createDeliveryDto>;

export const deliveryScheduleDto = z.object({
  /** ISO date-time the handover is scheduled for. */
  scheduledFor: z.string().datetime(),
});
export type DeliveryScheduleDto = z.infer<typeof deliveryScheduleDto>;

export type DeliveryStatus =
  | "requested"
  | "reviewing"
  | "approved"
  | "scheduled"
  | "rejected"
  | "delivered";

export interface DeliveryItem {
  id: string;
  asset: MetalAsset;
  gramsMg: string;
  status: DeliveryStatus;
  contactPhone: string | null;
  address: string | null;
  note: string | null;
  reviewNote: string | null;
  scheduledFor: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface DeliveryListResponse {
  requests: DeliveryItem[];
}

export interface AdminDeliveryItem extends DeliveryItem {
  userEmail: string;
  /** The metal the user holds right now (approval checks it under lock). */
  heldMg: string;
}

// ── Telegram Mini App (Phase 11) ─────────────────────────────────
// initData is Telegram's signed query string; 4096 bytes is far above what
// Telegram sends and stops a megabyte "initData" before any hashing.
const initDataField = z.string().min(16).max(4096);
const pendingTokenField = z.string().regex(/^[A-Za-z0-9_-]{32,64}$/);

export const telegramSessionDto = z.object({ initData: initDataField });
export type TelegramSessionDto = z.infer<typeof telegramSessionDto>;

export const telegramSignupDto = z.object({
  pendingToken: pendingTokenField,
  email: z.string().email().max(254),
  fullName: z.string().trim().min(2).max(120),
  locale: z.enum(LOCALES).default(DEFAULT_LOCALE),
  acceptTerms: z.literal(true),
});
export type TelegramSignupDto = z.infer<typeof telegramSignupDto>;

export const telegramPasswordLinkDto = z.object({
  pendingToken: pendingTokenField,
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});
export type TelegramPasswordLinkDto = z.infer<typeof telegramPasswordLinkDto>;

export const telegramLinkClaimDto = z.object({
  initData: initDataField,
  linkToken: z.string().regex(/^[A-Za-z0-9_-]{32,64}$/),
});
export type TelegramLinkClaimDto = z.infer<typeof telegramLinkClaimDto>;

/**
 * Google from inside the Mini App. Google refuses embedded webviews, so the
 * sign-in runs in the phone's browser and the Mini App confirms the result.
 * "register" sits behind the terms checkbox, as on the website.
 */
export const telegramGoogleStartDto = z.object({
  pendingToken: pendingTokenField,
  intent: z.enum(["login", "register"]),
  locale: z.enum(LOCALES).default(DEFAULT_LOCALE),
  acceptTerms: z.boolean().optional(),
});
export type TelegramGoogleStartDto = z.infer<typeof telegramGoogleStartDto>;

export const telegramGoogleFlowDto = z.object({
  pendingToken: pendingTokenField,
  flowId: z.string().uuid(),
});
export type TelegramGoogleFlowDto = z.infer<typeof telegramGoogleFlowDto>;

export interface TelegramGoogleStartResponse {
  flowId: string;
  /** Open with Telegram.WebApp.openLink — the ticket rides the fragment. */
  url: string;
  expiresAt: string;
}

export type TelegramGoogleStatus =
  | { status: "waiting" }
  /** Google answered; `account` is the masked email the Mini App asks the person to confirm. */
  | { status: "ready"; account: string }
  | { status: "failed"; code: string }
  | { status: "expired" };

/**
 * POST /auth/google/callback for a flow started in the Mini App: no session.
 * The browser that proved Google must approve the Telegram account that
 * asked (`telegram`) before anything is linked, using the one-time `token`.
 */
export interface GoogleCallbackTelegramResponse {
  telegram: {
    returnUrl: string | null;
    flowId: string;
    token: string;
    telegram: string;
    account: string;
  };
}

export const telegramGoogleApproveDto = z.object({
  flowId: z.string().uuid(),
  token: z.string().regex(/^[A-Za-z0-9_-]{40,64}$/),
  decision: z.enum(["approve", "reject"]),
});
export type TelegramGoogleApproveDto = z.infer<typeof telegramGoogleApproveDto>;

export const telegramRefreshDto = z.object({
  refreshToken: z.string().min(40).max(200),
});

/** The Telegram identity as shown to its owner — never more than this. */
export interface TelegramIdentitySummary {
  /** "@username" when the person has one, else their first name. */
  display: string;
  username: string | null;
  firstName: string | null;
}

/** Tokens travel in the body: the Mini App is cookie-less (see SessionChannel). */
export interface TelegramTokens {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
}

export type TelegramSessionResponse =
  | { status: "signed_in"; user: MeResponse; tokens: TelegramTokens }
  | {
      status: "needs_account";
      pendingToken: string;
      telegram: TelegramIdentitySummary;
      signupEnabled: boolean;
    };

export interface TelegramLinkStartResponse {
  /** https://t.me/<bot>/<app>?startapp=link-<token> */
  url: string;
  expiresAt: string;
}

export interface TelegramLinkStatusResponse {
  linked: TelegramIdentitySummary | null;
  canMessage: boolean;
  /** A Telegram account waiting for the owner's confirmation on the website. */
  pending: TelegramIdentitySummary | null;
  /** Whether the bot is configured at all (hides the card when false). */
  available: boolean;
  botUsername: string | null;
}

export const telegramHandoffDto = z.object({ purpose: z.enum(["fayda_link"]) });
export const telegramHandoffConsumeDto = z.object({
  ticket: z.string().regex(/^[A-Za-z0-9_-]{40,64}$/),
});

export interface TelegramHandoffStartResponse {
  id: string;
  /** Open with Telegram.WebApp.openLink — the ticket rides the fragment. */
  url: string;
  expiresAt: string;
}

export type TelegramHandoffStatus =
  | { status: "waiting" }
  | { status: "awaiting_confirmation"; legalName: string; birthYear: string | null }
  | { status: "done" }
  | { status: "expired" };
