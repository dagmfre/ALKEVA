"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { AdminReviewItem } from "@alkeva/shared";

import { AdminAction, AdminTable, Td } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { SystemBanner } from "@/components/system/banner";
import { eatStamp, grams, money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

/**
 * The 500k+ queue (F21). Approving settles at the ORIGINAL quoted price with
 * every money gate re-run server-side — a refusal (e.g. the vault can no
 * longer cover it) surfaces here as the same machine code a live order shows.
 */
export function AdminReviewsScreen() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { data, loading } = useResource<{ reviews: AdminReviewItem[] }>("/admin/reviews", {
    revision,
  });

  const done = (err: string | null) => {
    setError(err);
    setRevision((n) => n + 1);
  };

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">{t("nav.reviews")}</h1>
      <p className="mb-4 max-w-[640px] text-[0.875rem] leading-relaxed text-muted-foreground">
        {t("reviews.explain")}
      </p>
      {error && (
        <SystemBanner tone="critical" className="mb-3">
          {t("actionFailed", { code: error })}
        </SystemBanner>
      )}
      {loading ? (
        <Skeleton className="h-48 rounded-lg" />
      ) : (data?.reviews.length ?? 0) === 0 ? (
        <p className="text-[0.9375rem] text-muted-foreground">{t("reviews.empty")}</p>
      ) : (
        <AdminTable
          headers={[
            t("users.email"),
            t("orders.side"),
            t("orders.amount"),
            t("orders.total"),
            t("orders.when"),
            "",
          ]}
        >
          {(data?.reviews ?? []).map((r) => (
            <tr key={r.orderId}>
              <Td className="font-latin">{r.userEmail}</Td>
              <Td>
                {r.side === "buy" ? t("orders.buy") : t("orders.sell")}{" "}
                {r.asset === "XAU" ? tc("gold") : tc("platinum")}
              </Td>
              <Td className="tnum">
                {grams(r.gramsMg)} {tc("g")}
              </Td>
              <Td className="tnum font-semibold text-gold-400">{money(r.totalCents)}</Td>
              <Td className="font-latin text-[0.8125rem] text-subtle">{eatStamp(r.createdAt)}</Td>
              <Td>
                <div className="flex justify-end gap-2">
                  <AdminAction
                    path={`/admin/orders/${r.orderId}/approve-review`}
                    label={t("approve")}
                    onDone={done}
                  />
                  <AdminAction
                    path={`/admin/orders/${r.orderId}/reject-review`}
                    label={t("reject")}
                    tone="danger"
                    onDone={done}
                  />
                </div>
              </Td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
