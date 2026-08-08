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
