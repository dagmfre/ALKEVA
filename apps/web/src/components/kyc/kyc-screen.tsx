"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { KycDocType, KycExtractionDto, KycMeResponse } from "@alkeva/shared";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SystemBanner } from "@/components/system/banner";
import { ApiError } from "@/lib/api";
import { eatStamp } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

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
  // The three fields the user confirms. They start empty and are only ever
  // pre-filled from a reading of their own document — never invented, and
  // always editable, because the person is the one making the claim.
  const [fullName, setFullName] = useState("");
  const [docNumber, setDocNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [reading, setReading] = useState(false);
  const [readFailed, setReadFailed] = useState(false);

  const submission = me.data?.submission ?? null;
  const verified = (me.data?.kycTier ?? 0) >= 1;
  const pending = submission?.status === "pending";

  /**
   * Read the chosen document so the user can correct the fields rather than
   * type them from scratch. Best-effort by design: an unreadable document, an
   * unconfigured key or a rate limit all land on "type it yourself", never on
   * a blocked submission.
   */
  async function readDocument(file: File) {
    if (file.size > MAX_BYTES) return;
    setReading(true);
    setReadFailed(false);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/kyc/extract", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) throw new Error("extract_failed");
      const body = (await res.json()) as { extraction: KycExtractionDto | null };
      if (!body.extraction) {
        setReadFailed(true);
        return;
      }
      // Only fill blanks — never overwrite something the user already typed.
      setFullName((v) => v || (body.extraction?.fullName ?? ""));
      setDocNumber((v) => v || (body.extraction?.docNumber ?? ""));
      setExpiry((v) => v || (body.extraction?.expiry ?? ""));
    } catch {
      setReadFailed(true);
    } finally {
      setReading(false);
    }
  }

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
      if (fullName.trim()) form.set("fullName", fullName.trim());
      if (docNumber.trim()) form.set("docNumber", docNumber.trim());
      if (expiry.trim()) form.set("expiry", expiry.trim());
      const res = await fetch("/api/kyc", { method: "POST", body: form, credentials: "include" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new ApiError(res.status, body?.message ?? `http_${res.status}`, body);
      }
      setFileName(null);
      setFullName("");
      setDocNumber("");
      setExpiry("");
      if (fileRef.current) fileRef.current.value = "";
      me.reload();
    } catch (err) {
      setError(err instanceof ApiError && KNOWN.has(err.code) ? err.code : "generic");
    } finally {
      setBusy(false);
    }
  }

  if (me.loading) return <Skeleton className="mx-auto h-64 max-w-[36rem] rounded-lg" />;

  return (
    <div className="mx-auto flex max-w-[36rem] flex-col gap-3.5">
      {verified ? (
        <Card className="flex flex-col items-center gap-2 p-6 text-center">
          <span className="text-3xl text-gain">✓</span>
          <h1 className="text-xl font-semibold">{t("verifiedTitle")}</h1>
          <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
            {t("verifiedBody")}
          </p>
        </Card>
      ) : pending ? (
        <Card className="flex flex-col items-center gap-2 p-6 text-center">
          <span className="text-3xl text-platinum-400">◑</span>
          <h1 className="text-xl font-semibold">{t("pendingTitle")}</h1>
          <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
            {t("pendingBody")}
          </p>
          {submission && (
            <p className="font-latin text-[0.8125rem] text-subtle">
              {eatStamp(submission.createdAt)}
            </p>
          )}
        </Card>
      ) : (
        <Card className="p-5">
          {submission?.status === "rejected" && (
            <SystemBanner tone="critical" className="mb-4">
              {t("rejectedBanner")}
              {submission.reviewNote ? ` — ${submission.reviewNote}` : ""}
            </SystemBanner>
          )}
          <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[0.9375rem] font-medium">{t("docTypeLabel")}</span>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as KycDocType)}
                className="well min-h-12 rounded-md px-3 text-base outline-none"
                disabled={busy}
              >
                {DOC_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`docTypes.${type}` as never)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[0.9375rem] font-medium">{t("fileLabel")}</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                capture="environment"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFileName(f?.name ?? null);
                  if (f) void readDocument(f);
                }}
                className="well min-h-12 rounded-md px-3.5 py-3 text-[0.9375rem] file:me-3 file:rounded file:border-0 file:bg-popover file:px-3 file:py-1.5 file:text-foreground"
                disabled={busy}
              />
              <span className="text-[0.8125rem] text-subtle">
                {reading ? t("reading") : (fileName ?? t("fileHint"))}
              </span>
            </label>

            {/* Filled from the document when it can be read, typed by hand when
                it cannot. Either way the user is confirming their own details
                before submitting them — the reading is a convenience, not a
                claim, and the reviewer sees both sides. */}
            <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3.5">
              <legend className="px-1.5 text-[0.8125rem] text-muted-foreground">
                {t("detailsLegend")}
              </legend>
              <Field
                label={t("fullNameLabel")}
                value={fullName}
                onChange={setFullName}
                disabled={busy}
              />
              <Field
                label={t("docNumberLabel")}
                value={docNumber}
                onChange={setDocNumber}
                disabled={busy}
              />
              <Field
                label={t("expiryLabel")}
                value={expiry}
                onChange={setExpiry}
                disabled={busy}
              />
              <p className="text-[0.8125rem] leading-relaxed text-subtle">
                {readFailed ? t("readFailed") : t("detailsHint")}
              </p>
            </fieldset>

            {error && (
              <SystemBanner tone="critical">
                {KNOWN.has(error) ? t(`errors.${error}` as never) : t("errors.generic")}
              </SystemBanner>
            )}

            <Button type="submit" size="cta" disabled={busy}>
              {busy ? tc("loading") : t("cta")}
            </Button>
            <p className="text-[0.8125rem] leading-relaxed text-subtle">{t("privacyNote")}</p>
          </form>
        </Card>
      )}
    </div>
  );
}

/** A plain labelled text input in the sunk-field treatment the rest of the
    product uses. Not a shadcn Input: this form already speaks raw controls. */
function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[0.9375rem] font-medium">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="well min-h-12 rounded-md px-3 text-base outline-none"
        disabled={disabled}
      />
    </label>
  );
}
