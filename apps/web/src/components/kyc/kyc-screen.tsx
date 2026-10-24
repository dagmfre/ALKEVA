"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, FileUp, IdCard } from "lucide-react";
import type { KycDocType, KycMeResponse } from "@alkeva/shared";

import { KycTimeline } from "@/components/kyc/kyc-timeline";
import { WalletNav } from "@/components/money/wallet-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { SystemBanner } from "@/components/system/banner";
import { ApiError } from "@/lib/api";
import { eatStamp } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

const KNOWN = new Set([
  "unsupported_file_type",
  "file_too_large",
  "kyc_pending_exists",
  "file_required",
]);

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * The document types, in display order. Declared here rather than imported from
 * `@alkeva/shared`: a *value* import pulls the package barrel — and with it the
 * Node-only env module — into the browser bundle, which fails the build. Type
 * imports are erased; values are not. Keyed by the shared union, so adding or
 * renaming a doc type upstream breaks this file instead of silently dropping an
 * option from the form.
 */
const DOC_TYPE_ORDER = {
  fayda: 0,
  passport: 1,
  driving_licence: 2,
  kebele_id: 3,
} satisfies Record<KycDocType, number>;

const DOC_TYPES = Object.keys(DOC_TYPE_ORDER) as KycDocType[];

/**
 * Identity verification. One document, reviewed by a compliance officer;
 * approval unlocks deposits, withdrawals, and trading. The file input carries
 * `capture` so a phone offers the camera directly.
 *
 *   wallet nav
 *   status / document form            │ where you are + what it unlocks
 */
