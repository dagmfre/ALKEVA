"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import type { AdminKycItem } from "@alkeva/shared";

import { AdminAction, AdminTable, StatusBadge, Td } from "@/components/admin/ui";
import { Segmented } from "@/components/ui/segmented";
import { SystemBanner } from "@/components/system/banner";
import { eatStamp } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

const STATUSES = ["pending", "approved", "rejected"] as const;
type KycStatus = (typeof STATUSES)[number];

/**
 * The KYC queue with a status filter — the API always accepted
 * `?status=pending|approved|rejected`; the UI used to pin `pending`, which
 * made "what did we decide last week?" unanswerable from the console.
 * Approve/reject actions only render on the pending filter.
 */
export function AdminKycScreen() {
  const t = useTranslations("admin");
  const [status, setStatus] = useState<KycStatus>("pending");
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { data, loading } = useResource<{ submissions: AdminKycItem[] }>(
    `/admin/kyc?status=${status}`,
    { revision },
  );
  const rows = data?.submissions ?? [];

  const done = (err: string | null) => {
    setError(err);
    setRevision((n) => n + 1);
  };

  return (
    <div className="flex flex-col gap-3">
      <h1 className="sr-only">{t("nav.kyc")}</h1>
      {error && (
        <SystemBanner tone="critical" className="mb-0">
          {t("actionFailed", { code: error })}
        </SystemBanner>
      )}
      <AdminTable
        title={t("nav.kyc")}
        action={
          <div className="max-w-full overflow-x-auto [scrollbar-width:none]">
            <Segmented
              value={status}
              onValueChange={setStatus}
              aria-label={t("nav.kyc")}
              options={STATUSES.map((s) => ({
                value: s,
                label: t(`kyc.status.${s}` as never),
                count: s === status && !loading ? rows.length : undefined,
              }))}
            />
          </div>
        }
        loading={loading}
        empty={rows.length === 0 ? t("kyc.empty") : null}
        headers={[t("users.email"), t("kyc.docType"), t("kyc.document"), { label: t("orders.when"), end: true }, ""]}
      >
        {rows.map((s) => (
          <tr key={s.id}>
            <Td className="font-medium">{s.userEmail}</Td>
            <Td>{t(`kyc.docTypes.${s.docType}` as never)}</Td>
            <Td>
              {/* The proxy path keeps the auth cookie first-party. */}
              <a
                href={`/api/admin/kyc/${s.id}/file`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-gold-400 hover:text-gold-300"
              >
                {t("kyc.viewDocument")}
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            </Td>
            <Td className="tnum text-end text-[0.75rem] whitespace-nowrap text-subtle">{eatStamp(s.createdAt)}</Td>
            <Td>
              {status === "pending" ? (
                <div className="flex justify-end gap-2">
                  <AdminAction path={`/admin/kyc/${s.id}/approve`} label={t("approve")} onDone={done} />
                  <AdminAction
                    path={`/admin/kyc/${s.id}/reject`}
                    body={{ note: "document_unreadable" }}
                    label={t("reject")}
                    tone="danger"
                    onDone={done}
                  />
                </div>
              ) : (
                <div className="flex justify-end">
                  <StatusBadge status={s.status} label={t(`kyc.status.${s.status}` as never)} />
                </div>
              )}
            </Td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
