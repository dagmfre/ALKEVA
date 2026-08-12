import { z } from "zod";
import { METAL_ASSETS, ORDER_SIDES } from "./constants.js";
import type { Asset, MetalAsset, OrderSide, PriceRange, Role } from "./constants.js";

// ── Auth ──────────────────────────────────────────────────────────
export const registerDto = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  fullName: z.string().min(2).max(120),
  locale: z.enum(["am", "en"]).default("am"),
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
  locale: "am" | "en";
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

// ── Admin console (Phase 5) ───────────────────────────────────────

export interface AdminOverviewResponse {
  pendingKyc: number;
  pendingPayouts: number;
  openReviews: number;
  frozenUsers: number;
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
