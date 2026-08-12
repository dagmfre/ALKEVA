"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { AdminKycItem } from "@alkeva/shared";

import { AdminAction, AdminTable, Td } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { SystemBanner } from "@/components/system/banner";
import { eatStamp } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

export function AdminKycScreen() {
  const t = useTranslations("admin");
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { data, loading } = useResource<{ submissions: AdminKycItem[] }>(
    "/admin/kyc?status=pending",
    { revision },
  );

  const done = (err: string | null) => {
    setError(err);
    setRevision((n) => n + 1);
  };

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">{t("nav.kyc")}</h1>
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
          headers={[t("users.email"), t("kyc.docType"), t("kyc.document"), t("orders.when"), ""]}
        >
          {(data?.submissions ?? []).map((s) => (
            <tr key={s.id}>
              <Td className="font-latin">{s.userEmail}</Td>
              <Td>{t(`kyc.docTypes.${s.docType}` as never)}</Td>
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
              </Td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
