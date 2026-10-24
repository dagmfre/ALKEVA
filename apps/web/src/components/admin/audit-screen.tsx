"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import type { AdminAuditItem, MeResponse } from "@alkeva/shared";

import { AdminTable, Td } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
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
    <div className="flex flex-col gap-3">
      <h1 className="sr-only">{t("nav.audit")}</h1>
      <AdminTable
        title={t("nav.audit")}
        hint={first.loading ? undefined : <span className="tnum">{entries.length}</span>}
        action={
          (me.data?.role === "compliance" || me.data?.role === "administrator") && (
            <Button variant="gold" size="sm" asChild>
              <a href="/api/admin/compliance/export.csv">
                <Download />
                {t("audit.exportCsv")}
              </a>
            </Button>
          )
        }
        loading={first.loading}
        minWidth={760}
        headers={[t("audit.actor"), t("audit.action"), t("audit.target"), { label: t("orders.when"), end: true }]}
        footer={
          nextCursor && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void loadMore()}>
              {t("audit.loadMore")}
            </Button>
          )
        }
      >
        {entries.map((e) => (
          <tr key={e.id}>
            <Td className="tnum text-[0.8125rem]">{e.actorLabel}</Td>
            <Td>
              <span className="tnum inline-block rounded-[0.375rem] bg-panel-2 px-1.5 py-0.5 text-[0.75rem] leading-tight">{e.action}</span>
            </Td>
            <Td className="tnum text-[0.75rem] text-subtle">
              {e.targetType ? `${e.targetType} ${e.targetId ?? ""}` : "—"}
            </Td>
            <Td className="tnum text-end text-[0.75rem] whitespace-nowrap text-subtle">{eatStamp(e.createdAt)}</Td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
