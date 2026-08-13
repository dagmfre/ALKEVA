"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { AdminUserDetailResponse, MeResponse } from "@alkeva/shared";

import { AdminAction, AdminTable, Td } from "@/components/admin/ui";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SystemBanner } from "@/components/system/banner";
import { eatStamp, grams, money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

export function AdminUserDetailScreen({ userId }: { userId: string }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const me = useResource<MeResponse>("/auth/me");
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const { data } = useResource<AdminUserDetailResponse>(`/admin/users/${userId}`, { revision });

  const done = (err: string | null) => {
    setError(err);
    if (!err) setReason("");
    setRevision((n) => n + 1);
  };

  if (!data) return <Skeleton className="h-64 rounded-lg" />;
  // Administrator is the superuser — freeze/unfreeze included.
  const isCompliance = me.data?.role === "compliance" || me.data?.role === "administrator";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-latin text-xl font-semibold">{data.email}</h1>
        <p className="text-[0.9375rem] text-muted-foreground">
          {data.fullName} · {t(`roles.${data.role}` as never)} · KYC {data.kycTier}
        </p>
      </div>

      {error && <SystemBanner tone="critical">{t("actionFailed", { code: error })}</SystemBanner>}

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
        <Card className="p-4">
          <span className="text-[0.875rem] text-muted-foreground">{tc("birr")}</span>
          <p className="tnum mt-1 text-xl font-semibold">{money(data.balances.etbCents)}</p>
        </Card>
        <Card className="p-4">
          <span className="text-[0.875rem] text-muted-foreground">{tc("gold")}</span>
          <p className="tnum mt-1 text-xl font-semibold">
            {grams(data.balances.xauMg)} {tc("g")}
          </p>
        </Card>
        <Card className="p-4">
          <span className="text-[0.875rem] text-muted-foreground">{tc("platinum")}</span>
          <p className="tnum mt-1 text-xl font-semibold">
            {grams(data.balances.xptMg)} {tc("g")}
          </p>
        </Card>
      </div>

      {/* Freeze control — compliance only; the reason is mandatory because the
          AI (and the user) will read it back verbatim. */}
      {isCompliance && (
        <Card className="flex flex-col gap-3 p-4">
          {data.activeFreeze ? (
            <>
              <SystemBanner tone="critical" className="mb-0">
                {t("users.frozenSince", {
                  reason: data.activeFreeze.reason,
                  at: eatStamp(data.activeFreeze.createdAt),
                })}
              </SystemBanner>
              <div>
                <AdminAction
                  path={`/admin/users/${userId}/unfreeze`}
                  label={t("users.unfreeze")}
                  onDone={done}
                />
              </div>
            </>
          ) : data.role === "user" ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-[260px] flex-1 flex-col gap-1.5">
                <span className="text-[0.875rem] font-medium">{t("users.freezeReason")}</span>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="well min-h-11 rounded-md px-3 text-[0.9375rem] outline-none"
                  placeholder={t("users.freezeReasonPlaceholder")}
                />
              </label>
              {reason.trim().length >= 3 && (
                <AdminAction
                  path={`/admin/users/${userId}/freeze`}
                  body={{ reason: reason.trim() }}
                  label={t("users.freeze")}
                  tone="danger"
                  onDone={done}
                />
              )}
            </div>
          ) : (
            <p className="text-[0.875rem] text-subtle">{t("users.staffNoFreeze")}</p>
          )}
        </Card>
      )}

      <section>
        <h2 className="mb-2 text-base font-semibold">{t("users.recentOrders")}</h2>
        <AdminTable
          headers={[t("orders.side"), t("orders.amount"), t("orders.total"), t("orders.status"), t("orders.when")]}
        >
          {data.recentOrders.map((o) => (
            <tr key={o.id}>
              <Td>{o.side === "buy" ? t("orders.buy") : t("orders.sell")} {o.asset}</Td>
              <Td className="tnum">{grams(o.gramsMg)} {tc("g")}</Td>
              <Td className="tnum">{money(o.totalCents)}</Td>
              <Td className="text-muted-foreground">
                {t(`orderStatus.${o.status}` as never)}
                {o.failureReason ? ` · ${o.failureReason}` : ""}
              </Td>
              <Td className="font-latin text-[0.8125rem] text-subtle">{eatStamp(o.createdAt)}</Td>
            </tr>
          ))}
        </AdminTable>
      </section>

      {data.complianceEvents.length > 0 && (
        <section>
          <h2 className="mb-2 text-base font-semibold">{t("users.complianceEvents")}</h2>
          <AdminTable headers={[t("users.rule"), t("users.action"), t("orders.when"), t("users.resolved")]}>
            {data.complianceEvents.map((e) => (
              <tr key={e.id}>
                <Td className="font-latin">{e.ruleKey}</Td>
                <Td>{e.action}</Td>
                <Td className="font-latin text-[0.8125rem] text-subtle">{eatStamp(e.createdAt)}</Td>
                <Td>{e.resolvedAt ? `✓ ${eatStamp(e.resolvedAt)}` : "—"}</Td>
              </tr>
            ))}
          </AdminTable>
        </section>
      )}
    </div>
  );
}
