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
/** z.enum+transform, NOT z.coerce.boolean — the latter coerces "false" to true. */
const flag = (fallback: "true" | "false") =>
  z
    .enum(["true", "false"])
    .default(fallback)
    .transform((v) => v === "true");

export const AUTH_METHOD_KEYS = ["fayda", "password", "google", "passkey", "telegram"] as const;
export type AuthMethod = (typeof AUTH_METHOD_KEYS)[number];
export const KYC_METHOD_KEYS = ["fayda", "document"] as const;
export type KycMethod = (typeof KYC_METHOD_KEYS)[number];

/** A comma list of known keys -> a de-duplicated array; unknown keys fail boot. */
function methodList<const K extends readonly string[]>(keys: K, fallback: string) {
  return z
    .string()
    .default(fallback)
    .transform((raw, ctx) => {
      const items = raw
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);
      const out: K[number][] = [];
      for (const item of items) {
        if (!(keys as readonly string[]).includes(item)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `unknown method "${item}"` });
          return z.NEVER;
        }
        if (!out.includes(item as K[number])) out.push(item as K[number]);
      }
      return out;
    });
}

export const envSchema = z.object({
  /** production turns on the go-live guard in loadEnv(). */
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

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

  // Treasury — Decision A2. The opening float and the two VAULT_SEED_* values
  // are DEMO inventory: the seed posts them only outside production. Real
  // vault intake and capital go through the audited admin Treasury entries.
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

  // Phase 2 — compliance pre-check (Q57): orders at/above this route to
  // review instead of settling. Resolution UI arrives in Phase 5.
  COMPLIANCE_REVIEW_THRESHOLD_CENTS: z.coerce.bigint().positive().default(50_000_000n),
  // A review older than this can no longer be approved at its original quote
  // — the user re-quotes at today's price (review_expired).
  REVIEW_MAX_AGE_MIN: z.coerce.number().int().positive().default(60),

  // Price guard (Phase 10). A tick that moves more than this from the last
  // good tick must be confirmed by the secondary feed or it is stored suspect
  // and quotes refuse it. FX refreshes that jump more than FX_MAX_MOVE_BPS keep
  // the previous rate.
  PRICE_MAX_TICK_MOVE_BPS: z.coerce.number().int().positive().default(300),
  FX_MAX_MOVE_BPS: z.coerce.number().int().positive().default(200),
  QUOTE_MAX_TICK_AGE_SEC: z.coerce.number().int().min(30).default(90),
  // Dealer spread around the mid price, in basis points per side. 0 = none
  // (client decision; commission is the only income until it is set).
  QUOTE_SPREAD_BPS: z.coerce.number().int().min(0).max(1000).default(0),

  // Sign-in hardening.
  LOGIN_MAX_FAILURES: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),

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

  // Phase 4 — Chapa. Empty = payment endpoints answer 503
  // payments_unconfigured (the app still boots — degrade, never crash).
  CHAPA_SECRET_KEY: z.string().optional().default(""),
  CHAPA_WEBHOOK_HASH: z.string().optional().default(""),
  CHAPA_API_BASE: z.string().url().default("https://api.chapa.co"),
  DEPOSIT_MIN_CENTS: z.coerce.bigint().positive().default(1_000n), // 10 ETB
  PAYOUT_MIN_CENTS: z.coerce.bigint().positive().default(10_000n), // 100 ETB
  // Withdrawals strictly below this auto-approve at request time — and only to
  // a destination this user has already been paid to, in their verified legal
  // name. Everything else (and anything when Chapa is unconfigured) waits for
  // finance. 0 disables the instant path. Default 10,000 ETB (Phase 10).
  PAYOUT_AUTO_APPROVE_MAX_CENTS: z.coerce.bigint().min(0n).default(1_000_000n),
  // Hard per-user limits per EAT day, counted over every payout not refused.
  PAYOUT_DAILY_MAX_CENTS: z.coerce.bigint().positive().default(100_000_000n), // 1,000,000 ETB
  PAYOUT_DAILY_MAX_COUNT: z.coerce.number().int().positive().default(5),
  // Staging only: lets NODE_ENV=production run on Chapa CHASECK_TEST keys.
  ALLOW_SANDBOX_PAYMENTS: flag("false"),
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

  // Sign-in methods (Phase 10): a method is live only when listed here AND
  // configured. Staff accounts keep password sign-in regardless, or the seeded
  // staff would be locked out.
  AUTH_METHODS: methodList(AUTH_METHOD_KEYS, "fayda,password"),
  // Identity verification methods. Fayda is the mandatory path; "document"
  // re-enables the manual upload + compliance review flow.
  KYC_METHODS: methodList(KYC_METHOD_KEYS, "fayda"),
  KYC_MIN_AGE: z.coerce.number().int().min(0).default(18),
  // When true, admin routes need a session whose sign-in used a passkey.
  STAFF_REQUIRE_PASSKEY: flag("false"),

  // VeriFayda 2.0 (eSignet) OIDC. Endpoints come from the issuer's discovery
  // document. PRIVATE_KEY is the base64 RSA JWK matching the certificate
  // registered for the client. REDIRECT_URI defaults to ${WEB_ORIGIN}/callback
  // and must match the registered URI exactly.
  FAYDA_ISSUER: z.string().url().default("https://esignet.ida.fayda.et"),
  FAYDA_CLIENT_ID: z.string().optional().default(""),
  FAYDA_PRIVATE_KEY: z.string().optional().default(""),
  FAYDA_REDIRECT_URI: z.string().optional().default(""),
  FAYDA_ACR_VALUES: z
    .string()
    .default("mosip:idp:acr:generated-code mosip:idp:acr:biometrics"),
  FAYDA_UI_LOCALES: z.string().default("en"),
  // Only for clients registered for encrypted userinfo (VeriFayda 2 v1.8).
  FAYDA_USERINFO_ENC_KEY: z.string().optional().default(""),
  // "strict" (default): userinfo must verify against the issuer's JWKS, or the
  // sign-in is refused. "tls": if the signing key is missing from the JWKS
  // even after a forced reload, accept the claims fetched over TLS from the
  // issuer's own endpoint (their `sub` must still match the verified
  // id_token). The sandbox was seen not publishing its userinfo key (2 Nov
  // 2026) — never turn this on in production without asking Fayda first.
  FAYDA_USERINFO_JWKS_FALLBACK: z.enum(["strict", "tls"]).default("strict"),

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

  // Browser notifications (Web Push). Empty = push is off, the bell and email
  // still work. Generate a pair with `npx web-push generate-vapid-keys`.
  WEB_PUSH_VAPID_PUBLIC_KEY: z.string().optional().default(""),
  WEB_PUSH_VAPID_PRIVATE_KEY: z.string().optional().default(""),
  WEB_PUSH_SUBJECT: z.string().default("mailto:support@alkeva.local"),

  // Telegram Mini App + bot (Phase 11). Telegram sign-in is live only when
  // "telegram" is in AUTH_METHODS AND the bot token, username, Mini App short
  // name, webhook secret and Mini App origin are all set. The Mini App origin
  // is a SEPARATE host (e.g. https://tg.allkeva.com): it is the only origin
  // registered in BotFather (Bot API 10.2 origin lockdown) and the only one
  // that may be framed by web.telegram.org — allkeva.com stays unframeable.
  TELEGRAM_BOT_TOKEN: z.string().optional().default(""),
  TELEGRAM_BOT_USERNAME: z
    .string()
    .regex(/^[A-Za-z0-9_]{0,64}$/, "bot username: letters, digits, underscore (no @)")
    .optional()
    .default(""),
  TELEGRAM_MINIAPP_SHORT_NAME: z
    .string()
    .regex(/^[A-Za-z0-9_]{0,64}$/, "Mini App short name: letters, digits, underscore")
    .optional()
    .default(""),
  // Sent by Telegram as X-Telegram-Bot-Api-Secret-Token; 1-256 of [A-Za-z0-9_-].
  TELEGRAM_WEBHOOK_SECRET: z
    .string()
    .regex(/^[A-Za-z0-9_-]{0,256}$/, "webhook secret: A-Z a-z 0-9 _ - only")
    .optional()
    .default(""),
  TELEGRAM_WEBAPP_ORIGIN: z.string().optional().default(""),
  // initData is a bearer credential: it is accepted once (single-use hash)
  // and only this many seconds after Telegram signed it.
  TELEGRAM_INITDATA_MAX_AGE_SEC: z.coerce.number().int().min(30).max(86400).default(300),
  // Absolute lifetime of a Telegram Mini App session (no sliding renewal).
  TELEGRAM_SESSION_TTL_SEC: z.coerce.number().int().min(900).max(604800).default(43200),
  // false = Telegram can only open accounts that already exist (linking).
  TELEGRAM_SIGNUP_ENABLED: flag("true"),
  // Telegram's separate test environment (/bot<token>/test/ API, test-server
  // signing). Never in production.
  TELEGRAM_TEST_ENV: flag("false"),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Settings that are fine on a laptop and dangerous with real money. With
 * NODE_ENV=production the process refuses to start on any of them — a money
 * platform must never boot half-configured (Phase 10 go-live guard).
 */
export function productionEnvProblems(env: Env): string[] {
  if (env.NODE_ENV !== "production") return [];
  const problems: string[] = [];
  if (!env.WEB_ORIGIN.startsWith("https://")) {
    problems.push("WEB_ORIGIN must be https (cookies lose Secure otherwise)");
  }
  if (env.JWT_SECRET.length < 32 || env.JWT_REFRESH_SECRET.length < 32) {
    problems.push("JWT_SECRET and JWT_REFRESH_SECRET must be at least 32 characters");
  }
  if (env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
    problems.push("JWT_SECRET and JWT_REFRESH_SECRET must differ");
  }
  if (env.CHAPA_SECRET_KEY.startsWith("CHASECK_TEST") && !env.ALLOW_SANDBOX_PAYMENTS) {
    problems.push(
      "CHAPA_SECRET_KEY is a test key (set ALLOW_SANDBOX_PAYMENTS=true only on staging)",
    );
  }
  if (!env.SMTP_HOST) {
    problems.push("SMTP_HOST is required (email verification and alerts depend on it)");
  }
  if (env.AUTH_METHODS.length === 0) problems.push("AUTH_METHODS is empty");
  if (env.KYC_METHODS.length === 0) problems.push("KYC_METHODS is empty");
  if (env.FAYDA_USERINFO_JWKS_FALLBACK !== "strict") {
    problems.push("FAYDA_USERINFO_JWKS_FALLBACK must be strict in production");
  }
  if (env.AUTH_METHODS.includes("telegram")) {
    if (
      !env.TELEGRAM_BOT_TOKEN ||
      !env.TELEGRAM_BOT_USERNAME ||
      !env.TELEGRAM_MINIAPP_SHORT_NAME ||
      !env.TELEGRAM_WEBAPP_ORIGIN
    ) {
      problems.push(
        "Telegram is enabled but TELEGRAM_BOT_TOKEN / _BOT_USERNAME / _MINIAPP_SHORT_NAME / _WEBAPP_ORIGIN are not all set",
      );
    }
    if (env.TELEGRAM_WEBHOOK_SECRET.length < 32) {
      problems.push("TELEGRAM_WEBHOOK_SECRET must be at least 32 characters");
    }
    if (env.TELEGRAM_TEST_ENV) problems.push("TELEGRAM_TEST_ENV must be false in production");
  }
  if (env.TELEGRAM_WEBAPP_ORIGIN) {
    const tg = telegramOriginProblem(env.TELEGRAM_WEBAPP_ORIGIN, env.WEB_ORIGIN, true);
    if (tg) problems.push(tg);
  }
  const faydaOn = env.AUTH_METHODS.includes("fayda") || env.KYC_METHODS.includes("fayda");
  if (faydaOn && (!env.FAYDA_CLIENT_ID || !env.FAYDA_PRIVATE_KEY)) {
    problems.push("Fayda is enabled but FAYDA_CLIENT_ID / FAYDA_PRIVATE_KEY are not set");
  }
  return problems;
}

/**
 * The Mini App origin must be a bare origin (scheme + host[:port], no path),
 * and never the main site: allkeva.com refusing to be framed depends on it.
 */
export function telegramOriginProblem(
  tgOrigin: string,
  webOrigin: string,
  requireHttps: boolean,
): string | null {
  let url: URL;
  try {
    url = new URL(tgOrigin);
  } catch {
    return "TELEGRAM_WEBAPP_ORIGIN is not a URL";
  }
  if (url.origin !== tgOrigin.replace(/\/$/, "")) {
    return "TELEGRAM_WEBAPP_ORIGIN must be a bare origin (no path, query or trailing segments)";
  }
  if (requireHttps && url.protocol !== "https:") return "TELEGRAM_WEBAPP_ORIGIN must be https";
  try {
    if (new URL(webOrigin).host === url.host) {
      return "TELEGRAM_WEBAPP_ORIGIN must be a different host from WEB_ORIGIN";
    }
  } catch {
    /* WEB_ORIGIN is validated by the schema */
  }
  return null;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Environment validation failed:\n${issues}`);
  }
  const problems = productionEnvProblems(parsed.data);
  if (problems.length > 0) {
    throw new Error(
      `Refusing to start with NODE_ENV=production:\n${problems.map((p) => `  - ${p}`).join("\n")}`,
    );
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
