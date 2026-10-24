"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type {
  BalancesResponse,
  BankDto,
  KycMeResponse,
  PayoutResponse,
} from "@alkeva/shared";

import { AmountField, KycGate, Steps, WalletNav, fieldCls } from "@/components/money/wallet-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/panel";
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
 * sends it through Chapa or returns it. The requests list beside the form is
 * the user's window into that queue.
 *
 *   wallet nav
 *   withdraw form (amount · destination · how it works) │ your requests
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

  const payouts = list.data?.payouts ?? [];

  return (
    <div className="flex flex-col gap-3">
      <WalletNav />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_25.25rem]">
        {needsKyc ? (
          <KycGate title={t("kycGateTitle")} body={t("kycGateBody")} cta={t("kycGateCta")} />
        ) : (
          <Panel aria-label={t("formTitle")}>
            <PanelHeader
              title={t("formTitle")}
              action={
                <span className="tnum text-[0.8125rem] text-muted-foreground">
                  <span className="font-sans">{t("available")}</span>{" "}
                  <b className="font-semibold text-foreground">
                    {balances.data ? money(balances.data.etbCents) : "—"}
                  </b>{" "}
                  {tc("birr")}
                </span>
              }
            />
            <form
              onSubmit={(e) => void submit(e)}
              className="grid flex-1 grid-cols-1 gap-x-8 gap-y-5 px-[1.125rem] pb-[1.125rem] xl:grid-cols-[minmax(0,1fr)_17rem]"
            >
              <div className="flex flex-col gap-4">
                <AmountField
                  label={t("amountLabel")}
                  value={amount}
                  onChange={setAmount}
                  unit={tc("birr")}
                  disabled={busy}
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <span className="data-label">{t("bankLabel")}</span>
                    <Select value={bankCode} onValueChange={setBankCode} disabled={busy || banks.data === null}>
                      <SelectTrigger aria-label={t("bankLabel")}>
                        <SelectValue placeholder={banks.data === null ? tc("loading") : t("bankPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {sortedBanks.map((b) => (
                          <SelectItem key={b.id} value={String(b.id)}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {banks.error && <span className="text-[0.75rem] text-loss">{t("errors.banks_unavailable")}</span>}
                  </div>
                  <label className="flex flex-col gap-1.5">
                    <span className="data-label">{t("accountNumberLabel")}</span>
                    <input
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      required
                      minLength={4}
                      maxLength={34}
                      inputMode="numeric"
                      className={`${fieldCls} tnum`}
                      disabled={busy}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="data-label">{t("accountNameLabel")}</span>
                    <input
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                      required
                      minLength={2}
                      maxLength={120}
                      className={fieldCls}
                      disabled={busy}
                    />
                  </label>
                </div>
                {error && (
                  <SystemBanner tone="critical" className="mb-0">
                    {KNOWN.has(error) || error === "amount_too_small"
                      ? t(`errors.${error}` as never)
                      : t("errors.generic")}
                  </SystemBanner>
                )}
                <div className="mt-auto flex flex-col gap-2">
                  <Button type="submit" variant="ink" size="cta" disabled={busy}>
                    {busy ? tc("loading") : t("cta")}
                  </Button>
                  <p className="text-[0.75rem] leading-relaxed text-subtle">{t("holdNote")}</p>
                </div>
              </div>
              <div className="border-t border-border pt-4 xl:border-t-0 xl:border-s xl:ps-8 xl:pt-0">
                <Steps title={t("howTitle")} items={[t("how1"), t("how2"), t("how3")]} />
              </div>
            </form>
          </Panel>
        )}

        <Panel aria-label={t("historyTitle")} className="lg:h-0 lg:min-h-full">
          <PanelHeader
            title={t("historyTitle")}
            hint={payouts.length > 0 ? String(payouts.length) : undefined}
          />
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-border">
            {list.loading ? (
              <div className="p-4">
                <Skeleton className="h-24" />
              </div>
            ) : payouts.length === 0 ? (
              <p className="flex h-full min-h-32 items-center justify-center px-6 text-center text-[0.8125rem] leading-relaxed text-muted-foreground">
                {t("historyEmpty")}
              </p>
            ) : (
              payouts.map((p) => (
                <div key={p.id} className="border-b border-border px-[1.125rem] py-3 last:border-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="tnum text-[0.9375rem] font-semibold">
                      {money(p.amountCents)} <span className="font-sans text-[0.75rem] font-medium text-subtle">{tc("birr")}</span>
                    </span>
                    <PayoutStatus status={p.status} />
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3 text-[0.75rem]">
                    <span className="tnum text-muted-foreground">{p.accountNumber}</span>
                    <span className="tnum text-subtle">{eatStamp(p.createdAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function PayoutStatus({ status }: { status: PayoutResponse["status"] }) {
  const t = useTranslations("withdraw");
  return (
    <Badge dot variant={status === "settled" ? "gain" : status === "rejected" ? "loss" : "platinum"}>
      {t(`status.${status}` as never)}
    </Badge>
  );
}
