/** Assets tradeable on the platform. ETB is the cash asset in the ledger. */
export const ASSETS = ["ETB", "XAU", "XPT"] as const;
export type Asset = (typeof ASSETS)[number];
export const METAL_ASSETS = ["XAU", "XPT"] as const;
export type MetalAsset = (typeof METAL_ASSETS)[number];

/** System ledger account names — created by seed, referenced by name everywhere. */
export const SYSTEM_ACCOUNTS = [
  "system:cash",
  "system:vault:XAU",
  "system:vault:XPT",
  "system:fees",
  "system:tax",
  "system:reforestation",
  "system:external",
  /** Withdrawal escrow: user ETB parks here between request and approve/reject. */
  "system:payout_hold",
] as const;
export type SystemAccountName = (typeof SYSTEM_ACCOUNTS)[number];

export const ROLES = ["user", "administrator", "compliance", "finance"] as const;
export type Role = (typeof ROLES)[number];

export const ORDER_SIDES = ["buy", "sell"] as const;
export type OrderSide = (typeof ORDER_SIDES)[number];

/** Unit conventions — the money-is-integers rule (CLAUDE.md rule 4). */
export const UNITS = {
  /** ETB amounts: bigint cents. 1 ETB = 100 cents. */
  ETB_CENTS_PER_BIRR: 100n,
  /** Metal amounts: bigint milligrams. 1 g = 1000 mg. */
  MG_PER_GRAM: 1000n,
  /** price_tick stores USD/oz and FX in micro-units (1e-6) for integer math. */
  MICRO: 1_000_000n,
  /** Troy ounce in milligrams (exact to 3 dp: 31.1034768 g). */
  TROY_OZ_MG: 31_103n,
} as const;

export const PRICE_RANGES = ["24h", "7d", "30d", "1y"] as const;
export type PriceRange = (typeof PRICE_RANGES)[number];

/** Quote lifetime (non-negotiable #3: quotes expire). */
export const QUOTE_TTL_SECONDS = 30;
/** Quote engine refuses ticks older than this (stale-price protection). */
export const MAX_TICK_AGE_SECONDS = 180;
