"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { AdminReviewItem } from "@alkeva/shared";

import { AdminAction, AdminTable, MetalLabel, Td } from "@/components/admin/ui";
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
  const rows = data?.reviews ?? [];

  const done = (err: string | null) => {
    setError(err);
    setRevision((n) => n + 1);
  };

  return (
    <div className="flex flex-col gap-3">
      <h1 className="sr-only">{t("nav.reviews")}</h1>
      {error && (
        <SystemBanner tone="critical" className="mb-0">
          {t("actionFailed", { code: error })}
        </SystemBanner>
      )}
      <AdminTable
        title={t("nav.reviews")}
        hint={loading ? undefined : <span className="tnum">{rows.length}</span>}
        intro={t("reviews.explain")}
        loading={loading}
        empty={rows.length === 0 ? t("reviews.empty") : null}
        headers={[
          t("users.email"),
          t("orders.side"),
          { label: t("orders.amount"), end: true },
          { label: t("orders.total"), end: true },
          { label: t("orders.when"), end: true },
          "",
        ]}
      >
        {rows.map((r) => (
          <tr key={r.orderId}>
            <Td className="font-medium">{r.userEmail}</Td>
            <Td>
              <MetalLabel
                asset={r.asset}
                label={`${r.side === "buy" ? t("orders.buy") : t("orders.sell")} ${r.asset === "XAU" ? tc("gold") : tc("platinum")}`}
              />
            </Td>
            <Td className="tnum text-end">
              {grams(r.gramsMg)} <span className="text-subtle">{tc("g")}</span>
            </Td>
            <Td className="tnum text-end font-semibold whitespace-nowrap text-gold-300">{money(r.totalCents)}</Td>
            <Td className="tnum text-end text-[0.75rem] whitespace-nowrap text-subtle">{eatStamp(r.createdAt)}</Td>
            <Td>
              <div className="flex justify-end gap-2">
                <AdminAction path={`/admin/orders/${r.orderId}/approve-review`} label={t("approve")} onDone={done} />
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
    </div>
  );
}
