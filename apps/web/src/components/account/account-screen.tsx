"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { MeResponse, PortfolioResponse } from "@alkeva/shared";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LocaleToggle } from "@/components/shell/locale-toggle";
import { api } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

/** Quiet by design: nothing to explore, everything easy to find. */
export function AccountScreen() {
  const t = useTranslations("account");
  const tt = useTranslations("tier");
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

  return (
    <div className="mx-auto max-w-[36rem]">
      <Card className="mb-3.5 overflow-hidden">
        <Line label={t("language")}>
          <LocaleToggle />
        </Line>

        <Line label={t("tierLabel")}>
          {localizedTier ? (
            <span className="flex items-center gap-2 text-[0.9375rem] text-muted-foreground">
              <svg width="16" height="16" viewBox="0 0 34 34" fill="none" aria-hidden="true">
                <path
                  d="M17 3 L28 12 L23.5 27 H10.5 L6 12 Z"
                  stroke="var(--platinum-400)"
                  strokeWidth="2.4"
                  strokeLinejoin="round"
                />
              </svg>
              {localizedTier}
            </span>
          ) : (
            <Skeleton className="h-5 w-20" />
          )}
        </Line>

        <Line label={t("kyc")}>
          {me.data ? (
            <span
              className={
                me.data.kycTier > 0
                  ? "text-[0.9375rem] text-gain"
                  : "text-[0.9375rem] text-muted-foreground"
              }
            >
              {me.data.kycTier > 0 ? `✓ ${t("verified")}` : t("kycPending")}
            </span>
          ) : (
            <Skeleton className="h-5 w-20" />
          )}
        </Line>

        <Line label={t("email")} last>
          {me.data ? (
            <span className="font-latin text-sm text-muted-foreground">{me.data.email}</span>
          ) : (
            <Skeleton className="h-5 w-36" />
          )}
        </Line>
      </Card>

      <Button variant="outline" size="cta" className="text-loss" onClick={() => void logout()}>
        {t("logout")}
      </Button>
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
      className={`flex min-h-14 items-center justify-between gap-3 px-4 py-2.5 ${
        last ? "" : "border-b border-border"
      }`}
    >
      <span className="text-base font-medium">{label}</span>
      {children}
    </div>
  );
}
