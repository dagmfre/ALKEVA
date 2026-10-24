"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import type { AdminUserDetailResponse, MeResponse } from "@alkeva/shared";

import { AdminAction, AdminTable, MetalLabel, StatusBadge, Td } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelHeader, Stat, StatStrip } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { SystemBanner } from "@/components/system/banner";
import { eatStamp, grams, money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

/**
 * One account: identity and balances in a single panel (balances as a strip,
 * the freeze control as its foot), then recent orders and compliance events.
 */
export function AdminUserDetailScreen({ userId }: { userId: string }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const th = useTranslations("history");
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

  if (!data) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }
  // Administrator is the superuser — freeze/unfreeze included.
  const isCompliance = me.data?.role === "compliance" || me.data?.role === "administrator";
  const frozen = data.status === "frozen";

  return (
    <div className="flex flex-col gap-3">
      <h1 className="sr-only">{data.email}</h1>

      {error && (
        <SystemBanner tone="critical" className="mb-0">
          {t("actionFailed", { code: error })}
        </SystemBanner>
      )}

      <Panel aria-label={data.email}>
        <PanelHeader
          title={data.email}
          hint={data.fullName}
          action={
            <span className="flex flex-wrap items-center gap-2">
              <Badge variant="platinum">{t(`roles.${data.role}` as never)}</Badge>
              <StatusBadge
                status={frozen ? "frozen" : "active"}
                label={frozen ? t("users.frozen") : t("users.active")}
              />
              <Button variant="ghost" size="sm" asChild>
                <Link href="/admin/users">
                  <ArrowLeft />
                  {t("nav.users")}
                </Link>
              </Button>
            </span>
          }
        />
        <StatStrip className="min-h-[5.25rem] border-t border-border lg:[&>*]:flex-auto">
          <Stat surface="strip" size="lg" label={tc("birr")} value={money(data.balances.etbCents)} unit={tc("birr")} />
          <Stat
            surface="strip"
            size="lg"
            label={tc("gold")}
            value={grams(data.balances.xauMg)}
            unit={tc("g")}
            tone="gold"
          />
          <Stat
            surface="strip"
            size="lg"
            label={tc("platinum")}
            value={grams(data.balances.xptMg)}
            unit={tc("g")}
            tone="platinum"
          />
          <Stat surface="strip" size="lg" label={t("users.kycTier")} value={String(data.kycTier)} />
          <Stat surface="strip" size="lg" label={t("users.joined")} value={eatStamp(data.createdAt)} />
        </StatStrip>

        {/* Freeze control — compliance only; the reason is mandatory because the
            AI (and the user) will read it back verbatim. */}
        {isCompliance && (
          <div className="border-t border-border px-[1.125rem] py-4">
            {data.activeFreeze ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SystemBanner tone="critical" className="mb-0 flex-1">
                  {t("users.frozenSince", {
                    reason: data.activeFreeze.reason,
                    at: eatStamp(data.activeFreeze.createdAt),
                  })}
                </SystemBanner>
                <AdminAction path={`/admin/users/${userId}/unfreeze`} label={t("users.unfreeze")} onDone={done} />
              </div>
            ) : data.role === "user" ? (
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex min-w-[min(100%,260px)] flex-1 flex-col gap-1.5">
                  <span className="data-label">{t("users.freezeReason")}</span>
                  <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="h-10"
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
              <p className="text-[0.84375rem] text-subtle">{t("users.staffNoFreeze")}</p>
            )}
          </div>
        )}
      </Panel>

      <AdminTable
        title={t("users.recentOrders")}
        hint={<span className="tnum">{data.recentOrders.length}</span>}
        empty={data.recentOrders.length === 0 ? th("emptyTitle") : null}
        headers={[
          t("orders.side"),
          { label: t("orders.amount"), end: true },
          { label: t("orders.total"), end: true },
          t("orders.status"),
          { label: t("orders.when"), end: true },
        ]}
      >
        {data.recentOrders.map((o) => (
          <tr key={o.id}>
            <Td>
              <MetalLabel
                asset={o.asset}
                label={`${o.side === "buy" ? t("orders.buy") : t("orders.sell")} ${o.asset === "XAU" ? tc("gold") : tc("platinum")}`}
              />
            </Td>
            <Td className="tnum text-end">
              {grams(o.gramsMg)} <span className="text-subtle">{tc("g")}</span>
            </Td>
            <Td className="tnum text-end font-semibold">{money(o.totalCents)}</Td>
            <Td>
              <span className="flex flex-wrap items-center gap-2">
                <StatusBadge status={o.status} label={t(`orderStatus.${o.status}` as never)} />
                {o.failureReason && <span className="tnum text-[0.75rem] text-subtle">{o.failureReason}</span>}
              </span>
            </Td>
            <Td className="tnum text-end text-[0.75rem] whitespace-nowrap text-subtle">{eatStamp(o.createdAt)}</Td>
          </tr>
        ))}
      </AdminTable>

      {data.complianceEvents.length > 0 && (
        <AdminTable
          title={t("users.complianceEvents")}
          headers={[t("users.rule"), t("users.action"), { label: t("orders.when"), end: true }, t("users.resolved")]}
        >
          {data.complianceEvents.map((e) => (
            <tr key={e.id}>
              <Td className="tnum text-[0.8125rem]">{e.ruleKey}</Td>
              <Td>{e.action}</Td>
              <Td className="tnum text-end text-[0.75rem] whitespace-nowrap text-subtle">{eatStamp(e.createdAt)}</Td>
              <Td>
                {e.resolvedAt ? (
                  <StatusBadge status="settled" label={<span className="tnum">{eatStamp(e.resolvedAt)}</span>} />
                ) : (
                  <span className="text-subtle">—</span>
                )}
              </Td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
