"use client";

import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { BadgeCheck, Check, FileUp, IdCard, ShieldCheck } from "lucide-react";
import type { KycDocType, KycMeResponse } from "@alkeva/shared";

import { KycTimeline } from "@/components/kyc/kyc-timeline";
import { WalletNav } from "@/components/money/wallet-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { SystemBanner } from "@/components/system/banner";
import { api, ApiError } from "@/lib/api";
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
 * Document types for the (optional) manual upload, in display order. Declared
 * here rather than imported: a VALUE import from `@alkeva/shared` drags the
 * Node-only env module into the browser bundle. Keyed by the shared union so a
 * rename upstream breaks this file instead of silently dropping an option.
 */
const DOC_TYPE_ORDER = {
  fayda: 0,
  passport: 1,
  driving_licence: 2,
  kebele_id: 3,
} satisfies Record<KycDocType, number>;

const DOC_TYPES = Object.keys(DOC_TYPE_ORDER) as KycDocType[];

/**
 * Identity verification. Since Phase 10 the check is Fayda — Ethiopia's
 * national ID: the user signs in on Fayda's own pages, Fayda vouches for their
 * legal name and date of birth, and the account is verified on the spot.
 * The manual document upload (reviewed by compliance) appears only when the
 * deployment enables it (KYC_METHODS=fayda,document).
 *
 *   wallet nav
 *   verify with Fayda / document form │ where you are + what it unlocks
 */
export function KycScreen() {
  const t = useTranslations("kyc");
  const params = useSearchParams();
  const me = useResource<KycMeResponse>("/kyc/me");

  const submission = me.data?.submission ?? null;
  const identity = me.data?.identity ?? null;
  const methods = me.data?.methods ?? { fayda: false, document: false };
  const verified = (me.data?.kycTier ?? 0) >= 1;
  const pending = submission?.status === "pending";
  const stage = verified ? "verified" : pending ? "review" : "submit";
  const justVerified = params.get("verified") === "1";

  return (
    <div className="flex flex-col gap-3">
      <WalletNav />
      {justVerified && verified && <SystemBanner tone="info">{t("faydaJustVerified")}</SystemBanner>}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_25.25rem]">
        {me.loading ? (
          <Skeleton className="h-80 rounded-lg" />
        ) : me.error && !me.data ? (
          <Panel className="items-center justify-center gap-3 p-8 text-center">
            <p className="text-[0.875rem] text-muted-foreground">{t("errors.generic")}</p>
            <Button variant="outline" onClick={me.reload}>
              {t("retry")}
            </Button>
          </Panel>
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
            {verified && identity ? (
              <div className="flex flex-col items-center gap-1">
                <span className="flex items-center gap-1.5 text-[0.8125rem] text-gain">
                  <BadgeCheck className="size-4" aria-hidden="true" />
                  {t("faydaVerifiedAs")}
                </span>
                <span className="text-[1.0625rem] font-bold">{identity.legalName}</span>
                <span className="tnum text-[0.75rem] text-subtle">{eatStamp(identity.verifiedAt)}</span>
              </div>
            ) : (
              <p className="max-w-md text-[0.875rem] leading-relaxed text-muted-foreground">
                {verified ? t("verifiedBody") : t("pendingBody")}
              </p>
            )}
            {pending && submission && (
              <p className="tnum text-[0.75rem] text-subtle">{eatStamp(submission.createdAt)}</p>
            )}
          </Panel>
        ) : (
          <div className="flex flex-col gap-3">
            {methods.fayda && <FaydaPanel />}
            {methods.document && (
              <DocumentForm
                onDone={me.reload}
                rejectedNote={submission?.status === "rejected" ? (submission.reviewNote ?? "") : null}
                secondary={methods.fayda}
              />
            )}
            {!methods.fayda && !methods.document && (
              <SystemBanner tone="caution">{t("noMethods")}</SystemBanner>
            )}
          </div>
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
            <p className="mt-auto text-[0.75rem] leading-relaxed text-subtle">
              {methods.fayda ? t("faydaNote") : t("reviewNote")}
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

/** The national-ID check: one button, Fayda's own pages, back here verified. */
function FaydaPanel() {
  const t = useTranslations("kyc");
  const tc = useTranslations("common");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    setBusy(true);
    try {
      const { url } = await api<{ url: string }>("/auth/fayda/link", { method: "POST" });
      window.location.href = url;
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      setError(code === "fayda_already_verified" ? t("faydaAlready") : t("faydaUnavailable"));
      setBusy(false);
    }
  }

  return (
    <Panel aria-label={t("faydaTitle")}>
      <PanelHeader title={t("faydaTitle")} hint={t("faydaHint")} />
      <div className="flex flex-1 flex-col gap-4 px-[1.125rem] pb-[1.125rem]">
        <ol className="flex flex-col gap-3">
          {(["faydaStep1", "faydaStep2", "faydaStep3"] as const).map((k, i) => (
            <li key={k} className="flex items-start gap-3 text-[0.875rem]">
              <span className="tnum grid size-6 flex-none place-items-center rounded-full bg-gold-400/12 text-[0.75rem] font-bold text-gold-400">
                {i + 1}
              </span>
              <span className="leading-relaxed text-muted-foreground">{t(k)}</span>
            </li>
          ))}
        </ol>
        {error && (
          <SystemBanner tone="critical" className="mb-0">
            {error}
          </SystemBanner>
        )}
        <Button size="cta" onClick={start} disabled={busy} className="mt-auto">
          <ShieldCheck className="size-5" aria-hidden="true" />
          {busy ? tc("loading") : t("faydaCta")}
        </Button>
        <p className="text-[0.75rem] leading-relaxed text-subtle">{t("faydaPrivacy")}</p>
      </div>
    </Panel>
  );
}

function DocumentForm({
  onDone,
  rejectedNote,
  secondary,
}: {
  onDone: () => void;
  rejectedNote: string | null;
  secondary: boolean;
}) {
  const t = useTranslations("kyc");
  const tc = useTranslations("common");
  const [docType, setDocType] = useState<KycDocType>(secondary ? "passport" : "fayda");
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
      // Multipart: the one endpoint that is NOT JSON, so it posts directly.
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
      onDone();
    } catch (err) {
      setError(err instanceof ApiError && KNOWN.has(err.code) ? err.code : "generic");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel aria-label={t("formTitle")}>
      <PanelHeader title={secondary ? t("documentAlternative") : t("formTitle")} hint={t("oneDocument")} />
      <form onSubmit={(e) => void submit(e)} className="flex flex-1 flex-col gap-5 px-[1.125rem] pb-[1.125rem]">
        {rejectedNote !== null && (
          <SystemBanner tone="critical" className="mb-0">
            {t("rejectedBanner")}
            {rejectedNote ? ` — ${rejectedNote}` : ""}
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
          <Button type="submit" size="cta" variant={secondary ? "outline" : "default"} disabled={busy}>
            {busy ? tc("loading") : t("cta")}
          </Button>
          <p className="text-[0.75rem] leading-relaxed text-subtle">{t("privacyNote")}</p>
        </div>
      </form>
    </Panel>
  );
}
