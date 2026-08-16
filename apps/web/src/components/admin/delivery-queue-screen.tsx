"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { AdminDeliveryItem } from "@alkeva/shared";

import { AdminAction, AdminTable, Td } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

  const done = (err: string | null) => {
    setError(err);
    setRevision((n) => n + 1);
  };

  return (
    <div>
      <h1 className="mb-1.5 text-xl font-semibold">{t("nav.delivery")}</h1>
      <p className="mb-4 max-w-[44rem] text-[0.9375rem] leading-relaxed text-muted-foreground">
        {t("delivery.explain")}
      </p>

      <Tabs value={status} onValueChange={(v) => setStatus(v as DeliveryTab)} className="mb-4">
        <TabsList>
          {STATUSES.map((s) => (
            <TabsTrigger key={s} value={s}>
              {t(`delivery.status.${s}` as never)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {error && (
        <SystemBanner tone="critical" className="mb-3">
          {t("actionFailed", { code: error })}
        </SystemBanner>
      )}
      {loading ? (
        <Skeleton className="h-48 rounded-lg" />
      ) : (data?.requests.length ?? 0) === 0 ? (
        <p className="text-[0.9375rem] text-muted-foreground">{t("delivery.empty")}</p>
      ) : (
        <AdminTable
          headers={[
            t("users.email"),
            t("delivery.amount"),
            t("delivery.heldNow"),
            t("delivery.contact"),
            t("orders.when"),
            "",
          ]}
        >
          {(data?.requests ?? []).map((r) => (
            <tr key={r.id}>
              <Td className="font-latin">{r.userEmail}</Td>
              <Td>
                <span className="tnum font-semibold">{grams(r.gramsMg)}</span> {tc("g")}{" "}
                {r.asset === "XAU" ? tc("gold") : tc("platinum")}
              </Td>
              <Td className="tnum">
                {grams(r.heldMg)} {tc("g")}
              </Td>
              <Td>
                <span className="block max-w-[16rem]">
                  <span className="font-latin block text-[0.875rem]">{r.contactPhone}</span>
                  <span className="block truncate text-[0.8125rem] text-subtle">{r.address}</span>
                </span>
              </Td>
              <Td className="font-latin text-[0.8125rem] text-subtle">{eatStamp(r.createdAt)}</Td>
              <Td>
                <div className="flex justify-end gap-2">
                  {status === "requested" && (
                    <>
                      <AdminAction
                        path={`/admin/delivery/${r.id}/approve`}
                        label={t("approve")}
                        onDone={done}
                      />
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
                    <span className="text-[0.8125rem] text-subtle">
                      {r.scheduledFor ? eatStamp(r.scheduledFor) : r.reviewNote ?? ""}
                    </span>
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
