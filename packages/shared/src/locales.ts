/**
 * The languages ALKEVA ships in — one registry, imported by the web app, the
 * API, the email templates and the AI prompt, so a language can never be half
 * added (a locale the UI offers but the API rejects, or vice versa).
 *
 * Ethiopia is multilingual by constitution and the platform is sold to people
 * who do not all read Amharic. Adding a language is deliberately cheap: append
 * an entry here and drop a `messages/<code>.json` into the web app. There is
 * no database migration and no enum to widen — `user.locale` is plain text
 * validated at the API boundary against this list (migration 0009), precisely
 * so the next language is a translation job and not a schema change.
 *
 * `script` drives typography: Ethiopic needs a taller line box and forbids
 * letter-spacing and uppercase (`globals.css`), Latin does not.
 *
 * This module imports nothing, and is exported as the `@alkeva/shared/locales`
 * subpath so client components can import its VALUES. The package barrel
 * re-exports the Node-only `env.ts`, which webpack cannot resolve for the
 * browser — the failure that broke `/kyc` and `countdown-ring` before. Import
 * this subpath, never the barrel, from anything that ships to a browser.
 *
 * `emailLocale` is the honest part. The transactional email templates exist in
 * Amharic and English only; a Tigrinya or Oromo user gets English mail until
 * those templates are translated and reviewed. The UI is not held back by
 * that, but the mapping is stated here rather than hidden in a ternary.
 */
export const LOCALES = ["am", "en", "ti", "om", "so"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "am";

/** The locale message files fall back to when a key is not yet translated. */
export const FALLBACK_LOCALE: Locale = "en";

export interface LocaleMeta {
  /** The language's own name, as its speakers write it. */
  native: string;
  /** English name — used in staff tooling and logs, never in the user UI. */
  english: string;
  script: "ethiopic" | "latin";
  /** BCP-47 tag for Intl date/number formatting. */
  intl: string;
  /** Which email template set this locale receives today. */
  emailLocale: "am" | "en";
  /** How the AI assistant is told to answer. */
  aiName: string;
}

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  am: {
    native: "አማርኛ",
    english: "Amharic",
    script: "ethiopic",
    intl: "am-ET",
    emailLocale: "am",
    aiName: "Amharic (አማርኛ)",
  },
  en: {
    native: "English",
    english: "English",
    script: "latin",
    intl: "en-GB",
    emailLocale: "en",
    aiName: "English",
  },
  ti: {
    native: "ትግርኛ",
    english: "Tigrinya",
    script: "ethiopic",
    intl: "ti-ET",
    emailLocale: "en",
    aiName: "Tigrinya (ትግርኛ)",
  },
  om: {
    native: "Afaan Oromoo",
    english: "Oromo",
    script: "latin",
    intl: "om-ET",
    emailLocale: "en",
    aiName: "Afaan Oromoo (Oromo)",
  },
  so: {
    native: "Soomaali",
    english: "Somali",
    script: "latin",
    intl: "so-ET",
    emailLocale: "en",
    aiName: "Somali (Soomaali)",
  },
};

export const isLocale = (value: unknown): value is Locale =>
  typeof value === "string" && (LOCALES as readonly string[]).includes(value);

export const toLocale = (value: unknown): Locale => (isLocale(value) ? value : DEFAULT_LOCALE);

/** The email template set to use for a locale — see the note above. */
export const emailLocaleFor = (locale: Locale): "am" | "en" => LOCALE_META[locale].emailLocale;
