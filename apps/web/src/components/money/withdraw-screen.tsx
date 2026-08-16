"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type {
  BalancesResponse,
  BankDto,
  KycMeResponse,
  PayoutResponse,
} from "@alkeva/shared";

import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SystemBanner } from "@/components/system/banner";
import { api, ApiError } from "@/lib/api";
import { eatStamp, money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

const KNOWN = new Set([
  "kyc_required",
  "amount_too_small",
  "insufficient_balance",
  "account_frozen",
  "payments_unconfigured",
]);

/**
 * Money out. A request moves the cents into the payout-hold account
 * immediately — the balance genuinely drops — and a finance approver either
 * sends it through Chapa or returns it. The status list below the form is the
 * user's window into that queue.
 */
export function WithdrawScreen() {
  const t = useTranslations("withdraw");
  const tc = useTranslations("common");
  const kyc = useResource<KycMeResponse>("/kyc/me");
  const balances = useResource<BalancesResponse>("/ledger/balances");
  const banks = useResource<BankDto[]>("/payouts/banks");
  const [revision, setRevision] = useState(0);
  const list = useResource<{ payouts: PayoutResponse[] }>("/payouts", { revision });

  const [amount, setAmount] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One idempotency key per form session, replaced after success — a
  // double-click maps to one hold (the same contract as the trade ticket).
  const [idemKey, setIdemKey] = useState(() => crypto.randomUUID());

  const needsKyc = kyc.data !== null && kyc.data.kycTier < 1;

  const sortedBanks = useMemo(
    () =>
      (banks.data ?? [])
        .slice()
        .sort((a, b) => Number(b.isMobileMoney) - Number(a.isMobileMoney) || a.name.localeCompare(b.name)),
    [banks.data],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = Number.parseFloat(amount.replace(/,/g, ""));
    if (!Number.isFinite(parsed) || parsed <= 0 || !bankCode) {
      setError("amount_too_small");
      return;
    }
    setBusy(true);
    try {
      await api<PayoutResponse>("/payouts", {
        method: "POST",
        body: JSON.stringify({
          amountCents: String(Math.round(parsed * 100)),
          bankCode: Number(bankCode),
          accountNumber: accountNumber.trim(),
          accountName: accountName.trim(),
          idempotencyKey: idemKey,
        }),
      });
      setAmount("");
      setIdemKey(crypto.randomUUID());
      setRevision((n) => n + 1);
      balances.reload();
    } catch (err) {
      setError(err instanceof ApiError && KNOWN.has(err.code) ? err.code : "generic");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-[64rem] grid-cols-1 items-start gap-3.5 lg:mx-0 lg:max-w-none lg:grid-cols-12 lg:gap-5">
      {needsKyc ? (
        <Panel className="flex flex-col gap-3 p-5 lg:col-span-7">
          <h2 className="text-lg font-semibold">{t("kycGateTitle")}</h2>
          <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
            {t("kycGateBody")}
          </p>
          <Button size="cta" asChild>
            <Link href="/kyc">{t("kycGateCta")}</Link>
          </Button>
        </Panel>
      ) : (
        <Panel className="p-5 lg:col-span-7">
          <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
            <div className="well flex items-center justify-between rounded-md px-3.5 py-2.5">
              <span className="text-[0.9375rem] text-muted-foreground">{t("available")}</span>
              {balances.data ? (
                <span className="tnum text-[0.9375rem] font-semibold">
                  {money(balances.data.etbCents)} {tc("birr")}
                </span>
              ) : (
                <Skeleton className="h-5 w-24" />
              )}
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-[0.9375rem] font-medium">{t("amountLabel")}</span>
              <div className="well flex items-center rounded-md">
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="tnum min-h-12 w-full bg-transparent px-3.5 text-lg outline-none"
                  disabled={busy}
                />
                <span className="pe-3.5 text-[0.9375rem] text-muted-foreground">{tc("birr")}</span>
              </div>
            </label>

            <div className="flex flex-col gap-1.5">
              <span className="text-[0.9375rem] font-medium">{t("bankLabel")}</span>
              <Select
                value={bankCode}
                onValueChange={setBankCode}
                disabled={busy || banks.data === null}
              >
                {/* Matches the sunk `.well` fields around it — one form-control
                    vocabulary per surface. */}
                <SelectTrigger
                  className="min-h-12 w-full border-border bg-well! shadow-[var(--sunk)]"
                  aria-label={t("bankLabel")}
                >
                  <SelectValue
                    placeholder={banks.data === null ? tc("loading") : t("bankPlaceholder")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {sortedBanks.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {banks.error && (
                <span className="text-[0.8125rem] text-loss">{t("errors.banks_unavailable")}</span>
              )}
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-[0.9375rem] font-medium">{t("accountNumberLabel")}</span>
              <input
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                required
                minLength={4}
                maxLength={34}
                inputMode="numeric"
                className="well tnum min-h-12 rounded-md px-3.5 text-base outline-none"
                disabled={busy}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[0.9375rem] font-medium">{t("accountNameLabel")}</span>
              <input
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                required
                minLength={2}
                maxLength={120}
                className="well min-h-12 rounded-md px-3.5 text-base outline-none"
                disabled={busy}
              />
            </label>

            {error && (
              <SystemBanner tone="critical">
                {KNOWN.has(error) || error === "amount_too_small"
                  ? t(`errors.${error}` as never)
                  : t("errors.generic")}
              </SystemBanner>
            )}

            <Button type="submit" size="cta" disabled={busy}>
              {busy ? tc("loading") : t("cta")}
            </Button>
            <p className="text-[0.8125rem] leading-relaxed text-subtle">{t("holdNote")}</p>
          </form>
        </Panel>
      )}

      <div className="flex flex-col gap-3.5 lg:col-span-5 lg:gap-5">
        <Panel>
          <PanelHeader title={t("historyTitle")} />
          {(list.data?.payouts.length ?? 0) === 0 ? (
            <PanelBody>
              <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
                {t("historyEmpty")}
              </p>
            </PanelBody>
          ) : (
            <div className="border-t border-border">
              {list.data?.payouts.map((p) => (
                <div key={p.id} className="border-b border-border px-4 py-3 last:border-0 lg:px-5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="tnum text-base font-semibold">
                      {money(p.amountCents)}{" "}
                      <span className="font-sans font-normal text-muted-foreground">
                        {tc("birr")}
                      </span>
                    </span>
                    <PayoutStatus status={p.status} />
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <span className="tnum text-[0.875rem] text-muted-foreground">
                      {p.accountNumber}
                    </span>
                    <span className="font-latin text-[0.8125rem] text-subtle">
                      {eatStamp(p.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeader title={t("howTitle")} />
          <PanelBody>
            <ol className="flex flex-col gap-3">
              {[t("how1"), t("how2"), t("how3")].map((step, i) => (
                <li key={step} className="flex gap-3">
                  <span className="tnum grid size-6 flex-none place-items-center rounded-full border border-input text-[0.8125rem] font-semibold text-gold-400">
                    {i + 1}
                  </span>
                  <span className="text-[0.9375rem] leading-relaxed text-muted-foreground">
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}

function PayoutStatus({ status }: { status: PayoutResponse["status"] }) {
  const t = useTranslations("withdraw");
  const cls =
    status === "settled"
      ? "text-gain"
      : status === "rejected"
        ? "text-loss"
        : "text-platinum-400";
  const glyph = status === "settled" ? "✓" : status === "rejected" ? "✕" : "◑";
  return (
    <span className={cn("text-[0.9375rem]", cls)}>
      {glyph} {t(`status.${status}` as never)}
    </span>
  );
}
