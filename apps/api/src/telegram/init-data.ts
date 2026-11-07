import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Telegram Mini App initData verification (core.telegram.org/bots/webapps,
 * "Validating data received via the Mini App"):
 *
 *   data_check_string = every received field except `hash`, sorted by key,
 *                       written `key=value`, joined with "\n"
 *   secret_key        = HMAC_SHA256(key = "WebAppData", message = bot_token)
 *   valid             ⇔ hex(HMAC_SHA256(key = secret_key, data_check_string)) == hash
 *
 * `signature` (the Ed25519 third-party proof) is an ordinary field here and
 * is covered by the hash like any other. We hold the bot token, so the HMAC
 * is the stronger check: only Telegram and this server can produce it.
 *
 * Pure: no I/O, no clock other than the one passed in. Every refusal is a
 * machine code, and nothing about WHY a hash failed is revealed to callers.
 */

export interface TelegramWebAppUser {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  allows_write_to_pm?: boolean;
}

export interface VerifiedInitData {
  user: TelegramWebAppUser;
  /** Unix seconds Telegram signed the launch at. */
  authDate: number;
  /** The 64-hex hash — unique per launch, used for single-use replay checks. */
  hash: string;
  startParam: string | null;
  chatType: string | null;
}

export type InitDataFailure =
  | "telegram_init_malformed"
  | "telegram_init_invalid"
  | "telegram_init_expired"
  | "telegram_init_no_user";

export class InitDataError extends Error {
  constructor(readonly code: InitDataFailure) {
    super(code);
  }
}

/** Telegram sends a few hundred bytes; anything near this is not Telegram. */
const MAX_RAW_BYTES = 4096;
/** Clock skew tolerated for an auth_date slightly in the future. */
const FUTURE_SKEW_SEC = 60;

export function verifyInitData(
  raw: string,
  botToken: string,
  opts: { maxAgeSec: number; nowSec?: number },
): VerifiedInitData {
  if (!botToken) throw new InitDataError("telegram_init_invalid");
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_RAW_BYTES) {
    throw new InitDataError("telegram_init_malformed");
  }

  // Parse by hand on top of URLSearchParams so a DUPLICATED key is refused:
  // URLSearchParams.get() would silently pick the first, letting a forged
  // second copy ride along in a value the caller reads differently.
  const params = new URLSearchParams(raw);
  const fields = new Map<string, string>();
  for (const [key, value] of params) {
    if (key.length === 0 || fields.has(key)) throw new InitDataError("telegram_init_malformed");
    fields.set(key, value);
  }

  const hash = fields.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) throw new InitDataError("telegram_init_malformed");

  const checkString = [...fields.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(checkString).digest();
  const presented = Buffer.from(hash, "hex");
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
    throw new InitDataError("telegram_init_invalid");
  }

  // Only now — after the signature holds — is any field worth reading.
  const authDateRaw = fields.get("auth_date");
  if (!authDateRaw || !/^[0-9]{1,12}$/.test(authDateRaw)) {
    throw new InitDataError("telegram_init_malformed");
  }
  const authDate = Number(authDateRaw);
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  if (authDate > now + FUTURE_SKEW_SEC || now - authDate > opts.maxAgeSec) {
    throw new InitDataError("telegram_init_expired");
  }

  const userRaw = fields.get("user");
  if (!userRaw) throw new InitDataError("telegram_init_no_user");
  let parsed: unknown;
  try {
    parsed = JSON.parse(userRaw);
  } catch {
    throw new InitDataError("telegram_init_malformed");
  }
  const user = toUser(parsed);
  if (!user) throw new InitDataError("telegram_init_malformed");
  if (user.is_bot === true) throw new InitDataError("telegram_init_no_user");

  const startParam = fields.get("start_param") ?? null;
  return {
    user,
    authDate,
    hash,
    startParam: startParam && startParam.length <= 512 ? startParam : null,
    chatType: fields.get("chat_type") ?? null,
  };
}

/** Keep only the fields we use, each type-checked. Unknown fields are dropped. */
function toUser(value: unknown): TelegramWebAppUser | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "number" || !Number.isSafeInteger(v.id) || v.id <= 0) return null;
  if (typeof v.first_name !== "string") return null;
  const str = (x: unknown, max: number) =>
    typeof x === "string" && x.length > 0 ? x.slice(0, max) : undefined;
  return {
    id: v.id,
    is_bot: v.is_bot === true,
    first_name: v.first_name.slice(0, 128),
    last_name: str(v.last_name, 128),
    username: typeof v.username === "string" && /^[A-Za-z0-9_]{1,64}$/.test(v.username)
      ? v.username
      : undefined,
    language_code: typeof v.language_code === "string" && /^[A-Za-z-]{2,16}$/.test(v.language_code)
      ? v.language_code.toLowerCase()
      : undefined,
    allows_write_to_pm: v.allows_write_to_pm === true,
  };
}

/** "@alice" when there is a username, else the first name. */
export function telegramDisplay(u: { username?: string | null; first_name?: string | null; firstName?: string | null }): string {
  if (u.username) return `@${u.username}`;
  return (u.first_name ?? u.firstName ?? "Telegram").trim() || "Telegram";
}
