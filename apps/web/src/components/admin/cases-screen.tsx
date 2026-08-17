"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { AdminRiskCaseItem, AdminRiskCasesResponse, AdminRiskScanResponse } from "@alkeva/shared";

import { AdminAction, AdminTable, Td } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SystemBanner } from "@/components/system/banner";
import { ApiError, api } from "@/lib/api";
import { eatStamp, money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

const STATUSES = ["open", "resolved"] as const;
type CaseTab = (typeof STATUSES)[number];

/** Evidence keys whose values are ETB cents and should read as money. */
const CENTS_KEYS = new Set([
  "combinedCents",
  "smallestCents",
  "volumeCents",
  "depositedCents",
  "withdrawnCents",
  "reviewThresholdCents",
  "nearThresholdFloorCents",
  "totalCents",
]);

/** Row ids in evidence are for tracing, not reading — a full UUID per line
    turns the cell into a wall. Show enough to match against a query. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function evidenceValue(key: string, value: string): string {
  if (CENTS_KEYS.has(key)) return money(value);
  if (UUID.test(value)) return `${value.slice(0, 8)}…`;
  return value;
}

/**
 * Gold is reserved for "asset / action" across the product, so a severity
 * badge never borrows it — caution uses the cool platinum family, exactly as
 * the palette decision requires. The word is always present too; severity is
 * never carried by colour alone.
 */
function severityTone(severity: string | null): "loss" | "platinum" | "muted" {
  if (severity === "high") return "loss";
  if (severity === "medium") return "platinum";
  return "muted";
}

/**
 * The AML case queue (spec F20/F22).
 *
 * The engine that opens these cases is deterministic and shared with the
 * worker; nothing here decides anything. The officer reads the evidence,
 * optionally asks the assistant to put it in their language, and resolves.
 * There is no freeze button on this screen on purpose — freezing lives on the
 * user record, where it is a person's deliberate act with its own audit row.
 */
export function AdminCasesScreen() {
  const t = useTranslations("admin");
  const [status, setStatus] = useState<CaseTab>("open");
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<AdminRiskScanResponse | null>(null);
  const [narrating, setNarrating] = useState<string | null>(null);
  const [narratives, setNarratives] = useState<Record<string, string>>({});

  const { data, loading } = useResource<AdminRiskCasesResponse>(
    `/admin/compliance/cases?status=${status}`,
    { revision },
  );

  const done = (err: string | null) => {
    setError(err);
    setRevision((n) => n + 1);
  };

  async function runScan() {
    setScanning(true);
    setError(null);
    try {
      const res = await api<AdminRiskScanResponse>("/admin/compliance/scan", { method: "POST" });
      setScanResult(res);
      setRevision((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.code : "generic");
    } finally {
      setScanning(false);
    }
  }

  async function explain(id: string) {
    setNarrating(id);
    setError(null);
    try {
      const res = await api<{ narrative: string }>(`/admin/compliance/cases/${id}/narrative`, {
        method: "POST",
      });
      setNarratives((prev) => ({ ...prev, [id]: res.narrative }));
    } catch (err) {
      setError(err instanceof ApiError ? err.code : "generic");
    } finally {
      setNarrating(null);
    }
  }

  const cases = data?.cases ?? [];

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t("nav.cases")}</h1>
        <Button variant="outline" onClick={() => void runScan()} disabled={scanning}>
          {scanning ? t("cases.scanning") : t("cases.runScan")}
        </Button>
      </div>
      <p className="mb-4 max-w-[46rem] text-[0.9375rem] leading-relaxed text-muted-foreground">
        {t("cases.explain")}
      </p>

      {scanResult && (
        <SystemBanner tone="info" className="mb-3">
          {t("cases.scanResult", {
            found: scanResult.found,
            opened: scanResult.opened,
          })}
        </SystemBanner>
      )}
      {error && (
        <SystemBanner tone="critical" className="mb-3">
          {t("actionFailed", { code: error })}
        </SystemBanner>
      )}

      <Tabs value={status} onValueChange={(v) => setStatus(v as CaseTab)} className="mb-4">
        <TabsList>
          {STATUSES.map((s) => (
            <TabsTrigger key={s} value={s}>
              {t(`cases.tab.${s}` as never)}
              {s === "open" && data ? ` (${data.openCount})` : ""}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loading && !data ? (
        <Skeleton className="h-48 rounded-lg" />
      ) : cases.length === 0 ? (
        <p className="text-[0.9375rem] text-muted-foreground">{t("cases.empty")}</p>
      ) : (
        <AdminTable
          headers={[
            t("cases.col.rule"),
            t("cases.col.account"),
            t("cases.col.evidence"),
            t("cases.col.opened"),
            "",
          ]}
        >
          {cases.map((c) => (
            <CaseRow
              key={c.id}
              item={c}
              narrative={narratives[c.id] ?? c.narrative}
              narrating={narrating === c.id}
              onExplain={() => void explain(c.id)}
              onDone={done}
            />
          ))}
        </AdminTable>
      )}
    </div>
  );
}

function CaseRow({
  item,
  narrative,
  narrating,
  onExplain,
  onDone,
}: {
  item: AdminRiskCaseItem;
  narrative: string | null;
  narrating: boolean;
  onExplain: () => void;
  onDone: (err: string | null) => void;
}) {
  const t = useTranslations("admin");

  // Rule keys the engine writes are translated; the pre-existing inline rule
  // (txn_over_500k) and anything added later fall back to the raw key rather
  // than rendering an empty cell.
  const ruleLabel = t.has(`cases.rule.${item.ruleKey}`)
    ? t(`cases.rule.${item.ruleKey}` as never)
    : item.ruleKey;

  return (
    <tr>
      <Td>
        <span className="flex flex-col gap-1">
          <span className="font-medium">{ruleLabel}</span>
          <span className="flex items-center gap-1.5">
            {item.severity && (
              <Badge variant={severityTone(item.severity)}>
                {t(`cases.severity.${item.severity}` as never)}
              </Badge>
            )}
            {item.score !== null && (
              <span className="tnum text-[0.8125rem] text-muted-foreground">{item.score}/100</span>
            )}
          </span>
        </span>
      </Td>
      <Td>
        <span className="flex flex-col">
          <span>{item.userEmail ?? "—"}</span>
          {item.userStatus === "frozen" && (
            <span className="text-[0.8125rem] text-loss">{t("cases.frozen")}</span>
          )}
        </span>
      </Td>
      <Td className="max-w-[26rem]">
        <span className="flex flex-col gap-1">
          {item.evidence &&
            Object.entries(item.evidence).map(([k, v]) => (
              <span key={k} className="text-[0.8125rem] text-muted-foreground">
                {t.has(`cases.evidence.${k}`) ? t(`cases.evidence.${k}` as never) : k}:{" "}
                <span className="tnum text-foreground">{evidenceValue(k, v)}</span>
              </span>
            ))}
          {narrative && (
            <span className="mt-1 border-s-2 border-gold-500 ps-2.5 text-[0.8125rem] leading-relaxed">
              {narrative}
            </span>
          )}
        </span>
      </Td>
      <Td className="whitespace-nowrap text-muted-foreground">{eatStamp(item.createdAt)}</Td>
      <Td>
        <span className="flex flex-col items-end gap-1.5">
          {!narrative && (
            <Button variant="ghost" size="sm" onClick={onExplain} disabled={narrating}>
              {narrating ? t("cases.explaining") : t("cases.explainAction")}
            </Button>
          )}
          {item.resolvedAt ? (
            <span className="flex flex-col items-end text-[0.8125rem] text-muted-foreground">
              <span>{t("cases.resolvedBy", { email: item.resolvedByEmail ?? "—" })}</span>
              {item.resolutionNote && <span className="max-w-[14rem]">{item.resolutionNote}</span>}
            </span>
          ) : (
            <AdminAction
              path={`/admin/compliance/cases/${item.id}/resolve`}
              label={t("cases.resolve")}
              onDone={onDone}
            />
          )}
        </span>
      </Td>
    </tr>
  );
}
