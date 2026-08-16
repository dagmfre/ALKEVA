"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { MeResponse, PortfolioResponse } from "@alkeva/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertsList } from "@/components/account/alerts-list";
import { PasskeysCard } from "@/components/account/passkeys-card";
import { LocaleToggle } from "@/components/shell/locale-toggle";
import { TierMark } from "@/components/shell/nav-items";
import { api } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

/**
 * Quiet by design: nothing to explore, everything easy to find.
 *
 * On a wide screen it is two columns — identity and money on the left, the
 * things you configure on the right — rather than a phone column stranded in
 * the middle of a 1440px desk.
 */
export function AccountScreen() {
  const t = useTranslations("account");
  const tt = useTranslations("tier");
  const tn = useTranslations("nav");
  const router = useRouter();
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

  const tierName = portfolio.data?.tier.name ?? null;
  const localizedTier =
    tierName && tt.has(`names.${tierName}` as never) ? tt(`names.${tierName}` as never) : tierName;
  const isStaff =
    me.data?.role === "administrator" ||
    me.data?.role === "compliance" ||
    me.data?.role === "finance";

  return (
    <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-12 lg:gap-5">
      {/* ── Who you are ──────────────────────────────────────────── */}
      <Panel className="lg:col-span-7">
        <PanelBody className="flex flex-wrap items-center gap-4 pt-4">
          <span className="grid size-14 flex-none place-items-center rounded-full border border-input bg-popover text-[1.375rem] font-semibold">
            {me.data?.fullName?.trim().charAt(0) ?? "·"}
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            {me.data ? (
              <>
                <span className="truncate text-[1.125rem] font-semibold">{me.data.fullName}</span>
                <span className="font-latin truncate text-[0.9375rem] text-muted-foreground">
                  {me.data.email}
                </span>
              </>
            ) : (
              <>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-52" />
              </>
            )}
          </span>
          <span className="ms-auto flex flex-wrap items-center gap-2">
            {localizedTier && (
              <Badge variant="platinum">
                <TierMark size={14} />
                {localizedTier}
              </Badge>
            )}
            {me.data &&
              (me.data.kycTier > 0 ? (
                <Badge variant="gain">✓ {t("verified")}</Badge>
              ) : (
                <Badge variant="muted">{t("kycPending")}</Badge>
              ))}
            {isStaff && me.data && (
              <Badge variant="gold">{t(`roles.${me.data.role}` as never)}</Badge>
            )}
          </span>
        </PanelBody>

        <div className="border-t border-border">
          <Line label={t("kyc")}>
            {me.data ? (
              me.data.kycTier > 0 ? (
                <span className="text-[0.9375rem] text-gain">✓ {t("verified")}</span>
              ) : (
                <Link href="/kyc" className="text-[0.9375rem] text-gold-400 hover:text-gold-300">
                  {t("kycStart")} →
                </Link>
              )
            ) : (
              <Skeleton className="h-5 w-20" />
            )}
          </Line>
          <Line label={t("tierLabel")} last>
            {localizedTier ? (
              <span className="flex items-center gap-2 text-[0.9375rem] text-muted-foreground">
                <TierMark size={16} />
                {localizedTier}
              </span>
            ) : (
              <Skeleton className="h-5 w-20" />
            )}
          </Line>
        </div>
      </Panel>

      {/* ── What you can change ──────────────────────────────────── */}
      <Panel className="lg:col-span-5">
        <PanelHeader title={t("preferencesTitle")} />
        <div className="border-t border-border">
          <Line label={t("language")}>
            <LocaleToggle />
          </Line>
          <Line label={t("passwordLabel")} last>
            <Link
              href="/forgot-password"
              className="text-[0.9375rem] text-gold-400 hover:text-gold-300"
            >
              {t("passwordAction")} →
            </Link>
          </Line>
        </div>
      </Panel>

      {/* ── Money doors ──────────────────────────────────────────── */}
      <Panel className="lg:col-span-7">
        <PanelHeader title={t("moneyTitle")} />
        <PanelBody className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <Button variant="flat" size="cta" asChild>
            <Link href="/deposit">{t("depositLink")}</Link>
          </Button>
          <Button variant="outline" size="cta" asChild>
            <Link href="/withdraw">{t("withdrawLink")}</Link>
          </Button>
        </PanelBody>
      </Panel>

      <PasskeysCard className="lg:col-span-5" />

      <AlertsList className="lg:col-span-5" />

      <div className="flex flex-col gap-2.5 lg:col-span-5">
        {/* Staff reach the console from here on a phone — the header user menu
            that carries this link is desktop-only. RolesGuard stays the boundary. */}
        {isStaff && (
          <Button variant="outline" size="cta" asChild>
            <Link href="/admin">{tn("adminConsole")} →</Link>
          </Button>
        )}
        <Button variant="outline" size="cta" className="text-loss" onClick={() => void logout()}>
          {t("logout")}
        </Button>
      </div>
    </div>
  );
}

function Line({
  label,
  children,
  last,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={`flex min-h-14 items-center justify-between gap-3 px-4 py-2.5 lg:px-5 ${
        last ? "" : "border-b border-border"
      }`}
    >
      <span className="text-[0.9375rem] font-medium">{label}</span>
      {children}
    </div>
  );
}
