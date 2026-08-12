"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { PayoutResponse } from "@alkeva/shared";

import { AdminAction, AdminTable, Td } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { SystemBanner } from "@/components/system/banner";
import { eatStamp, money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

type Row = PayoutResponse & { userEmail: string };

const TABS = ["requested", "processing", "settled", "rejected"] as const;

/** Finance's queue. Approve sends the held cents through Chapa; reject returns them. */
export function AdminPayoutsScreen() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [tab, setTab] = useState<(typeof TABS)[number]>("requested");
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { data, loading } = useResource<{ payouts: Row[] }>(`/admin/payouts?status=${tab}`, {
    revision,
  });

  const done = (err: string | null) => {
    setError(err);
    setRevision((n) => n + 1);
  };

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">{t("nav.payouts")}</h1>
      <div className="mb-4 flex gap-1.5">
        {TABS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setTab(s)}
            className={cn(
              "rounded-md px-3 py-1.5 text-[0.875rem]",
              tab === s ? "pill-active" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`payoutStatus.${s}` as never)}
          </button>
        ))}
      </div>
      {error && (
        <SystemBanner tone="critical" className="mb-3">
          {t("actionFailed", { code: error })}
        </SystemBanner>
      )}
      {loading ? (
        <Skeleton className="h-48 rounded-lg" />
      ) : (data?.payouts.length ?? 0) === 0 ? (
        <p className="text-[0.9375rem] text-muted-foreground">{t("payouts.empty")}</p>
      ) : (
        <AdminTable
          headers={[
            t("users.email"),
            t("payouts.amount"),
            t("payouts.destination"),
            t("orders.when"),
            t("payouts.note"),
            "",
          ]}
        >
          {(data?.payouts ?? []).map((p) => (
            <tr key={p.id}>
              <Td className="font-latin">{p.userEmail}</Td>
              <Td className="tnum font-semibold">
                {money(p.amountCents)} {tc("birr")}
              </Td>
              <Td className="tnum">
                {p.accountNumber}
                <span className="ms-2 text-[0.8125rem] text-subtle">{p.accountName}</span>
              </Td>
              <Td className="font-latin text-[0.8125rem] text-subtle">{eatStamp(p.createdAt)}</Td>
              <Td className="max-w-[220px] truncate text-[0.8125rem] text-subtle">
                {p.failureReason ?? "—"}
              </Td>
              <Td>
                {tab === "requested" && (
                  <div className="flex justify-end gap-2">
                    <AdminAction
                      path={`/admin/payouts/${p.id}/approve`}
                      label={t("payouts.approveSend")}
                      onDone={done}
                    />
                    <AdminAction
                      path={`/admin/payouts/${p.id}/reject`}
                      body={{ note: "rejected_by_finance" }}
                      label={t("reject")}
                      tone="danger"
                      onDone={done}
                    />
                  </div>
                )}
              </Td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
