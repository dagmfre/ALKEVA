"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { AdminAuditItem, MeResponse } from "@alkeva/shared";

import { AdminTable, Td } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { eatStamp } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

interface Page {
  entries: AdminAuditItem[];
  nextCursor: string | null;
}

/** The append-only trail, newest first. Every staff decision lands here. */
export function AdminAuditScreen() {
  const t = useTranslations("admin");
  const me = useResource<MeResponse>("/auth/me");
  const first = useResource<Page>("/admin/audit");
  const [extra, setExtra] = useState<AdminAuditItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const entries = [...(first.data?.entries ?? []), ...extra];
  const nextCursor = cursor ?? first.data?.nextCursor ?? null;

  async function loadMore() {
    if (!nextCursor) return;
    setBusy(true);
    try {
      const page = await api<Page>(`/admin/audit?before=${encodeURIComponent(nextCursor)}`);
      setExtra((prev) => [...prev, ...page.entries]);
      setCursor(page.nextCursor);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t("nav.audit")}</h1>
        {(me.data?.role === "compliance" || me.data?.role === "administrator") && (
          <a
            href="/api/admin/compliance/export.csv"
            className="text-[0.9375rem] text-gold-400 hover:text-gold-300"
          >
            {t("audit.exportCsv")} ↓
          </a>
        )}
      </div>
      {first.loading ? (
        <Skeleton className="h-48 rounded-lg" />
      ) : (
        <>
          <AdminTable
            headers={[t("audit.actor"), t("audit.action"), t("audit.target"), t("orders.when")]}
          >
            {entries.map((e) => (
              <tr key={e.id}>
                <Td className="font-latin text-[0.875rem]">{e.actorLabel}</Td>
                <Td className="font-latin">{e.action}</Td>
                <Td className="font-latin text-[0.8125rem] text-subtle">
                  {e.targetType ? `${e.targetType} ${e.targetId ?? ""}` : "—"}
                </Td>
                <Td className="font-latin text-[0.8125rem] text-subtle">{eatStamp(e.createdAt)}</Td>
              </tr>
            ))}
          </AdminTable>
          {nextCursor && (
            <div className="mt-3">
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void loadMore()}>
                {t("audit.loadMore")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
