import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Mark } from "@/components/brand/mark";
import { LocaleToggle } from "@/components/shell/locale-toggle";

/**
 * Terms of Service / Privacy Policy.
 *
 * The text is a clearly-labelled DRAFT: the real legal wording is a
 * client-owned open item (spec §3, CLAUDE.md open items) and this page never
 * invents legal claims — it states the platform's actual mechanics (the same
 * facts the app itself shows) and flags that counsel-approved terms replace
 * it before launch. The register consent checkbox links here.
 */
export async function LegalPage({ kind }: { kind: "terms" | "privacy" }) {
  const t = await getTranslations("public");
  const sections =
    kind === "terms"
      ? (["legalTerms1", "legalTerms2", "legalTerms3"] as const)
      : (["legalPrivacy1", "legalPrivacy2", "legalPrivacy3"] as const);

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-(--z-index-sticky) flex h-[3.75rem] items-center justify-between bg-bg-deep px-4 lg:px-8">
        <Link href="/welcome" className="flex items-center gap-2.5">
          <Mark size={28} />
          <span className="font-latin text-[0.9375rem] font-extrabold tracking-[0.22em]">ALKEVA</span>
        </Link>
        <LocaleToggle />
      </header>

      <article className="mx-auto my-6 w-[calc(100%-2rem)] max-w-[46rem] flex-1 rounded-[1.25rem] border border-border bg-card px-6 pt-8 pb-10 lg:my-10 lg:px-12">
        <span className="data-label">ALKEVA · {kind === "terms" ? "terms" : "privacy"}</span>
        <h1 className="mt-2 text-[2rem] leading-tight font-extrabold tracking-[-0.02em]">
          {kind === "terms" ? t("termsTitle") : t("privacyTitle")}
        </h1>

        <p className="mt-5 rounded-[0.75rem] border border-platinum-400/25 bg-platinum-400/8 px-4 py-3 text-[0.875rem] leading-relaxed text-platinum-400">
          {t("legalDraftNotice")}
        </p>

        <ol className="mt-8 flex flex-col gap-6">
          {sections.map((key, i) => (
            <li key={key} className="flex gap-4">
              <span className="tnum mt-0.5 text-[0.8125rem] text-gold-400">{String(i + 1).padStart(2, "0")}</span>
              <p className="max-w-[62ch] text-[0.9375rem] leading-relaxed text-muted-foreground">{t(key)}</p>
            </li>
          ))}
        </ol>

        <Link
          href="/welcome"
          className="mt-10 inline-block text-[0.875rem] font-semibold text-gold-400 hover:text-gold-300"
        >
          ← ALKEVA
        </Link>
      </article>
    </main>
  );
}
