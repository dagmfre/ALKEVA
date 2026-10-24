"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import type { MeResponse, PortfolioResponse } from "@alkeva/shared";

import { AlertsList } from "@/components/account/alerts-list";
import { PasskeysCard } from "@/components/account/passkeys-card";
import { useTierName } from "@/components/portfolio/tier-gauge";
import { isStaffRole } from "@/components/shell/header-actions";
import { LocaleToggle } from "@/components/shell/locale-toggle";
import { TierMark } from "@/components/shell/nav-items";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader, Stat, StatStrip } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

/**
 * Quiet by design: nothing to explore, everything easy to find.
 *
 *   profile (who you are · tier · identity · session)
 *   preferences      │ passkeys        │ price alerts
 */
export function AccountScreen() {
  const t = useTranslations("account");
  const tn = useTranslations("nav");
  const router = useRouter();
  const tierName = useTierName();
  const me = useResource<MeResponse>("/auth/me");
  const portfolio = useResource<PortfolioResponse>("/portfolio");

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  const staff = isStaffRole(me.data?.role);
  const initials =
    me.data?.fullName
      ?.trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0))
      .join("")
      .toUpperCase() || "·";

  return (
    <div className="flex flex-col gap-3">
      <section data-panel="" aria-label={tn("account")} className="flex flex-col overflow-hidden rounded-lg border border-border bg-card lg:flex-row lg:items-stretch">
        <div className="flex flex-none items-center gap-4 px-[1.125rem] py-4 lg:pe-8">
          <span className="grid size-14 flex-none place-items-center rounded-full bg-raised font-latin text-[1.125rem] font-bold text-gold-300">
            {initials}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            {me.data ? (
              <>
                <span className="truncate text-[1.125rem] font-bold">{me.data.fullName}</span>
                <span className="tnum truncate text-[0.8125rem] text-muted-foreground">{me.data.email}</span>
              </>
            ) : (
              <>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-52" />
              </>
            )}
          </span>
        </div>
        <StatStrip className="border-t border-border lg:flex-1 lg:border-t-0 lg:border-s">
          <Stat
            surface="strip"
            label={t("tierLabel")}
            value={
              portfolio.data ? (
                <span className="flex items-center gap-2 font-sans">
                  <TierMark size={16} />
                  {tierName(portfolio.data.tier.name) ?? "—"}
                </span>
              ) : null
            }
          />
          <Stat
            surface="strip"
            label={t("kyc")}
            value={
              me.data ? (
                me.data.kycTier > 0 ? (
                  <span className="font-sans text-gain">✓ {t("verified")}</span>
                ) : (
                  <Link href="/kyc" className="font-sans text-gold-400 hover:text-gold-300">
                    {t("kycStart")} →
                  </Link>
                )
              ) : null
            }
          />
          {staff && me.data && (
            <Stat
              surface="strip"
              label={t("roleLabel")}
              value={
                <Badge variant="gold" dot>
                  {t(`roles.${me.data.role}` as never)}
                </Badge>
              }
            />
          )}
        </StatStrip>
        <div className="flex flex-none flex-wrap items-center gap-2 border-t border-border px-[1.125rem] py-3 lg:border-t-0 lg:border-s lg:px-5">
          {staff && (
            <Button variant="gold" size="sm" asChild>
              <Link href="/admin">
                <ShieldCheck />
                {tn("adminConsole")}
              </Link>
            </Button>
          )}
          <Button variant="destructive" size="sm" onClick={() => void logout()}>
            <LogOut />
            {t("logout")}
          </Button>
        </div>
      </section>

      <div className="grid flex-1 grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel aria-label={t("preferencesTitle")}>
          <PanelHeader title={t("preferencesTitle")} />
          <div className="flex flex-1 flex-col border-t border-border">
            <Line label={t("language")} hint={t("languageHint")}>
              <LocaleToggle className="border border-border" />
            </Line>
            <Line label={t("passwordLabel")} hint={t("passwordHint")}>
              <Button variant="outline" size="sm" asChild>
                <Link href="/forgot-password">
                  <KeyRound />
                  {t("passwordAction")}
                </Link>
              </Button>
            </Line>
            <Line label={t("moneyTitle")} hint={t("moneyHint")}>
              <span className="flex gap-1.5">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/deposit">{tn("deposit")}</Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/withdraw">{tn("withdraw")}</Link>
                </Button>
              </span>
            </Line>
          </div>
        </Panel>
        <PasskeysCard />
        <AlertsList />
      </div>
    </div>
  );
}

function Line({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-[1.125rem] py-3.5 last:border-b-0">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[0.875rem] font-semibold">{label}</span>
        {hint && <span className="text-[0.75rem] text-subtle">{hint}</span>}
      </span>
      {children}
    </div>
  );
}
