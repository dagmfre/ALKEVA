import { z } from "zod";
import { METAL_ASSETS, ORDER_SIDES } from "./constants.js";
import type { Asset, MetalAsset, OrderSide, PriceRange, Role } from "./constants.js";
import { DEFAULT_LOCALE, LOCALES } from "./locales.js";
import type { Locale } from "./locales.js";

// ── Auth ──────────────────────────────────────────────────────────
export const registerDto = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
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
}

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

/** The rate card in force. Never a price — a quote is the only binding figure. */
export interface FeeRatesResponse {
  /** Commission in milli-percent: 2% → 2000. */
  commissionPctMilli: number;
  serviceFeeCents: string;
  taxPctMilli: number;
  reforestPctMilli: number;
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

/** One end of an attribution window — a raw tick, never a bucket average. */
export interface PriceAttributionPointDto {
  at: string;
  etbCentsPerGram: string;
  usdPerOzMicro: string;
  fxRateMicro: string;
}

/**
 * Why the birr price moved. A price in ETB/gram is the metal's dollar price
 * times the birr's dollar rate, so a move in birr is always two moves at once:
 * the world metal price, and the currency. Both halves are stored on every
 * price_tick, so this is arithmetic on our own data — not a model's opinion.
 */
export interface PriceAttributionResponse {
  asset: Asset;
  range: PriceRange;
  from: PriceAttributionPointDto;
  to: PriceAttributionPointDto;
  /** Total ETB/gram move, milli-percent. Null when there is no distinct reference tick. */
  totalPctMilli: string | null;
  /** The metal's own move in USD/oz, milli-percent. */
  metalPctMilli: string | null;
  /** USD→ETB move, milli-percent. Positive = the birr weakened against the dollar. */
  fxPctMilli: string | null;
  /**
   * total − metal − fx: the interaction of the two moves plus the cents
   * rounding. Reported rather than folded silently into the other two, so the
   * three figures always reconcile to the total exactly.
   */
  crossPctMilli: string | null;
  /** Which half did more of the work; null when neither moved meaningfully. */
  dominant: "metal" | "currency" | "both" | null;
  source: string;
  fxSource: string;
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
const bigintString = z
  .string()
  .regex(/^[0-9]+$/)
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

export const faucetDto = z.object({
  amountCents: bigintString.refine((v) => v > 0n),
});
export type FaucetDto = z.infer<typeof faucetDto>;

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
  | "failed";

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

export const createPayoutDto = z.object({
  amountCents: bigintString.refine((v) => v > 0n),
  bankCode: z.number().int().positive(),
  accountNumber: z.string().min(4).max(34),
  accountName: z.string().min(2).max(120),
  /** Client part only — the server namespaces it `${userId}:${key}`. */
  idempotencyKey: z.string().min(8).max(64),
});
export type CreatePayoutDto = z.infer<typeof createPayoutDto>;

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
  status: "queued" | "sent" | "failed";
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: NotificationItem[];
}

// ── KYC (Phase 4.3) ───────────────────────────────────────────────

export const KYC_DOC_TYPES = ["fayda", "passport", "driving_licence", "kebele_id"] as const;
export type KycDocType = (typeof KYC_DOC_TYPES)[number];
export type KycStatus = "pending" | "approved" | "rejected";

/**
 * What a model read off an uploaded document. A transcription, not a check:
 * nothing here verifies that the document is genuine, valid, or unexpired.
 */
export interface KycExtractionDto {
  fullName: string | null;
  docNumber: string | null;
  expiry: string | null;
  confidence: "high" | "medium" | "low";
}

/** The user's own declared identity fields, submitted with the document. */
export const kycDeclaredDto = z.object({
  fullName: z.string().max(200).optional(),
  docNumber: z.string().max(200).optional(),
  expiry: z.string().max(200).optional(),
});
export type KycDeclaredDto = z.infer<typeof kycDeclaredDto>;

export interface KycMeResponse {
  kycTier: number;
  /** Latest submission, if any. */
  submission: {
    id: string;
    docType: KycDocType;
    status: KycStatus;
    reviewNote: string | null;
    createdAt: string;
    reviewedAt: string | null;
    declaredFullName: string | null;
    declaredDocNumber: string | null;
    declaredExpiry: string | null;
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
  /** What the user typed. */
  declaredFullName: string | null;
  declaredDocNumber: string | null;
  declaredExpiry: string | null;
  /** What was read off the image — shown beside the declared values so the
      reviewer can see any disagreement. Never a verdict on the document. */
  extractedFullName: string | null;
  extractedDocNumber: string | null;
  extractedExpiry: string | null;
  extractedConfidence: string | null;
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

// ── AML risk cases (spec F20/F22) ─────────────────────────────────
export type RiskCaseStatus = "open" | "resolved";

/**
 * A finding from the deterministic rules engine, awaiting a person.
 * `narrative` is assistant-written display text — advisory, never an input to
 * any decision; the officer's own action is what the audit log records.
 */
export interface AdminRiskCaseItem {
  id: string;
  userId: string | null;
  userEmail: string | null;
  userStatus: "active" | "frozen" | null;
  ruleKey: string;
  severity: string | null;
  score: number | null;
  evidence: Record<string, string> | null;
  windowStart: string | null;
  narrative: string | null;
  narrativeLocale: string | null;
  resolvedAt: string | null;
  resolvedByEmail: string | null;
  resolutionNote: string | null;
  createdAt: string;
}

export interface AdminRiskCasesResponse {
  cases: AdminRiskCaseItem[];
  openCount: number;
}

export interface AdminRiskScanResponse {
  scannedAt: string;
  windowStart: string;
  found: number;
  opened: number;
  byRule: Record<string, number>;
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

export type DeliveryStatus = "requested" | "reviewing" | "approved" | "scheduled" | "rejected";

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
  createdAt: string;
}

export interface DeliveryListResponse {
  requests: DeliveryItem[];
}

export interface AdminDeliveryItem extends DeliveryItem {
  userEmail: string;
  /** Advisory: the metal the user holds right now (re-checked at approve). */
  heldMg: string;
}
