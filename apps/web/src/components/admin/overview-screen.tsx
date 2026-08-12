"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { AdminOverviewResponse, MeResponse } from "@alkeva/shared";

import { Skeleton } from "@/components/ui/skeleton";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

/** Four numbers that answer "is anything waiting on a human?" */
export function AdminOverviewScreen() {
  const t = useTranslations("admin");
  const me = useResource<MeResponse>("/auth/me");
  const { data } = useResource<AdminOverviewResponse>("/admin/overview", {
    intervalMs: 30_000,
  });
  const role = me.data?.role;

  const cards: { key: keyof AdminOverviewResponse; href: string; visible: boolean }[] = [
    { key: "pendingKyc", href: "/admin/kyc", visible: role === "compliance" },
    { key: "pendingPayouts", href: "/admin/payouts", visible: role === "finance" },
    { key: "openReviews", href: "/admin/reviews", visible: role === "compliance" },
    { key: "frozenUsers", href: "/admin/users", visible: role !== "finance" },
  ];

  return (
    <div>
      <h1 className="mb-5 text-xl font-semibold">{t("nav.overview")}</h1>
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {cards.map((card) => {
          const value = data ? data[card.key] : null;
          const body = (
            <div
              className={cn(
                "flex flex-col gap-1 rounded-lg border border-border bg-card p-4",
                card.visible && "hover:border-input",
              )}
            >
              <span className="text-[0.875rem] text-muted-foreground">
                {t(`overview.${card.key}` as never)}
              </span>
              {value === null ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <span
                  className={cn(
                    "tnum text-[1.75rem] font-semibold",
                    value > 0 ? "text-gold-400" : "text-foreground",
                  )}
                >
                  {value}
                </span>
              )}
            </div>
          );
          return card.visible ? (
            <Link key={card.key} href={card.href}>
              {body}
            </Link>
          ) : (
            <div key={card.key}>{body}</div>
          );
        })}
      </div>
      <p className="mt-6 max-w-[640px] text-[0.875rem] leading-relaxed text-subtle">
        {t("overview.note")}
      </p>
    </div>
  );
}
