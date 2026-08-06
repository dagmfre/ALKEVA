import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

/**
 * Loads the nearest `.env` walking up from `startDir` (default: cwd).
 * Uses Node 22's built-in loadEnvFile — existing process.env keys win.
 * No-op when no .env exists (production platforms inject real env vars).
 */
export function loadDotenvUpwards(startDir: string = process.cwd()): void {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, ".env");
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

/**
 * Single source of truth for every environment variable in the monorepo.
 * Apps validate at boot with `loadEnv()` and crash loudly on misconfiguration —
 * a money platform must never start half-configured.
 */
export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SEC: z.coerce.number().int().positive().default(1209600),

  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  API_PORT: z.coerce.number().int().positive().default(4000),

  // Fees — Decision A1: fully config-driven, no hardcoded rates.
  FEE_COMMISSION_PCT: z.coerce.number().min(0).max(100).default(2.0),
  FEE_SERVICE_CENTS: z.coerce.bigint().nonnegative().default(0n),
  TAX_PCT: z.coerce.number().min(0).max(100).default(0),
  REFOREST_PCT: z.coerce.number().min(0).max(100).default(0),

  // Treasury — Decision A2: config-driven demo values.
  TREASURY_FLOAT_ETB_CENTS: z.coerce.bigint().nonnegative().default(1_000_000_000n),
  TREASURY_HALT_CENTS: z.coerce.bigint().nonnegative().default(150_000_000n),
  SELLBACK_DAILY_CEILING_CENTS: z.coerce.bigint().nonnegative().default(500_000_000n),
  VAULT_SEED_XAU_MG: z.coerce.bigint().nonnegative().default(5_000_000n),
  VAULT_SEED_XPT_MG: z.coerce.bigint().nonnegative().default(1_000_000n),

  // Holding tiers — Decision A3: bands config-driven.
  TIER_BANDS_JSON: z.string().default(
    '[{"name":"Gold","maxUsd":1000},{"name":"Tanzanite","maxUsd":5000},{"name":"Ruby","maxUsd":15000},{"name":"Sapphire","maxUsd":30000},{"name":"Emerald","maxUsd":null}]',
  ),

  PRICE_TICK_SECONDS: z.coerce.number().int().min(10).default(30),
  FX_CACHE_SECONDS: z.coerce.number().int().min(60).default(3600),
  PRICE_PRIMARY_URL: z.string().url().default("https://api.gold-api.com/price"),
  PRICE_FALLBACK_URL: z
    .string()
    .url()
    .default("https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument"),
  FX_URL: z.string().url().default("https://open.er-api.com/v6/latest/USD"),

  SEED_ADMIN_EMAIL: z.string().email().default("admin@alkeva.local"),
  SEED_ADMIN_PASSWORD: z.string().min(8).default("change-me-on-first-login"),

  // Phase 4–5, validated only once those phases wire them in.
  CHAPA_SECRET_KEY: z.string().optional().default(""),
  CHAPA_WEBHOOK_HASH: z.string().optional().default(""),
  GEMINI_API_KEY: z.string().optional().default(""),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Environment validation failed:\n${issues}`);
  }
  return parsed.data;
}

export const tierBandSchema = z.array(
  z.object({ name: z.string(), maxUsd: z.number().nullable() }),
);
export type TierBand = z.infer<typeof tierBandSchema>[number];

export function parseTierBands(json: string): TierBand[] {
  return tierBandSchema.parse(JSON.parse(json));
}
