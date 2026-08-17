"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { AdminKycItem } from "@alkeva/shared";

import { AdminAction, AdminTable, Td } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SystemBanner } from "@/components/system/banner";
import { eatStamp } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

const STATUSES = ["pending", "approved", "rejected"] as const;
type KycStatus = (typeof STATUSES)[number];

/**
 * The KYC queue with a status filter — the API always accepted
 * `?status=pending|approved|rejected`; the UI used to pin `pending`, which
 * made "what did we decide last week?" unanswerable from the console.
 * Approve/reject actions only render on the pending tab.
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

  const done = (err: string | null) => {
    setError(err);
    setRevision((n) => n + 1);
  };

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">{t("nav.kyc")}</h1>

      <Tabs value={status} onValueChange={(v) => setStatus(v as KycStatus)} className="mb-4">
        <TabsList>
          {STATUSES.map((s) => (
            <TabsTrigger key={s} value={s}>
              {t(`kyc.status.${s}` as never)}
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
      ) : (data?.submissions.length ?? 0) === 0 ? (
        <p className="text-[0.9375rem] text-muted-foreground">{t("kyc.empty")}</p>
      ) : (
        <AdminTable
          headers={[
            t("users.email"),
            t("kyc.docType"),
            t("kyc.declaredVsRead"),
            t("kyc.document"),
            t("orders.when"),
            "",
          ]}
        >
          {(data?.submissions ?? []).map((s) => (
            <tr key={s.id}>
              <Td className="font-latin">{s.userEmail}</Td>
              <Td>{t(`kyc.docTypes.${s.docType}` as never)}</Td>
              <Td className="max-w-[22rem]">
                <IdentityCompare item={s} />
              </Td>
              <Td>
                {/* The proxy path keeps the auth cookie first-party. */}
                <a
                  href={`/api/admin/kyc/${s.id}/file`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-gold-400 hover:text-gold-300"
                >
                  {t("kyc.viewDocument")} ↗
                </a>
              </Td>
              <Td className="font-latin text-[0.8125rem] text-subtle">{eatStamp(s.createdAt)}</Td>
              <Td>
                {status === "pending" ? (
                  <div className="flex justify-end gap-2">
                    <AdminAction
                      path={`/admin/kyc/${s.id}/approve`}
                      label={t("approve")}
                      onDone={done}
                    />
                    <AdminAction
                      path={`/admin/kyc/${s.id}/reject`}
                      body={{ note: "document_unreadable" }}
                      label={t("reject")}
                      tone="danger"
                      onDone={done}
                    />
                  </div>
                ) : (
                  <span className="block text-end text-[0.8125rem] text-subtle">
                    {t(`kyc.status.${s.status}` as never)}
                  </span>
                )}
              </Td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}

/**
 * What the user declared, beside what was read off the image.
 *
 * The reading is a transcription — it verifies nothing, and a disagreement is
 * not evidence of fraud. It is a reason to look at the document, which is the
 * one thing this column is for. Both values are always shown; the extraction
 * never replaces or corrects the user's own claim.
 */
function IdentityCompare({ item }: { item: AdminKycItem }) {
  const t = useTranslations("admin");
  const rows: { label: string; declared: string | null; read: string | null }[] = [
    { label: t("kyc.fullName"), declared: item.declaredFullName, read: item.extractedFullName },
    { label: t("kyc.docNumber"), declared: item.declaredDocNumber, read: item.extractedDocNumber },
    { label: t("kyc.expiry"), declared: item.declaredExpiry, read: item.extractedExpiry },
  ];
  const any = rows.some((r) => r.declared || r.read);
  if (!any) {
    return <span className="text-[0.8125rem] text-subtle">{t("kyc.noDetails")}</span>;
  }

  const norm = (v: string | null) => (v ?? "").replace(/\s+/g, " ").trim().toLowerCase();

  return (
    <span className="flex flex-col gap-1">
      {rows.map((r) => {
        // Only a disagreement between two present values is worth marking.
        // A blank on either side means "not read", which is not a mismatch.
        const mismatch = Boolean(r.declared && r.read && norm(r.declared) !== norm(r.read));
        return (
          <span key={r.label} className="text-[0.8125rem] leading-snug">
            <span className="text-subtle">{r.label}: </span>
            <span className={mismatch ? "text-loss" : "text-foreground"}>
              {r.declared ?? "—"}
            </span>
            {r.read && r.read !== r.declared && (
              <span className={mismatch ? "text-loss" : "text-muted-foreground"}>
                {" "}
                / {t("kyc.readAs")} {r.read}
              </span>
            )}
            {mismatch && <span className="ms-1 text-loss">⚠</span>}
          </span>
        );
      })}
      {item.extractedConfidence && (
        <span className="text-[0.75rem] text-subtle">
          {t(`kyc.confidence.${item.extractedConfidence}` as never)}
        </span>
      )}
    </span>
  );
}
