import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Languages, ShieldCheck, Timer } from "lucide-react";

import { Mark } from "@/components/brand/mark";
import { PriceProvider } from "@/components/market/price-provider";
import { TickerStrip } from "@/components/market/ticker-strip";
import { LandingHeroVisual, LandingMarket } from "@/components/public/landing-market";
import { LocaleToggle } from "@/components/shell/locale-toggle";
import { TierMark } from "@/components/shell/nav-items";
import { Button } from "@/components/ui/button";

const TIER_LADDER = ["Gold", "Tanzanite", "Ruby", "Sapphire", "Emerald"] as const;

/**
 * The front door (FBS composition, design v2). A signed-out visit to "/"
 * lands here (middleware).
 *
 * Built from the product's own materials: the real price feed and its
 * arithmetic, the real 3D bars, the receipt document, and the five gates the
 * code actually enforces. Anything a visitor reads here can be checked inside
 * the app in one click — the landing page never promises what the app won't
 * show. The one illustrative object, the receipt, is labelled as an example.
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
  const nav = [
    { href: "#market", label: t("navPrices") },
    { href: "#how", label: t("navHow") },
    { href: "#rules", label: t("navRules") },
    { href: "#tiers", label: t("navTiers") },
    { href: "#faq", label: t("navFaq") },
  ];
  const trust = [
    { icon: ShieldCheck, title: t("heroTrust1Title"), body: t("heroTrust1Body") },
    { icon: Timer, title: t("heroTrust2Title"), body: t("heroTrust2Body") },
    { icon: Languages, title: t("heroTrust3Title"), body: t("heroTrust3Body") },
  ];
  const h2 = "text-[clamp(1.75rem,3.2vw,2.75rem)] leading-[1.05] font-extrabold tracking-[-0.02em]";

  return (
    <PriceProvider>
      <main className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-(--z-index-sticky) bg-background/90 backdrop-blur-md">
          <div className="mx-auto flex h-[4.5rem] w-full max-w-[80rem] items-center justify-between gap-4 px-4 lg:h-[5.25rem] lg:px-8">
            <Link href="/welcome" className="flex items-center gap-3">
              <Mark size={34} />
              <span className="font-latin text-[1.0625rem] font-extrabold tracking-[0.24em]">ALKEVA</span>
            </Link>
            <nav aria-label={t("siteNav")} className="hidden items-center gap-1 lg:flex">
              {nav.map((n) => (
                <a
                  key={n.href}
                  href={n.href}
                  className="rounded-[0.625rem] px-3.5 py-2 text-[0.875rem] font-semibold text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                >
                  {n.label}
                </a>
              ))}
            </nav>
            <div className="flex items-center gap-1.5">
              <LocaleToggle />
              <Button variant="ghost" size="sm" className="hidden text-foreground sm:inline-flex" asChild>
                <Link href="/login">{t("signIn")}</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/register">
                  {t("createAccount")}
                  <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
        </header>

        {/* ── Hero ─────────────────────────────────────────────────── */}
        <section className="mx-auto grid w-full max-w-[80rem] grid-cols-1 items-center gap-6 px-4 pt-6 pb-10 lg:min-h-[38rem] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-8 lg:px-8 lg:pb-14">
          <div className="rise flex flex-col gap-6">
            <span className="text-[0.8125rem] font-semibold text-gold-300">{t("kicker")}</span>
            <h1 className="max-w-[14ch] text-[clamp(2.5rem,6.2vw,4.75rem)] leading-[0.98] font-extrabold tracking-[-0.03em] text-[#e9e6e0] uppercase">
              {t("heroTitle")}
            </h1>
            <p className="max-w-[46ch] text-[1.0625rem] leading-relaxed text-muted-foreground lg:text-[1.125rem]">
              {t("heroBody")}
            </p>
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <Button size="cta" className="sm:w-auto sm:px-7" asChild>
                <Link href="/register">
                  {t("heroCta")}
                  <ArrowRight />
                </Link>
              </Button>
              <Button variant="outline" size="cta" className="sm:w-auto sm:px-6" asChild>
                <a href="#market">{t("heroSecondaryCta")}</a>
              </Button>
            </div>
            <ul className="grid max-w-[36rem] grid-cols-1 gap-4 pt-3 sm:grid-cols-3">
              {trust.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-3">
                  <Icon className="mt-0.5 size-6 flex-none text-gold-400" strokeWidth={1.6} aria-hidden="true" />
                  <span>
                    <span className="block text-[0.875rem] font-bold">{title}</span>
                    <span className="mt-0.5 block text-[0.78125rem] leading-snug text-subtle">{body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rise rise-late">
            <LandingHeroVisual />
          </div>
        </section>

        {/* ── The live market ──────────────────────────────────────── */}
        <section id="market" className="mx-auto flex w-full max-w-[80rem] scroll-mt-24 flex-col gap-3 px-4 pb-16 lg:px-8 lg:pb-24">
          <TickerStrip />
          <div className="mt-8 mb-3 flex flex-col gap-2 lg:mt-12">
            <h2 className={h2}>{t("marketTitle")}</h2>
          </div>
          <LandingMarket />
        </section>

        {/* ── Three steps. Numbered because it is genuinely a sequence. ── */}
        <section id="how" className="mx-auto w-full max-w-[80rem] scroll-mt-24 px-4 pb-16 lg:px-8 lg:pb-24">
          <h2 className={`${h2} mb-8 max-w-[20ch]`}>{t("stepsTitle")}</h2>
          <ol className="grid grid-cols-1 border-t border-input md:grid-cols-3">
            {steps.map((s, i) => (
              <li
                key={s.n}
                className={`flex flex-col gap-2.5 py-6 md:py-7 ${i > 0 ? "border-t border-border md:border-t-0 md:border-s md:ps-7" : ""} ${i < 2 ? "md:pe-7" : ""}`}
              >
                <span className="tnum text-[0.875rem] text-gold-400">{s.n}</span>
                <span className="text-[1.25rem] font-extrabold">{s.title}</span>
                <span className="text-[0.9375rem] leading-relaxed text-muted-foreground">{s.body}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* ── The five gates, beside the document they produce ─────── */}
        <section id="rules" className="mx-auto w-full max-w-[80rem] scroll-mt-24 px-4 pb-16 lg:px-8 lg:pb-24">
          <div className="mb-8 flex max-w-[48rem] flex-col gap-3">
            <h2 className={h2}>{t("rulesTitle")}</h2>
            <p className="text-[1rem] leading-relaxed text-muted-foreground">{t("rulesBody")}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_28rem]">
            <ul className="flex flex-col rounded-[1.25rem] border border-border bg-card px-5 lg:px-7">
              {rules.map((r) => (
                <li key={r.n} className="flex flex-col gap-1.5 border-b border-border py-5 last:border-b-0 md:flex-row md:gap-8">
                  <h3 className="flex items-baseline gap-3 text-[1rem] font-bold md:w-[15rem] md:flex-none">
                    <span className="tnum text-[0.8125rem] text-gold-400">{String(r.n).padStart(2, "0")}</span>
                    {r.title}
                  </h3>
                  <p className="max-w-[60ch] text-[0.875rem] leading-relaxed text-muted-foreground">{r.body}</p>
                </li>
              ))}
            </ul>

            <figure className="flex flex-col gap-4 rounded-[1.25rem] border border-border bg-card p-5 lg:p-7">
              <figcaption className="flex items-center justify-between">
                <span className="text-[0.8125rem] font-bold text-muted-foreground">{t("receiptTitle")}</span>
                <span className="tnum rounded-full bg-white/6 px-2.5 py-0.5 text-[0.6875rem] text-subtle">
                  {t("receiptExample")}
                </span>
              </figcaption>
              {/* Paper, on purpose: a receipt is the one thing here meant to leave the screen. */}
              <div className="flex flex-col gap-2.5 rounded-[0.875rem] bg-[#f3efe6] p-5 text-[#1b1712]">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-latin text-[0.8125rem] font-extrabold tracking-[0.2em]">
                    <Mark size={22} />
                    ALKEVA
                  </span>
                  <span className="tnum text-[0.75rem]">{t("receiptSerialSample")}</span>
                </div>
                <div className="h-px bg-black/12" />
                <PaperLine k={t("receiptMetalLabel")} v={t("receiptMetalSample")} />
                <PaperLine k={t("receiptQtyLabel")} v="5.000 g" />
                <PaperLine k={t("receiptUnitLabel")} v="22,700.00" />
                <PaperLine k={t("receiptFeeLabel")} v="2,270.00" />
                <div className="h-px bg-black/12" />
                <div className="tnum flex justify-between text-[0.9375rem] font-semibold">
                  <span className="font-sans">{t("receiptTotalLabel")}</span>
                  <span>115,770.00 ETB</span>
                </div>
                <p className="tnum mt-1 text-[0.6875rem] text-[#6b645a]">
                  {t("receiptSourceLabel")} · swissquote · 14:32 EAT
                </p>
              </div>
              <p className="mt-auto text-[0.8125rem] leading-relaxed text-muted-foreground">{t("receiptBody")}</p>
            </figure>
          </div>
        </section>

        {/* ── Tiers + built for Ethiopia ──────────────────────────── */}
        <section id="tiers" className="mx-auto w-full max-w-[80rem] scroll-mt-24 px-4 pb-16 lg:px-8 lg:pb-24">
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-12">
            <div className="flex flex-col gap-3">
              <h2 className={h2}>{t("tiersTitle")}</h2>
              <p className="text-[1rem] leading-relaxed text-muted-foreground">{t("tiersBody")}</p>
              <p className="text-[0.8125rem] text-subtle">{t("tiersNote")}</p>
            </div>
            <ol className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
              {TIER_LADDER.map((name, i) => (
                <li
                  key={name}
                  className={`flex flex-col justify-between gap-6 rounded-[0.875rem] border bg-card p-4 ${i >= 3 ? "border-gold-400/30" : "border-border"}`}
                >
                  <TierMark size={22} />
                  <span>
                    <span className="block text-[0.9375rem] font-extrabold">{tt(`names.${name}` as never)}</span>
                    <span className="tnum mt-0.5 block text-[0.6875rem] text-subtle">
                      {i >= 3 ? t("tierDelivery") : t("tierLevel", { n: i + 1 })}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-[1.25rem] border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {ethiopia.map((e) => (
              <div key={e.n} className="flex flex-col gap-2 bg-card p-5 lg:p-6">
                <h3 className="text-[0.9375rem] font-bold">{e.title}</h3>
                <p className="text-[0.84375rem] leading-relaxed text-muted-foreground">{e.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────── */}
        <section id="faq" className="mx-auto w-full max-w-[80rem] scroll-mt-24 px-4 pb-16 lg:px-8 lg:pb-24">
          <h2 className={`${h2} mb-6`}>{t("faqTitle")}</h2>
          <div className="grid grid-cols-1 gap-x-10 md:grid-cols-2">
            {faqs.map((item) => (
              <details
                key={item.n}
                className="group border-b border-border py-4 [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[1rem] font-semibold">
                  {item.q}
                  <span
                    aria-hidden="true"
                    className="grid size-7 flex-none place-items-center rounded-full bg-white/5 text-gold-400 transition-transform duration-150 group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-2.5 max-w-[60ch] text-[0.9375rem] leading-relaxed text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── Close ────────────────────────────────────────────────── */}
        <section className="mx-auto w-full max-w-[80rem] px-4 pb-14 lg:px-8">
          <div className="relative isolate flex flex-col items-start gap-6 overflow-hidden rounded-[1.5rem] border border-gold-400/20 bg-card px-6 py-10 lg:flex-row lg:items-center lg:justify-between lg:px-12 lg:py-14">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10 [background:radial-gradient(60%_140%_at_85%_50%,oklch(0.797_0.09_78.1/0.16),transparent_65%)]"
            />
            <div>
              <h2 className={`${h2} max-w-[18ch]`}>{t("ctaTitle")}</h2>
              <p className="mt-3 max-w-[46ch] text-[1rem] leading-relaxed text-muted-foreground">{t("ctaBody")}</p>
            </div>
            <div className="flex w-full flex-col gap-2.5 lg:w-auto lg:min-w-[16rem]">
              <Button size="cta" className="lg:px-8" asChild>
                <Link href="/register">
                  {t("heroCta")}
                  <ArrowRight />
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/copyright">{t("copyrightCta")}</Link>
              </Button>
            </div>
          </div>
        </section>

        <footer className="border-t border-border px-4 py-7 lg:px-8">
          <div className="mx-auto flex w-full max-w-[80rem] flex-col gap-3 text-[0.8125rem] text-subtle sm:flex-row sm:items-center sm:justify-between">
            <span className="max-w-[52ch]">{t("footerNote")}</span>
            <span className="flex flex-wrap items-center gap-5">
              <Link href="/terms" className="hover:text-foreground">
                {t("termsTitle")}
              </Link>
              <Link href="/privacy" className="hover:text-foreground">
                {t("privacyTitle")}
              </Link>
              <span className="tnum">© {new Date().getFullYear()} ALKEVA</span>
            </span>
          </div>
        </footer>
      </main>
    </PriceProvider>
  );
}

function PaperLine({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between text-[0.8125rem]">
      <span>{k}</span>
      <span className="tnum">{v}</span>
    </div>
  );
}
