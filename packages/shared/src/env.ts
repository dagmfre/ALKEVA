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
      // process.loadEnvFile OVERWRITES process.env, which would let a stray
      // .env shadow platform-injected secrets (Render/Docker). Snapshot the
      // real environment and restore it afterwards so the file only fills
      // gaps — on a money platform, "which config won" must never be a guess.
      const injected = { ...process.env };
      process.loadEnvFile(candidate);
      for (const [key, value] of Object.entries(injected)) {
        if (value !== undefined) process.env[key] = value;
      }
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

  // Postgres pool shape. Defaults suit a long-lived process (Render/local).
  // On a serverless host every warm instance keeps its own pool, so DB_POOL_MAX
  // is set low there and DB_IDLE_TIMEOUT_SEC matters: without it, postgres-js
  // holds connections forever and frozen instances exhaust Supabase's pooler.
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DB_IDLE_TIMEOUT_SEC: z.coerce.number().int().nonnegative().default(20),

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

  // Demo faucet — OFF by default since the production stage. Real money enters
  // through Chapa deposits; sandbox environments may re-enable this explicitly.
  // z.enum+transform, NOT z.coerce.boolean — the latter coerces "false" to true.
  DEMO_FAUCET_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  DEMO_FAUCET_MAX_CENTS: z.coerce.bigint().positive().default(20_000_000n),

  // Phase 2 — compliance pre-check (Q57): orders at/above this route to
  // review instead of settling. Resolution UI arrives in Phase 5.
  COMPLIANCE_REVIEW_THRESHOLD_CENTS: z.coerce.bigint().positive().default(50_000_000n),

  SEED_ADMIN_EMAIL: z.string().email().default("admin@alkeva.local"),
  // No default password since the production stage: empty = the seed skips
  // creating/resetting the administrator and logs the skip loudly. A known
  // default admin password must never survive into a real deployment.
  SEED_ADMIN_PASSWORD: z.string().optional().default(""),
  // Staff seeds for the Phase 5 role separation demo — seeded only when both
  // halves of a pair are set (empty = skipped).
  SEED_COMPLIANCE_EMAIL: z.string().optional().default(""),
  SEED_COMPLIANCE_PASSWORD: z.string().optional().default(""),
  SEED_FINANCE_EMAIL: z.string().optional().default(""),
  SEED_FINANCE_PASSWORD: z.string().optional().default(""),

  // Phase 4 — Chapa. Secret/hash empty until Dagmfre pastes the test keys;
  // payment endpoints answer 503 payments_unconfigured until then (the app
  // still boots — the same degrade-not-crash pattern as the faucet).
  CHAPA_SECRET_KEY: z.string().optional().default(""),
  CHAPA_WEBHOOK_HASH: z.string().optional().default(""),
  CHAPA_API_BASE: z.string().url().default("https://api.chapa.co"),
  DEPOSIT_MIN_CENTS: z.coerce.bigint().positive().default(1_000n), // 10 ETB
  PAYOUT_MIN_CENTS: z.coerce.bigint().positive().default(10_000n), // 100 ETB
  // Withdrawals strictly below this auto-approve at request time (the
  // audit-logged single-step cut-list variant); at or above it — and whenever
  // Chapa is unconfigured — finance approves by hand. 0 disables the instant
  // path entirely. Default mirrors the 500k ETB AML review line.
  PAYOUT_AUTO_APPROVE_MAX_CENTS: z.coerce.bigint().min(0n).default(50_000_000n),
  // Per-channel caps, display-only (Chapa enforces them at checkout) — from
  // fact-check §6.5. Cents as string bigints, same convention as tier bands.
  DEPOSIT_CHANNELS_JSON: z.string().default(
    '[{"key":"telebirr","maxInCents":"7500000"},{"key":"cbebirr","maxInCents":"15000000","maxOutCents":"30000000"},{"key":"bank","maxInCents":"999999900"},{"key":"card","minInCents":"1000","maxInCents":"50000000"}]',
  ),

  // Phase 5 — Gemini (demo: 3.6 Flash for best Amharic; rehearsal:
  // gemini-3.5-flash-lite to preserve the free-tier daily cap).
  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_MODEL: z.string().default("gemini-3.6-flash"),

  // Google sign-in (production stage). Empty = the endpoints answer 503
  // auth_google_unconfigured and the web hides the button — the same
  // degrade-not-crash pattern as Chapa. Redirect URI must be registered
  // EXACTLY in Google Cloud Console: `${WEB_ORIGIN}/auth/google/callback`.
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),

  // WebAuthn / passkeys (production stage). RP_ID is the registrable domain
  // credentials bind to (vercel.app is on the Public Suffix List, so on
  // Vercel it must be the FULL subdomain); ORIGIN is the exact https origin.
  // Empty = endpoints 503, UI hidden.
  WEBAUTHN_RP_ID: z.string().optional().default(""),
  WEBAUTHN_ORIGIN: z.string().optional().default(""),

  // Badges: accounts created before this ISO date earn early_adopter.
  // Empty = the badge is never awarded.
  BADGE_EARLY_ADOPTER_BEFORE: z.string().optional().default(""),

  // Phase 5 — email. Provider-agnostic SMTP (free tiers: Brevo, Gmail app
  // password). Unset = notifications still recorded, delivery skipped.
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  MAIL_FROM: z.string().default("ALKEVA <no-reply@alkeva.local>"),
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
  z.object({
    name: z.string(),
    maxUsd: z.number().nullable(),
    // Optional trading caps (Decision A3); omitted = uncapped (NULL in DB).
    // String bigints because JSON numbers can't hold ETB cents safely.
    perTxnCapCents: z.string().regex(/^[0-9]+$/).optional(),
    dailyCapCents: z.string().regex(/^[0-9]+$/).optional(),
  }),
);
export type TierBand = z.infer<typeof tierBandSchema>[number];

export function parseTierBands(json: string): TierBand[] {
  return tierBandSchema.parse(JSON.parse(json));
}

/** Deposit-channel display caps (DEPOSIT_CHANNELS_JSON). Display-only. */
export const depositChannelSchema = z.array(
  z.object({
    key: z.string(),
    minInCents: z.string().regex(/^[0-9]+$/).optional(),
    maxInCents: z.string().regex(/^[0-9]+$/).optional(),
    maxOutCents: z.string().regex(/^[0-9]+$/).optional(),
  }),
);
export type DepositChannel = z.infer<typeof depositChannelSchema>[number];

export function parseDepositChannels(json: string): DepositChannel[] {
  return depositChannelSchema.parse(JSON.parse(json));
}
