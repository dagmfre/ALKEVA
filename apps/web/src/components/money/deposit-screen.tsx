"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type {
  BalancesResponse,
  DepositChannelsResponse,
  KycMeResponse,
  PaymentResponse,
} from "@alkeva/shared";

import { AmountField, KycGate, Steps, WalletNav } from "@/components/money/wallet-ui";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { SystemBanner } from "@/components/system/banner";
import { api, ApiError } from "@/lib/api";
import { grams, money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

/** The top-ups people actually make, in whole birr. */
const QUICK_ETB = ["1000", "5000", "10000", "50000"];

const KNOWN = new Set([
  "kyc_required",
  "amount_too_small",
  "account_frozen",
  "payments_unconfigured",
  "chapa_error",
]);

/**
 * Money in. The form collects only an amount — the payment channel (Telebirr,
 * CBEBirr, bank, card) is chosen on Chapa's hosted checkout, so the channel
 * caps shown here are information, not validation: Chapa enforces them at
 * payment time (fact-check §6.5).
 *
 *   wallet nav
 *   deposit form + how it works      │ your balance + channels
 */
export function DepositScreen() {
  const t = useTranslations("deposit");
  const tc = useTranslations("common");
  const kyc = useResource<KycMeResponse>("/kyc/me");
  const channels = useResource<DepositChannelsResponse>("/payments/channels");
  const balances = useResource<BalancesResponse>("/ledger/balances");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsKyc = kyc.data !== null && kyc.data.kycTier < 1;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = Number.parseFloat(amount.replace(/,/g, ""));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("amount_too_small");
      return;
    }
    setBusy(true);
    try {
      const payment = await api<PaymentResponse>("/payments", {
        method: "POST",
        body: JSON.stringify({ amountCents: String(Math.round(parsed * 100)) }),
      });
      if (payment.checkoutUrl) {
        // Hand the browser to Chapa's hosted checkout; it returns to
        // /deposit/return?id=… when the user finishes or gives up.
        window.location.assign(payment.checkoutUrl);
        return;
      }
      setError("chapa_error");
      setBusy(false);
    } catch (err) {
      setError(err instanceof ApiError && KNOWN.has(err.code) ? err.code : "generic");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <WalletNav />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_25.25rem]">
        {needsKyc ? (
          <KycGate title={t("kycGateTitle")} body={t("kycGateBody")} cta={t("kycGateCta")} />
        ) : (
          <Panel aria-label={t("amountLabel")}>
            <PanelHeader title={t("formTitle")} hint={t("viaChapa")} />
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
                  chips={QUICK_ETB}
                  foot={channels.data ? t("minimum", { amount: money(channels.data.minDepositCents) }) : undefined}
                />
                {error && (
                  <SystemBanner tone="critical" className="mb-0">
                    {KNOWN.has(error) || error === "amount_too_small"
                      ? t(`errors.${error}` as never)
                      : t("errors.generic")}
                  </SystemBanner>
                )}
                <div className="mt-auto flex flex-col gap-2">
                  <Button type="submit" size="cta" disabled={busy}>
                    {busy ? tc("loading") : t("cta")}
                  </Button>
                  <p className="text-[0.75rem] leading-relaxed text-subtle">{t("redirectNote")}</p>
                </div>
              </div>
              <div className="flex flex-col gap-4 border-t border-border pt-4 xl:border-t-0 xl:border-s xl:ps-8 xl:pt-0">
                <Steps title={t("howTitle")} items={[t("how1"), t("how2"), t("how3")]} />
              </div>
            </form>
          </Panel>
        )}

        <Panel aria-label={t("balanceTitle")}>
          <PanelHeader title={t("balanceTitle")} />
          <div className="flex flex-1 flex-col gap-4 px-[1.125rem] pb-[1.125rem]">
            {balances.data ? (
              <div className="flex flex-col gap-2">
                <span className="flex items-baseline gap-2">
                  <span className="tnum text-[1.875rem] leading-none font-semibold tracking-[-0.02em]">
                    {money(balances.data.etbCents)}
                  </span>
                  <span className="text-[0.875rem] text-muted-foreground">{tc("birr")}</span>
                </span>
                <span className="tnum text-[0.75rem] text-subtle">
                  {tc("gold")} {grams(balances.data.xauMg)} {tc("g")} · {tc("platinum")} {grams(balances.data.xptMg)}{" "}
                  {tc("g")}
                </span>
              </div>
            ) : (
              <Skeleton className="h-12 w-48" />
            )}
            <div className="flex flex-col border-t border-border pt-3">
              <span className="mb-1.5 text-[0.8125rem] font-bold">{t("channelsTitle")}</span>
              {channels.data ? (
                channels.data.channels.map((c) => (
                  <div key={c.key} className="flex items-baseline justify-between gap-3 py-1.5 text-[0.8125rem]">
                    <span>{t(`channels.${c.key}` as never)}</span>
                    <span className="tnum text-muted-foreground">
                      {c.maxInCents ? t("upTo", { amount: money(c.maxInCents) }) : "—"}
                    </span>
                  </div>
                ))
              ) : (
                <Skeleton className="h-24" />
              )}
            </div>
            <p className="mt-auto text-[0.75rem] leading-relaxed text-subtle">{t("channelsNote")}</p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
