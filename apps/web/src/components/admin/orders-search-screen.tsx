"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { AdminOrderSearchItem } from "@alkeva/shared";

import { AdminTable, Td } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { eatStamp, grams, money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

export function AdminOrdersScreen() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const { data, loading } = useResource<{ orders: AdminOrderSearchItem[] }>(
    `/admin/orders${applied ? `?q=${encodeURIComponent(applied)}` : ""}`,
  );

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">{t("nav.orders")}</h1>
      <form
        className="mb-4 flex max-w-[420px] gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(query.trim());
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("orders.searchPlaceholder")}
          className="well min-h-11 w-full rounded-md px-3 text-[0.9375rem] outline-none"
        />
      </form>
      {loading ? (
        <Skeleton className="h-48 rounded-lg" />
      ) : (
        <AdminTable
          headers={[
            t("users.email"),
            t("orders.side"),
            t("orders.amount"),
            t("orders.total"),
            t("orders.status"),
            t("orders.serial"),
            t("orders.when"),
          ]}
        >
          {(data?.orders ?? []).map((o) => (
            <tr key={o.id}>
              <Td className="font-latin">{o.userEmail}</Td>
              <Td>
                {o.side === "buy" ? t("orders.buy") : t("orders.sell")}{" "}
                {o.asset === "XAU" ? tc("gold") : tc("platinum")}
              </Td>
              <Td className="tnum">
                {grams(o.gramsMg)} {tc("g")}
              </Td>
              <Td className="tnum">{money(o.totalCents)}</Td>
              <Td className="text-muted-foreground">
                {t(`orderStatus.${o.status}` as never)}
                {o.failureReason ? ` · ${o.failureReason}` : ""}
              </Td>
              <Td className="tnum">{o.receiptSerial ?? "—"}</Td>
              <Td className="font-latin text-[0.8125rem] text-subtle">{eatStamp(o.createdAt)}</Td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
