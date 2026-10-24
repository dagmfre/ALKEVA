"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Languages, ShieldCheck, Timer } from "lucide-react";

import { Mark } from "@/components/brand/mark";
import { PriceProvider, useAssetPrice } from "@/components/market/price-provider";
import { LocaleToggle } from "@/components/shell/locale-toggle";
import { Coin, DeltaChip } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { money } from "@/lib/format";

/**
 * The frame every signed-out form sits in. On a desk: the brand side (deep
 * ground, the live price, the three promises the code keeps) beside the form
 * panel. On a phone: the form alone under a slim brand bar.
 *
 * The language picker is above the fold on both: someone who cannot read the
 * current language must be able to switch it before authenticating.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("public");

  return (
    <PriceProvider>
      <main className="grid min-h-dvh w-full grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <aside className="relative isolate hidden flex-col justify-between overflow-hidden bg-bg-deep p-10 lg:flex xl:p-14">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 [background:radial-gradient(70%_55%_at_30%_70%,oklch(0.797_0.09_78.1/0.14),transparent_70%)]"
          />
          <Link href="/welcome" className="flex items-center gap-3">
            <Mark size={34} />
            <span className="font-latin text-[1.0625rem] font-extrabold tracking-[0.24em]">ALKEVA</span>
          </Link>

          <div className="flex flex-col gap-8">
            <span className="text-[0.8125rem] font-semibold text-gold-300">{t("kicker")}</span>
            <h2 className="max-w-[14ch] text-[clamp(2.5rem,4.4vw,4rem)] leading-[0.98] font-extrabold tracking-[-0.03em] text-[#e9e6e0] uppercase">
              {t("heroTitle")}
            </h2>
            <LivePrices />
          </div>

          <ul className="grid grid-cols-3 gap-5">
            {[
              { icon: ShieldCheck, title: t("heroTrust1Title"), body: t("heroTrust1Body") },
              { icon: Timer, title: t("heroTrust2Title"), body: t("heroTrust2Body") },
              { icon: Languages, title: t("heroTrust3Title"), body: t("heroTrust3Body") },
            ].map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex flex-col gap-2">
                <Icon className="size-5 text-gold-400" strokeWidth={1.6} aria-hidden="true" />
                <span className="text-[0.8125rem] font-bold">{title}</span>
                <span className="text-[0.75rem] leading-snug text-subtle">{body}</span>
              </li>
            ))}
          </ul>
        </aside>

        <div className="flex min-h-dvh flex-col">
          <div className="flex h-16 items-center justify-between px-4 lg:justify-end lg:px-8">
            <Link href="/welcome" className="flex items-center gap-2.5 lg:hidden">
              <Mark size={28} />
              <span className="font-latin text-[0.9375rem] font-extrabold tracking-[0.22em]">ALKEVA</span>
            </Link>
            <LocaleToggle className="border border-border" />
          </div>
          <div className="flex flex-1 items-center justify-center px-4 pb-10 lg:px-8">
            <div className="w-full max-w-[26rem]">{children}</div>
          </div>
        </div>
      </main>
    </PriceProvider>
  );
}

function LivePrices() {
  const tc = useTranslations("common");
  const t = useTranslations("public");
  return (
    <div className="flex max-w-[30rem] flex-col overflow-hidden rounded-[1rem] border border-border bg-card/80">
      <span className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-[0.75rem] font-semibold text-muted-foreground">
        <span aria-hidden="true" className="live-dot size-[7px] rounded-full bg-gain" />
        {t("liveNow")}
      </span>
      {(["XAU", "XPT"] as const).map((a) => (
        <PriceRow key={a} asset={a} label={a === "XAU" ? tc("gold") : tc("platinum")} unit={`${tc("birr")}/${tc("g")}`} />
      ))}
    </div>
  );
}

function PriceRow({ asset, label, unit }: { asset: "XAU" | "XPT"; label: string; unit: string }) {
  const p = useAssetPrice(asset);
  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <Coin metal={asset} />
      <span className="flex-1 text-[0.875rem] font-semibold">{label}</span>
      {p ? (
        <>
          <span className="tnum text-[1.0625rem] font-semibold">
            {money(p.etbCentsPerGram)} <span className="text-[0.6875rem] font-medium text-subtle">{unit}</span>
          </span>
          <DeltaChip pctMilli={p.change24hPctMilli} />
        </>
      ) : (
        <Skeleton className="h-5 w-32" />
      )}
    </div>
  );
}
