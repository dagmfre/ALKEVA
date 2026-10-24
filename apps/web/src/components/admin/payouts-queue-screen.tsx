"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { PayoutResponse } from "@alkeva/shared";

import { AdminAction, AdminTable, Td } from "@/components/admin/ui";
import { Segmented } from "@/components/ui/segmented";
import { SystemBanner } from "@/components/system/banner";
import { eatStamp, money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

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
  const rows = data?.payouts ?? [];

  const done = (err: string | null) => {
    setError(err);
    setRevision((n) => n + 1);
  };

  return (
    <div className="flex flex-col gap-3">
      <h1 className="sr-only">{t("nav.payouts")}</h1>
      {error && (
        <SystemBanner tone="critical" className="mb-0">
          {t("actionFailed", { code: error })}
        </SystemBanner>
      )}
      <AdminTable
        title={t("nav.payouts")}
        action={
          <div className="max-w-full overflow-x-auto [scrollbar-width:none]">
            <Segmented
              value={tab}
              onValueChange={setTab}
              aria-label={t("nav.payouts")}
              options={TABS.map((s) => ({
                value: s,
                label: t(`payoutStatus.${s}` as never),
                count: s === tab && !loading ? rows.length : undefined,
              }))}
            />
          </div>
        }
        loading={loading}
        empty={rows.length === 0 ? t("payouts.empty") : null}
        minWidth={760}
        headers={[
          t("users.email"),
          { label: t("payouts.amount"), end: true },
          t("payouts.destination"),
          { label: t("orders.when"), end: true },
          t("payouts.note"),
          "",
        ]}
      >
        {rows.map((p) => (
          <tr key={p.id}>
            <Td className="font-medium">{p.userEmail}</Td>
            <Td className="tnum text-end font-semibold whitespace-nowrap">
              {money(p.amountCents)}
              <span className="ms-1.5 font-sans text-[0.75rem] font-medium text-subtle">{tc("birr")}</span>
            </Td>
            <Td>
              <span className="flex flex-col">
                <span className="tnum text-[0.8125rem]">{p.accountNumber}</span>
                <span className="text-[0.75rem] text-subtle">{p.accountName}</span>
              </span>
            </Td>
            <Td className="tnum text-end text-[0.75rem] whitespace-nowrap text-subtle">{eatStamp(p.createdAt)}</Td>
            <Td className="max-w-[220px] truncate text-[0.78125rem] text-subtle">{p.failureReason ?? "—"}</Td>
            <Td>
              {tab === "requested" && (
                <div className="flex justify-end gap-2">
                  <AdminAction path={`/admin/payouts/${p.id}/approve`} label={t("payouts.approveSend")} onDone={done} />
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
    </div>
  );
}
