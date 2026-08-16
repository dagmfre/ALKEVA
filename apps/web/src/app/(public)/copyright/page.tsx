import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Wordmark } from "@/components/brand/mark";
import { LocaleToggle } from "@/components/shell/locale-toggle";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "ALKEVA — Copyright registration",
};

/**
 * The copyright certificate, shown as a record rather than a badge.
 *
 * ALKEVA is registered with the Ethiopian Intellectual Property Authority, and
 * this page exists so a visitor can verify that themselves instead of taking a
 * trust-mark's word for it: the registration number, the issuing authority and
 * the scanned certificate are all on the page. That is the same principle the
 * rest of the product follows — the landing page shows the real price feed and
 * a real receipt, so the credibility page shows the real document.
 *
 * The figures below are transcribed from the certificate so they are
 * selectable, searchable and readable by a screen reader; the scan is the
 * evidence, the text is the transcript. Personal contact details printed on
 * the certificate are deliberately NOT transcribed here.
 */
export default async function CopyrightPage() {
  const t = await getTranslations("credential");

  const facts = [
    { label: t("factAuthority"), value: t("factAuthorityValue") },
    { label: t("factTitle"), value: "አልኬቫ (ALKEVA)", latin: true },
    { label: t("factRegNo"), value: "8/1/00317", latin: true },
    { label: t("factAppNo"), value: "CMP/W/12588/2018", latin: true },
    { label: t("factClass"), value: t("factClassValue") },
    { label: t("factScope"), value: t("factScopeValue") },
  ];

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-(--z-index-sticky) border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex min-h-[68px] w-full max-w-[76rem] items-center justify-between gap-4 px-5 lg:px-8">
          <Link href="/welcome" aria-label="ALKEVA">
            <Wordmark size={30} />
          </Link>
          <div className="flex items-center gap-2.5">
            <LocaleToggle />
            <Button variant="outline" size="pill" asChild>
              <Link href="/welcome">{t("backToSite")}</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Statement ──────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden border-b border-border">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 [background:radial-gradient(60%_110%_at_50%_0%,oklch(0.868_0.175_96.5/0.12),transparent_65%)]"
        />
        <div className="mx-auto w-full max-w-[76rem] px-5 py-14 lg:px-8 lg:py-20">
          <p className="text-[0.8125rem] font-medium uppercase tracking-[0.14em] text-gold-400 font-latin">
            {t("eyebrow")}
          </p>
          <h1 className="mt-3 max-w-[24ch] text-[clamp(1.75rem,3.4vw,2.5rem)] font-semibold leading-tight tracking-[-0.01em]">
            {t("title")}
          </h1>
          <p className="mt-4 max-w-[62ch] text-[1.0625rem] leading-relaxed text-muted-foreground">
            {t("body")}
          </p>
        </div>
      </section>

      {/* ── Transcript + document ──────────────────────────────────────── */}
      <section className="mx-auto grid w-full max-w-[76rem] flex-1 gap-8 px-5 py-12 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-12 lg:px-8 lg:py-16">
        <div className="lg:sticky lg:top-[92px] lg:self-start">
          <h2 className="text-[0.8125rem] font-medium uppercase tracking-[0.14em] text-subtle">
            {t("registryHeading")}
          </h2>
          <dl className="mt-4 flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
            {facts.map((f) => (
              <div key={f.label} className="px-4 py-3.5">
                <dt className="text-[0.8125rem] text-subtle">{f.label}</dt>
                <dd
                  className={`mt-1 text-[0.9375rem] leading-snug text-foreground ${
                    f.latin ? "font-latin tnum" : ""
                  }`}
                >
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-4 text-[0.8125rem] leading-relaxed text-subtle">
            {t("transcriptNote")}
          </p>

          <Button variant="outline" size="pill" className="mt-5 w-full" asChild>
            <a
              href="/legal/copyright-certificate.jpg"
              target="_blank"
              rel="noreferrer"
            >
              {t("openFullSize")}
            </a>
          </Button>
        </div>

        <figure className="min-w-0">
          {/* The scan is the evidence, so it gets the frame and the room: a
              plain white document on a warm dark ground, sized to the column
              rather than cropped. `unoptimized` keeps the certificate
              byte-identical to the file the authority issued — a re-encoded
              legal document is a worse artefact, however small. */}
          <div className="overflow-hidden rounded-lg border border-border bg-white p-2 shadow-[0_1px_0_oklch(1_0_0/0.04)_inset]">
            <Image
              src="/legal/copyright-certificate.jpg"
              alt={t("certificateAlt")}
              width={2159}
              height={3000}
              unoptimized
              priority
              className="h-auto w-full rounded"
            />
          </div>
          <figcaption className="mt-3 text-[0.8125rem] leading-relaxed text-subtle">
            {t("caption")}
          </figcaption>
        </figure>
      </section>

      <footer className="border-t border-border px-5 py-7 lg:px-8">
        <div className="mx-auto flex w-full max-w-[76rem] flex-col gap-3 text-[0.875rem] text-subtle sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-[52ch]">{t("footerNote")}</span>
          <span className="flex flex-wrap items-center gap-5">
            <Link href="/terms" className="hover:text-foreground">
              {t("termsLink")}
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              {t("privacyLink")}
            </Link>
            <span className="font-latin">© {new Date().getFullYear()} ALKEVA</span>
          </span>
        </div>
      </footer>
    </main>
  );
}