export function KycScreen() {
  const t = useTranslations("kyc");
  const tc = useTranslations("common");
  const me = useResource<KycMeResponse>("/kyc/me");
  const [docType, setDocType] = useState<KycDocType>("fayda");
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const submission = me.data?.submission ?? null;
  const verified = (me.data?.kycTier ?? 0) >= 1;
  const pending = submission?.status === "pending";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("file_required");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("file_too_large");
      return;
    }
    setBusy(true);
    try {
      // Multipart: the one endpoint that is NOT JSON — the api() helper would
      // stamp a JSON content-type, so this posts directly (with credentials).
      const form = new FormData();
      form.set("file", file);
      form.set("docType", docType);
      const res = await fetch("/api/kyc", { method: "POST", body: form, credentials: "include" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new ApiError(res.status, body?.message ?? `http_${res.status}`, body);
      }
      setFileName(null);
      if (fileRef.current) fileRef.current.value = "";
      me.reload();
    } catch (err) {
      setError(err instanceof ApiError && KNOWN.has(err.code) ? err.code : "generic");
    } finally {
      setBusy(false);
    }
  }

  const stage = verified ? "verified" : pending ? "review" : "submit";

  return (
    <div className="flex flex-col gap-3">
      <WalletNav />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_25.25rem]">
        {me.loading ? (
          <Skeleton className="h-80 rounded-lg" />
        ) : verified || pending ? (
          <Panel className="items-center justify-center gap-3 p-8 text-center">
            <span
              className={cn(
                "grid size-14 place-items-center rounded-full",
                verified ? "bg-gain/12 text-gain" : "bg-platinum-400/12 text-platinum-400",
              )}
            >
              {verified ? <Check className="size-6" /> : <IdCard className="size-6" />}
            </span>
            <h1 className="text-[1.25rem] font-bold">{verified ? t("verifiedTitle") : t("pendingTitle")}</h1>
            <p className="max-w-md text-[0.875rem] leading-relaxed text-muted-foreground">
              {verified ? t("verifiedBody") : t("pendingBody")}
            </p>
            {pending && submission && (
              <p className="tnum text-[0.75rem] text-subtle">{eatStamp(submission.createdAt)}</p>
            )}
          </Panel>
        ) : (
          <Panel aria-label={t("formTitle")}>
            <PanelHeader title={t("formTitle")} hint={t("oneDocument")} />
            <form onSubmit={(e) => void submit(e)} className="flex flex-1 flex-col gap-5 px-[1.125rem] pb-[1.125rem]">
              {submission?.status === "rejected" && (
                <SystemBanner tone="critical" className="mb-0">
                  {t("rejectedBanner")}
                  {submission.reviewNote ? ` — ${submission.reviewNote}` : ""}
                </SystemBanner>
              )}

              <fieldset className="flex flex-col gap-2">
                <legend className="data-label mb-2">{t("docTypeLabel")}</legend>
                <div role="radiogroup" className="grid grid-cols-2 gap-2 xl:grid-cols-4">
                  {DOC_TYPES.map((type) => {
                    const on = docType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        disabled={busy}
                        onClick={() => setDocType(type)}
                        className={cn(
                          "flex min-h-[4.5rem] flex-col items-start justify-between gap-2 rounded-[0.75rem] border p-3 text-start text-[0.8125rem] font-semibold transition-colors",
                          on
                            ? "border-gold-400/50 bg-gold-400/8 text-gold-300"
                            : "border-border bg-panel-2 text-foreground hover:border-input",
                        )}
                      >
                        <IdCard className={cn("size-4", on ? "text-gold-400" : "text-subtle")} />
                        {t(`docTypes.${type}` as never)}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <label className="flex flex-col gap-2">
                <span className="data-label">{t("fileLabel")}</span>
                <span className="relative flex min-h-[8.5rem] flex-col items-center justify-center gap-2 rounded-[0.75rem] border border-dashed border-input bg-panel-2/60 px-4 text-center transition-colors focus-within:border-gold-500 hover:border-gold-400/50">
                  <FileUp className="size-6 text-gold-400" aria-hidden="true" />
                  <span className="text-[0.875rem] font-semibold">{fileName ?? t("dropTitle")}</span>
                  <span className="text-[0.75rem] text-subtle">{t("fileHint")}</span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    capture="environment"
                    onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    disabled={busy}
                  />
                </span>
              </label>

              {error && (
                <SystemBanner tone="critical" className="mb-0">
                  {KNOWN.has(error) ? t(`errors.${error}` as never) : t("errors.generic")}
                </SystemBanner>
              )}

              <div className="mt-auto flex flex-col gap-2">
                <Button type="submit" size="cta" disabled={busy}>
                  {busy ? tc("loading") : t("cta")}
                </Button>
                <p className="text-[0.75rem] leading-relaxed text-subtle">{t("privacyNote")}</p>
              </div>
            </form>
          </Panel>
        )}

        <Panel aria-label={t("statusTitle")}>
          <PanelHeader
            title={t("statusTitle")}
            action={
              <Badge dot variant={verified ? "gain" : pending ? "platinum" : "muted"}>
                {verified ? t("stateVerified") : pending ? t("stateReview") : t("stateNone")}
              </Badge>
            }
          />
          <div className="flex flex-1 flex-col gap-5 px-[1.125rem] pb-[1.125rem]">
            <KycTimeline stage={stage} />
            <div className="flex flex-col gap-2 border-t border-border pt-3.5">
              <span className="text-[0.8125rem] font-bold">{t("unlocksTitle")}</span>
              {(["unlockDeposit", "unlockTrade", "unlockWithdraw"] as const).map((k) => (
                <div key={k} className="flex items-center gap-2.5 text-[0.8125rem]">
                  <span
                    className={cn(
                      "grid size-4 place-items-center rounded-full",
                      verified ? "bg-gain/15 text-gain" : "bg-raised text-subtle",
                    )}
                  >
                    <Check className="size-2.5" strokeWidth={3} />
                  </span>
                  <span className={verified ? "text-foreground" : "text-muted-foreground"}>{t(k)}</span>
                </div>
              ))}
            </div>
            <p className="mt-auto text-[0.75rem] leading-relaxed text-subtle">{t("reviewNote")}</p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
