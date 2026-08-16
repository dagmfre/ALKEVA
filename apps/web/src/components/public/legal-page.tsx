import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Wordmark } from "@/components/brand/mark";
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
      <header className="flex min-h-[72px] items-center justify-between px-5 lg:px-10">
        <Link href="/welcome">
          <Wordmark size={30} />
        </Link>
        <LocaleToggle />
      </header>

      <article className="mx-auto w-full max-w-[44rem] flex-1 px-5 pb-16 pt-6">
        <h1 className="text-2xl font-semibold">
          {kind === "terms" ? t("termsTitle") : t("privacyTitle")}
        </h1>

        <p className="mt-4 rounded-md border border-border bg-popover px-4 py-3 text-[0.9375rem] leading-relaxed text-platinum-400">
          {t("legalDraftNotice")}
        </p>

        <div className="mt-6 flex flex-col gap-5 text-[0.9375rem] leading-relaxed text-muted-foreground">
          {sections.map((key) => (
            <p key={key}>{t(key)}</p>
          ))}
        </div>

        <Link
          href="/welcome"
          className="mt-10 inline-block text-[0.9375rem] text-gold-400 underline-offset-4 hover:underline"
        >
          ← ALKEVA
        </Link>
      </article>
    </main>
  );
}
