/**
 * Display formatting for money and metal.
 *
 * The API speaks integers as digit strings (ETB cents, metal milligrams) so
 * nothing is lost to floating point on the wire. These helpers are the ONLY
 * place a string becomes a rendered number, and they never round: the quote
 * engine already rounded exactly once, and the UI shows what the ledger holds.
 *
 * Money is never abbreviated — `112,629.25`, never `112.6k`. Abbreviating
 * someone's savings reads as evasive (`design/antipatterns.md` §3).
 */
import { DEFAULT_LOCALE, LOCALE_META, isLocale } from "@alkeva/shared/locales";

const GROUPED = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const GRAMS = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

/** ETB cents → "112,629.25". Handles the leading "-" on signed values. */
export function money(cents: string | bigint): string {
  const v = typeof cents === "bigint" ? cents : BigInt(cents || "0");
  const negative = v < 0n;
  const abs = negative ? -v : v;
  const whole = abs / 100n;
  const frac = abs % 100n;
  const text = GROUPED.format(Number(whole) + Number(frac) / 100);
  // Re-derive from the bigint for values beyond Number's safe range, where
  // the Intl round-trip above would drift.
  const safe =
    whole <= 9_007_199_254_740n
      ? text
      : `${whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac.toString().padStart(2, "0")}`;
  return negative ? `−${safe}` : safe;
}

/** Milligrams → "5.000" grams. */
export function grams(mg: string | bigint): string {
  const v = typeof mg === "bigint" ? mg : BigInt(mg || "0");
  const negative = v < 0n;
  const abs = negative ? -v : v;
  const text = GRAMS.format(Number(abs) / 1000);
  return negative ? `−${text}` : text;
}

/** Grams as a user typed them → milligram digit string. */
export function gramsToMg(input: string): bigint | null {
  const parsed = Number.parseFloat(input.replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return BigInt(Math.round(parsed * 1000));
}

/** Milli-percent (1962) → "1.96". Sign is rendered separately. */
export function pctMilli(milli: string | null): string | null {
  if (milli === null) return null;
  const v = BigInt(milli);
  const abs = v < 0n ? -v : v;
  return (Number(abs) / 1000).toFixed(2);
}

export type Direction = "up" | "down" | "flat";

export function direction(signed: string | bigint): Direction {
  const v = typeof signed === "bigint" ? signed : BigInt(signed || "0");
  if (v > 0n) return "up";
  if (v < 0n) return "down";
  return "flat";
}

/**
 * Gain/loss is never colour-only — every rendering pairs the colour with an
 * arrow and an explicit sign, because roughly 8% of male users cannot
 * separate our red from our green.
 */
export const ARROW: Record<Direction, string> = { up: "↑", down: "↓", flat: "·" };
export const SIGN: Record<Direction, string> = { up: "+", down: "−", flat: "" };

export function deltaClass(dir: Direction): string {
  if (dir === "up") return "text-gain";
  if (dir === "down") return "text-loss";
  return "text-muted-foreground";
}

/** Absolute money with the sign carried by SIGN[], so "−" is never doubled. */
export function signedMoney(cents: string): string {
  const v = BigInt(cents || "0");
  return money(v < 0n ? -v : v);
}

/**
 * BCP-47 tag for Intl, from the app locale. Where the runtime's ICU data has
 * no month names for a language (Afaan Oromoo is the likely gap), Intl falls
 * back on its own — a Latin-script month name, never a crash.
 */
function intlTag(locale: string): string {
  return isLocale(locale) ? LOCALE_META[locale].intl : LOCALE_META[DEFAULT_LOCALE].intl;
}

/** "14:32" in the viewer's timezone. */
export function timeOfDay(iso: string, locale: string): string {
  return new Date(iso).toLocaleTimeString(intlTag(locale), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Gregorian with localized month names. Ethiopia uses the Ethiopian calendar
 * in daily life, which is an open client decision (`design/screens.md`) — until
 * it is answered, receipts and history stay Gregorian so the date on a receipt
 * always matches the ledger timestamp it came from.
 */
export function longDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(intlTag(locale), {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

const EAT = "Africa/Addis_Ababa";

const EAT_STAMP = new Intl.DateTimeFormat("en-GB", {
  timeZone: EAT,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * "13 Aug 2026 · 14:32 EAT" — the top bar's clock and the receipt's timestamp.
 *
 * Pinned to Addis Ababa in both locales rather than the viewer's zone: this is
 * an Ethiopian product, the ledger is read in Ethiopian time, and a receipt
 * whose hour changes with the reader's laptop is not a record. Latin figures
 * because Amharic uses Western numerals (`design/design.md` §2).
 */
export function eatStamp(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const parts = EAT_STAMP.formatToParts(d);
  const at = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${at("day")} ${at("month")} ${at("year")} · ${at("hour")}:${at("minute")} EAT`;
}

const EAT_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: EAT,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const EAT_DAY = new Intl.DateTimeFormat("en-GB", {
  timeZone: EAT,
  day: "numeric",
  month: "short",
});
const EAT_MONTH = new Intl.DateTimeFormat("en-GB", { timeZone: EAT, month: "short" });

/** Chart x-axis label: clock time inside a day, calendar date beyond one. */
export function axisLabel(iso: string, range: string): string {
  const d = new Date(iso);
  if (range === "24h") return EAT_TIME.format(d);
  if (range === "1y") return EAT_MONTH.format(d);
  return EAT_DAY.format(d);
}

/** Signed percentage as "+2.41" / "−0.83", or null when it cannot be computed. */
export function signedPct(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(2)}`;
}

/** USD cents → "810.93" for the tier band reference. */
export function usd(cents: string): string {
  return GROUPED.format(Number(BigInt(cents || "0")) / 100);
}

/**
 * Reserve coverage as "38.9×". The demo vault is backed tens of times over,
 * so this is deliberately not a 0–100% gauge (`design/screens.md`).
 */
export function coverage(ratioPctMilli: string | null): string | null {
  if (ratioPctMilli === null) return null;
  const times = Number(BigInt(ratioPctMilli)) / 100_000;
  return `${times.toFixed(1)}×`;
}
