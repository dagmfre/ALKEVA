"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { AdminOrderSearchItem } from "@alkeva/shared";

import { AdminSearch, AdminTable, MetalLabel, StatusBadge, Td } from "@/components/admin/ui";
import { eatStamp, grams, money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

/** Every order on the platform, searchable by email or receipt number. */
export function AdminOrdersScreen() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const { data, loading } = useResource<{ orders: AdminOrderSearchItem[] }>(
    `/admin/orders${applied ? `?q=${encodeURIComponent(applied)}` : ""}`,
  );
  const rows = data?.orders ?? [];

  return (
    <div className="flex flex-col gap-3">
      <h1 className="sr-only">{t("nav.orders")}</h1>
      <AdminTable
        title={t("nav.orders")}
        hint={loading ? undefined : <span className="tnum">{rows.length}</span>}
        action={
          <AdminSearch
            value={query}
            onChange={setQuery}
            onSubmit={() => setApplied(query.trim())}
            placeholder={t("orders.searchPlaceholder")}
          />
        }
        loading={loading}
        minWidth={820}
        headers={[
          t("users.email"),
          t("orders.side"),
          { label: t("orders.amount"), end: true },
          { label: t("orders.total"), end: true },
          t("orders.status"),
          t("orders.serial"),
          { label: t("orders.when"), end: true },
        ]}
      >
        {rows.map((o) => (
          <tr key={o.id}>
            <Td className="font-medium">{o.userEmail}</Td>
            <Td>
              <MetalLabel
                asset={o.asset}
                label={`${o.side === "buy" ? t("orders.buy") : t("orders.sell")} ${o.asset === "XAU" ? tc("gold") : tc("platinum")}`}
              />
            </Td>
            <Td className="tnum text-end whitespace-nowrap">
              {grams(o.gramsMg)} <span className="text-subtle">{tc("g")}</span>
            </Td>
            <Td className="tnum text-end font-semibold whitespace-nowrap">{money(o.totalCents)}</Td>
            <Td>
              <span className="flex flex-wrap items-center gap-2">
                <StatusBadge status={o.status} label={t(`orderStatus.${o.status}` as never)} />
                {o.failureReason && <span className="tnum text-[0.75rem] text-subtle">{o.failureReason}</span>}
              </span>
            </Td>
            <Td className="tnum text-[0.8125rem] whitespace-nowrap">{o.receiptSerial ?? "—"}</Td>
            <Td className="tnum text-end text-[0.75rem] whitespace-nowrap text-subtle">{eatStamp(o.createdAt)}</Td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
