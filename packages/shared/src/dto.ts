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
