import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Wordmark } from "@/components/brand/mark";
import { LandingHeroVisual, LandingMarket, PriceCell } from "@/components/public/landing-market";
import { LocaleToggle } from "@/components/shell/locale-toggle";
import { TierMark } from "@/components/shell/nav-items";
import { Button } from "@/components/ui/button";

const TIER_LADDER = ["Gold", "Tanzanite", "Ruby", "Sapphire", "Emerald"] as const;

/**
 * The front door. A signed-out visit to "/" lands here (middleware).
 *
 * The page is built out of the product's own materials rather than marketing
 * furniture: the real price feed, the real 3D bar, the real receipt document,
 * and the five gates the code actually enforces. Anything a visitor reads here
 * can be checked inside the app in one click — the landing page must never
 * promise what the app won't show.
 */
export default async function WelcomePage() {
  const t = await getTranslations("public");
  const tt = await getTranslations("tier");

  const rules = [1, 2, 3, 4, 5].map((n) => ({
    n,
    title: t(`rule${n}Title` as never),
    body: t(`rule${n}Body` as never),
  }));

  const steps = [1, 2, 3].map((n) => ({
    n,
    title: t(`step${n}Title` as never),
    body: t(`step${n}Body` as never),
  }));

  const ethiopia = [1, 2, 3, 4].map((n) => ({
    n,
    title: t(`ethiopia${n}Title` as never),
    body: t(`ethiopia${n}Body` as never),
  }));

  const faqs = [1, 2, 3, 4, 5, 6].map((n) => ({
    n,
    q: t(`faq${n}Q` as never),
    a: t(`faq${n}A` as never),
  }));

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-(--z-index-sticky) border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex min-h-[68px] w-full max-w-[76rem] items-center justify-between gap-4 px-5 lg:px-8">
          <Wordmark size={30} />
          <div className="flex items-center gap-2.5">
            <LocaleToggle />
            <Button variant="outline" size="pill" asChild>
              <Link href="/login">{t("signIn")}</Link>
            </Button>
            <Button size="pill" className="hidden sm:inline-flex" asChild>
              <Link href="/register">{t("createAccount")}</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="border-b border-border">
        <div className="mx-auto grid w-full max-w-[76rem] grid-cols-1 items-center gap-8 px-5 pb-14 pt-12 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:px-8 lg:pb-20 lg:pt-16">
          <div className="rise">
            <h1 className="max-w-[18ch] text-[clamp(2.25rem,5vw,3.75rem)] font-semibold leading-[1.08] tracking-[-0.02em]">
              {t("heroTitle")}
            </h1>
            <p className="mt-5 max-w-[52ch] text-[1.0625rem] leading-relaxed text-muted-foreground lg:text-lg">
              {t("heroBody")}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="cta" className="sm:w-auto sm:min-w-[15rem] sm:px-8" asChild>
                <Link href="/register">{t("heroCta")}</Link>
              </Button>
              <Button variant="outline" size="cta" className="sm:w-auto sm:px-6" asChild>
                <Link href="#market">{t("heroSecondaryCta")}</Link>
              </Button>
            </div>

            <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-[0.9375rem] text-muted-foreground">
              {[t("heroFact1"), t("heroFact2"), t("heroFact3")].map((fact) => (
                <li key={fact} className="flex items-center gap-2">
                  <span aria-hidden="true" className="text-gold-400">
                    ◆
                  </span>
                  {fact}
                </li>
              ))}
            </ul>
          </div>

          <div className="rise rise-late">
            <LandingHeroVisual />
          </div>
        </div>
      </section>

      {/* ── The live market ──────────────────────────────────────── */}
      <section id="market" className="scroll-mt-20 border-b border-border">
        <div className="mx-auto w-full max-w-[76rem] px-5 py-14 lg:px-8 lg:py-20">
          <div className="max-w-[46rem]">
            <h2 className="text-[clamp(1.625rem,3vw,2.25rem)] font-semibold leading-tight tracking-[-0.01em]">
              {t("marketTitle")}
            </h2>
            <p className="mt-3 text-[1.0625rem] leading-relaxed text-muted-foreground">
              {t("marketBody")}
            </p>
          </div>
          <div className="mt-8">
            <LandingMarket />
          </div>
        </div>
      </section>

      {/* ── Three steps. Numbered because it is genuinely a sequence. ── */}
      <section className="border-b border-border">
        <div className="mx-auto w-full max-w-[76rem] px-5 py-14 lg:px-8 lg:py-20">
          <h2 className="max-w-[20ch] text-[clamp(1.625rem,3vw,2.25rem)] font-semibold leading-tight tracking-[-0.01em]">
            {t("stepsTitle")}
          </h2>
          <ol className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
            {steps.map((step) => (
              <li key={step.n} className="flex flex-col gap-3 bg-card p-5 lg:p-6">
                <span className="tnum grid size-9 place-items-center rounded-full border border-gold-600 text-[0.9375rem] font-semibold text-gold-400">
                  {step.n}
                </span>
                <h3 className="text-[1.0625rem] font-semibold">{step.title}</h3>
                <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── The five gates ───────────────────────────────────────── */}
      <section className="border-b border-border bg-well/40">
        <div className="mx-auto grid w-full max-w-[76rem] grid-cols-1 gap-8 px-5 py-14 lg:grid-cols-[22rem_1fr] lg:gap-14 lg:px-8 lg:py-20">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <h2 className="text-[clamp(1.625rem,3vw,2.25rem)] font-semibold leading-tight tracking-[-0.01em]">
              {t("rulesTitle")}
            </h2>
            <p className="mt-3 text-[1.0625rem] leading-relaxed text-muted-foreground">
              {t("rulesBody")}
            </p>
          </div>

          <ul className="flex flex-col">
            {rules.map((rule) => (
              <li
                key={rule.n}
                className="flex flex-col gap-2 border-t border-border py-6 first:border-t-0 first:pt-0 md:flex-row md:gap-8"
              >
                <h3 className="flex items-baseline gap-3 text-[1.0625rem] font-semibold md:w-[16rem] md:flex-none">
                  <span className="tnum text-[0.875rem] font-medium text-gold-400">
                    {String(rule.n).padStart(2, "0")}
                  </span>
                  {rule.title}
                </h3>
                <p className="max-w-[60ch] text-[0.9375rem] leading-relaxed text-muted-foreground">
                  {rule.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── The document ─────────────────────────────────────────── */}
      <section className="border-b border-border">
        <div className="mx-auto grid w-full max-w-[76rem] grid-cols-1 items-center gap-8 px-5 py-14 lg:grid-cols-2 lg:gap-14 lg:px-8 lg:py-20">
          <div>
            <h2 className="max-w-[18ch] text-[clamp(1.625rem,3vw,2.25rem)] font-semibold leading-tight tracking-[-0.01em]">
              {t("receiptTitle")}
            </h2>
            <p className="mt-3 max-w-[52ch] text-[1.0625rem] leading-relaxed text-muted-foreground">
              {t("receiptBody")}
            </p>
          </div>

          {/* Clearly labelled as an example: every figure below is illustrative,
              the shape is exactly what the app issues. */}
          <figure className="rounded-lg border border-border bg-card p-5 lg:p-6">
            <figcaption className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-3.5">
              <span className="text-[0.9375rem] font-semibold">ALKEVA</span>
              <span className="rounded-full border border-input px-2.5 py-0.5 text-[0.8125rem] text-muted-foreground">
                {t("receiptExample")}
              </span>
            </figcaption>
            <dl className="flex flex-col">
              <ReceiptLine label={t("receiptSerialLabel")} value={t("receiptSerialSample")} mono />
              <ReceiptLine label={t("receiptMetalLabel")} value={t("receiptMetalSample")} />
              <ReceiptLine label={t("receiptQtyLabel")} value="5.000 g" mono />
              <ReceiptLine label={t("receiptUnitLabel")} value="22,700.00" mono />
              <ReceiptLine label={t("receiptFeeLabel")} value="2,270.00" mono />
              <div className="mt-2 flex items-baseline justify-between border-t border-input pt-3.5">
                <dt className="text-[0.9375rem] font-semibold">{t("receiptTotalLabel")}</dt>
                <dd className="tnum text-[1.375rem] font-semibold text-gold-400">115,770.00</dd>
              </div>
              <ReceiptLine
                label={t("receiptSourceLabel")}
                value="swissquote · 14:32 EAT"
                mono
                quiet
              />
            </dl>
          </figure>
        </div>
      </section>

      {/* ── Levels + built for Ethiopia ──────────────────────────── */}
      <section className="border-b border-border">
        <div className="mx-auto w-full max-w-[76rem] px-5 py-14 lg:px-8 lg:py-20">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-14">
            <div>
              <h2 className="text-[clamp(1.625rem,3vw,2.25rem)] font-semibold leading-tight tracking-[-0.01em]">
                {t("tiersTitle")}
              </h2>
              <p className="mt-3 max-w-[52ch] text-[1.0625rem] leading-relaxed text-muted-foreground">
                {t("tiersBody")}
              </p>
              <ol className="mt-6 flex flex-col">
                {TIER_LADDER.map((name, i) => (
                  <li
                    key={name}
                    className="flex items-center gap-3 border-b border-border py-3 last:border-0"
                  >
                    <TierMark size={20} />
                    <span className="text-[0.9375rem] font-medium">
                      {tt(`names.${name}` as never)}
                    </span>
                    <span
                      aria-hidden="true"
                      className="ms-auto h-1.5 w-full max-w-[10rem] overflow-hidden rounded-full bg-well"
                    >
                      <span
                        className="block h-full rounded-full bg-platinum-500"
                        style={{ width: `${((i + 1) / TIER_LADDER.length) * 100}%` }}
                      />
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-[0.875rem] text-subtle">{t("tiersNote")}</p>
            </div>

            <div>
              <h2 className="text-[clamp(1.625rem,3vw,2.25rem)] font-semibold leading-tight tracking-[-0.01em]">
                {t("ethiopiaTitle")}
              </h2>
              <div className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
                {ethiopia.map((item) => (
                  <div key={item.n} className="bg-card p-4 lg:p-5">
                    <h3 className="text-[0.9375rem] font-semibold">{item.title}</h3>
                    <p className="mt-1.5 text-[0.875rem] leading-relaxed text-muted-foreground">
                      {item.body}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <PriceCell asset="XAU" />
                <PriceCell asset="XPT" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────── */}
      <section className="border-b border-border">
        <div className="mx-auto w-full max-w-[76rem] px-5 py-14 lg:px-8 lg:py-20">
          <h2 className="text-[clamp(1.625rem,3vw,2.25rem)] font-semibold leading-tight tracking-[-0.01em]">
            {t("faqTitle")}
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-x-10 md:grid-cols-2">
            {faqs.map((item) => (
              <details
                key={item.n}
                className="group border-b border-border py-4 [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[1.0625rem] font-medium">
                  {item.q}
                  <span
                    aria-hidden="true"
                    className="flex-none text-gold-400 transition-transform duration-150 group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-2.5 max-w-[60ch] text-[0.9375rem] leading-relaxed text-muted-foreground">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Close. The one place the page lets the metal fill the frame. ── */}
      <section className="relative isolate overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 [background:radial-gradient(70%_120%_at_50%_0%,oklch(0.868_0.175_96.5/0.14),transparent_65%)]"
        />
        <div className="mx-auto flex w-full max-w-[76rem] flex-col items-start gap-6 px-5 py-16 lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:py-24">
          <div>
            <h2 className="max-w-[20ch] text-[clamp(1.625rem,3vw,2.25rem)] font-semibold leading-tight tracking-[-0.01em]">
              {t("ctaTitle")}
            </h2>
            <p className="mt-3 max-w-[46ch] text-[1.0625rem] leading-relaxed text-muted-foreground">
              {t("ctaBody")}
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[16rem]">
            <Button size="cta" className="lg:px-8" asChild>
              <Link href="/register">{t("heroCta")}</Link>
            </Button>
            {/* The registration is evidence, so it sits beside the primary
                action rather than being buried in the footer — but it stays
                the quieter of the two: a visitor came here to hold gold, not
                to read a certificate. */}
            <Button variant="outline" size="pill" asChild>
              <Link href="/copyright">{t("copyrightCta")}</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border px-5 py-7 lg:px-8">
        <div className="mx-auto flex w-full max-w-[76rem] flex-col gap-3 text-[0.875rem] text-subtle sm:flex-row sm:items-center sm:justify-between">
          <span className="max-w-[46ch]">{t("footerNote")}</span>
          <span className="flex flex-wrap items-center gap-5">
            <Link href="/terms" className="hover:text-foreground">
              {t("termsTitle")}
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              {t("privacyTitle")}
            </Link>
            <span className="font-latin">© {new Date().getFullYear()} ALKEVA</span>
          </span>
        </div>
      </footer>
    </main>
  );
}

function ReceiptLine({
  label,
  value,
  mono,
  quiet,
}: {
  label: string;
  value: string;
  mono?: boolean;
  quiet?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-[0.9375rem] text-muted-foreground">{label}</dt>
      <dd
        className={`text-[0.9375rem] ${mono ? "tnum" : ""} ${
          quiet ? "text-subtle" : "font-medium"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
