import type { AbstractIntlMessages } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, FALLBACK_LOCALE, LOCALES, isLocale, type Locale } from "@alkeva/shared/locales";

export { DEFAULT_LOCALE, LOCALES, type Locale };
export const LOCALE_COOKIE = "ALKEVA_LOCALE";

type Messages = AbstractIntlMessages;

/**
 * Locale messages layered over the fallback locale's, key by key.
 *
 * Every shipped language should be complete — `pnpm i18n:report` prints what
 * is missing — but a partially translated file must degrade to a readable
 * string, not to next-intl's MISSING_MESSAGE error in the middle of a trade
 * screen. Merging here means a new language can go live the moment its
 * high-traffic sections are translated, with the rest arriving later.
 */
function deepMerge(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = out[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      existing &&
      typeof existing === "object" &&
      !Array.isArray(existing)
    ) {
      out[key] = deepMerge(existing as Messages, value as Messages);
    } else if (typeof value === "string" && value !== "") {
      out[key] = value;
    }
  }
  return out;
}

async function load(locale: Locale): Promise<Messages> {
  return (await import(`../../messages/${locale}.json`)).default as Messages;
}

/** Cookie-based locale (no URL prefixes) — Amharic by default (Q62). */
export default getRequestConfig(async () => {
  const store = await cookies();
  const raw = store.get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(raw) ? raw : DEFAULT_LOCALE;

  const fallback = await load(FALLBACK_LOCALE);
  const messages = locale === FALLBACK_LOCALE ? fallback : deepMerge(fallback, await load(locale));

  return { locale, messages };
});
