"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { MeResponse, TreasuryEntriesResponse } from "@alkeva/shared";

import { fieldCls } from "@/components/money/wallet-ui";
import { SystemBanner } from "@/components/system/banner";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";
import { eatStamp, grams, gramsToMg, money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

/**
 * The only way real inventory and capital enter the books (Phase 10): a vault
 * intake/outtake with the bar serial and assay reference, or a capital
 * movement with the bank/Chapa reference. Administrator-only on the API, every
 * entry audited; the vault record is append-only (a mistake is corrected with
 * an opposite entry, never an edit), and an outtake can never leave less
 * metal than customers are owed.
 */
export function TreasuryEntries({ onChanged }: { onChanged: () => void }) {
  const t = useTranslations("admin.treasury.entries");
  const tc = useTranslations("common");
  const [revision, setRevision] = useState(0);
  const entries = useResource<TreasuryEntriesResponse>("/admin/treasury/entries", { revision });
  const me = useResource<MeResponse>("/auth/me");
  const canWrite = me.data?.role === "administrator";

  const [kind, setKind] = useState<"vault" | "capital">("vault");
  const [asset, setAsset] = useState<"XAU" | "XPT">("XAU");
  const [vaultKind, setVaultKind] = useState<"intake" | "outtake">("intake");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    let body: Record<string, string>;
    if (kind === "vault") {
      const mg = gramsToMg(amount);
      if (mg === null || mg <= 0n) return setError("amount");
      body = { asset, kind: vaultKind, gramsMg: mg.toString(), reference };
    } else {
      const birr = Number.parseFloat(amount.replace(/,/g, ""));
      if (!Number.isFinite(birr) || birr <= 0) return setError("amount");
      body = { direction, amountCents: String(Math.round(birr * 100)), reference };
    }
    setBusy(true);
    try {
      await api(kind === "vault" ? "/admin/treasury/vault" : "/admin/treasury/capital", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setAmount("");
      setReference("");
      setOk(true);
      setRevision((n) => n + 1);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.code : "generic");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel aria-label={t("title")} className="lg:col-span-4">
      <PanelHeader title={t("title")} hint={t("hint")} />
      <div className="grid grid-cols-1 gap-5 border-t border-border p-[1.125rem] xl:grid-cols-[22rem_minmax(0,1fr)]">
        {canWrite ? (
          <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
            <Segmented
              value={kind}
              onValueChange={setKind}
              aria-label={t("title")}
              options={[
                { value: "vault", label: t("vault") },
                { value: "capital", label: t("capital") },
              ]}
            />
            {kind === "vault" ? (
              <div className="grid grid-cols-2 gap-2">
                <Segmented
                  value={asset}
                  onValueChange={setAsset}
                  aria-label={t("asset")}
                  options={[
                    { value: "XAU", label: tc("gold") },
                    { value: "XPT", label: tc("platinum") },
                  ]}
                />
                <Segmented
                  value={vaultKind}
                  onValueChange={setVaultKind}
                  aria-label={t("direction")}
                  options={[
                    { value: "intake", label: t("intake") },
                    { value: "outtake", label: t("outtake") },
                  ]}
                />
              </div>
            ) : (
              <Segmented
                value={direction}
                onValueChange={setDirection}
                aria-label={t("direction")}
                options={[
                  { value: "in", label: t("capitalIn") },
                  { value: "out", label: t("capitalOut") },
                ]}
              />
            )}
            <label className="flex flex-col gap-1.5">
              <span className="data-label">{kind === "vault" ? t("grams") : t("birr")}</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                required
                className={`${fieldCls} tnum`}
                disabled={busy}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="data-label">{kind === "vault" ? t("vaultReference") : t("capitalReference")}</span>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                required
                minLength={3}
                maxLength={300}
                className={fieldCls}
                disabled={busy}
              />
            </label>
            {error && (
              <SystemBanner tone="critical" className="mb-0">
                {t.has(`errors.${error}` as never) ? t(`errors.${error}` as never) : t("errors.generic")}
              </SystemBanner>
            )}
            {ok && <SystemBanner tone="info" className="mb-0">{t("recorded")}</SystemBanner>}
            <Button type="submit" disabled={busy}>
              {busy ? tc("loading") : t("record")}
            </Button>
            <p className="text-[0.75rem] leading-relaxed text-subtle">{t("appendOnly")}</p>
          </form>
        ) : (
          <p className="text-[0.8125rem] text-muted-foreground">{t("adminOnly")}</p>
        )}

        <div className="flex min-w-0 flex-col gap-3">
          {!entries.data ? (
            <Skeleton className="h-40" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[0.8125rem]">
                <thead>
                  <tr className="text-subtle">
                    <th className="py-2 text-start font-medium">{t("when")}</th>
                    <th className="py-2 text-start font-medium">{t("what")}</th>
                    <th className="py-2 text-end font-medium">{t("amount")}</th>
                    <th className="py-2 ps-4 text-start font-medium">{t("reference")}</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ...entries.data.vault.map((v) => ({
                      id: v.id,
                      at: v.createdAt,
                      what: `${v.asset === "XAU" ? tc("gold") : tc("platinum")} · ${v.kind === "intake" ? t("intake") : t("outtake")}`,
                      amount: `${v.kind === "intake" ? "+" : "−"}${grams(v.gramsMg)} g`,
                      ref: v.reference,
                    })),
                    ...entries.data.capital.map((c) => ({
                      id: c.id,
                      at: c.createdAt,
                      what: c.direction === "in" ? t("capitalIn") : t("capitalOut"),
                      amount: `${c.direction === "in" ? "+" : "−"}${money(c.amountCents)} ${tc("birr")}`,
                      ref: c.reference,
                    })),
                  ]
                    .sort((a, b) => b.at.localeCompare(a.at))
                    .slice(0, 40)
                    .map((r) => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="tnum py-2 whitespace-nowrap text-subtle">{eatStamp(r.at)}</td>
                        <td className="py-2">{r.what}</td>
                        <td className="tnum py-2 text-end font-semibold whitespace-nowrap">{r.amount}</td>
                        <td className="max-w-[18rem] truncate py-2 ps-4 text-muted-foreground" title={r.ref}>
                          {r.ref}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
