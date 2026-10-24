"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { AdminDeliveryItem } from "@alkeva/shared";

import { AdminAction, AdminTable, MetalLabel, Td } from "@/components/admin/ui";
import { Segmented } from "@/components/ui/segmented";
import { SystemBanner } from "@/components/system/banner";
import { eatStamp, grams } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

const STATUSES = ["requested", "approved", "scheduled", "rejected"] as const;
type DeliveryTab = (typeof STATUSES)[number];

/**
 * The delivery queue (spec F18). Balance figures beside each row are
 * ADVISORY — a request reserves nothing, so what matters is what the user
 * holds at decision time, and the approve endpoint re-checks it.
 */
export function AdminDeliveryScreen() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [status, setStatus] = useState<DeliveryTab>("requested");
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { data, loading } = useResource<{ requests: AdminDeliveryItem[] }>(
    `/admin/delivery?status=${status}`,
    { revision },
  );
  const rows = data?.requests ?? [];

  const done = (err: string | null) => {
    setError(err);
    setRevision((n) => n + 1);
  };

  return (
    <div className="flex flex-col gap-3">
      <h1 className="sr-only">{t("nav.delivery")}</h1>
      {error && (
        <SystemBanner tone="critical" className="mb-0">
          {t("actionFailed", { code: error })}
        </SystemBanner>
      )}
      <AdminTable
        title={t("nav.delivery")}
        intro={t("delivery.explain")}
        action={
          <div className="max-w-full overflow-x-auto [scrollbar-width:none]">
            <Segmented
              value={status}
              onValueChange={setStatus}
              aria-label={t("nav.delivery")}
              options={STATUSES.map((s) => ({
                value: s,
                label: t(`delivery.status.${s}` as never),
                count: s === status && !loading ? rows.length : undefined,
              }))}
            />
          </div>
        }
        loading={loading}
        empty={rows.length === 0 ? t("delivery.empty") : null}
        minWidth={760}
        headers={[
          t("users.email"),
          { label: t("delivery.amount"), end: true },
          { label: t("delivery.heldNow"), end: true },
          t("delivery.contact"),
          { label: t("orders.when"), end: true },
          "",
        ]}
      >
        {rows.map((r) => (
          <tr key={r.id}>
            <Td className="font-medium">{r.userEmail}</Td>
            <Td className="text-end">
              <span className="inline-flex items-center gap-2">
                <MetalLabel
                  asset={r.asset}
                  label={
                    <span className="tnum font-semibold">
                      {grams(r.gramsMg)} <span className="font-normal text-subtle">{tc("g")}</span>
                    </span>
                  }
                />
              </span>
            </Td>
            <Td className="tnum text-end">
              {grams(r.heldMg)} <span className="text-subtle">{tc("g")}</span>
            </Td>
            <Td>
              <span className="block max-w-[16rem]">
                <span className="tnum block text-[0.8125rem]">{r.contactPhone}</span>
                <span className="block truncate text-[0.75rem] text-subtle">{r.address}</span>
              </span>
            </Td>
            <Td className="tnum text-end text-[0.75rem] whitespace-nowrap text-subtle">{eatStamp(r.createdAt)}</Td>
            <Td>
              <div className="flex justify-end gap-2">
                {status === "requested" && (
                  <>
                    <AdminAction path={`/admin/delivery/${r.id}/approve`} label={t("approve")} onDone={done} />
                    <AdminAction
                      path={`/admin/delivery/${r.id}/reject`}
                      body={{ note: "not_fulfillable" }}
                      label={t("reject")}
                      tone="danger"
                      onDone={done}
                    />
                  </>
                )}
                {status === "approved" && (
                  <AdminAction
                    path={`/admin/delivery/${r.id}/schedule`}
                    body={{
                      scheduledFor: new Date(Date.now() + 7 * 86_400_000).toISOString(),
                    }}
                    label={t("delivery.scheduleWeek")}
                    onDone={done}
                  />
                )}
                {(status === "scheduled" || status === "rejected") && (
                  <span className={r.scheduledFor ? "tnum text-[0.75rem] text-subtle" : "text-[0.78125rem] text-subtle"}>
                    {r.scheduledFor ? eatStamp(r.scheduledFor) : r.reviewNote ?? ""}
                  </span>
                )}
              </div>
            </Td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
