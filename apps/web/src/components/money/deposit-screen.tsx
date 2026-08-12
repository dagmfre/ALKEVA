"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { DepositChannelsResponse, KycMeResponse, PaymentResponse } from "@alkeva/shared";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SystemBanner } from "@/components/system/banner";
import { api, ApiError } from "@/lib/api";
import { money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

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
 */
export function DepositScreen() {
  const t = useTranslations("deposit");
  const tc = useTranslations("common");
  const kyc = useResource<KycMeResponse>("/kyc/me");
  const channels = useResource<DepositChannelsResponse>("/payments/channels");
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
    <div className="mx-auto flex max-w-[36rem] flex-col gap-3.5">
      {needsKyc ? (
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="text-lg font-semibold">{t("kycGateTitle")}</h2>
          <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
            {t("kycGateBody")}
          </p>
          <Button size="cta" asChild>
            <Link href="/kyc">{t("kycGateCta")}</Link>
          </Button>
        </Card>
      ) : (
        <Card className="p-5">
          <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
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
              {channels.data && (
                <span className="text-[0.8125rem] text-subtle">
                  {t("minimum", { amount: money(channels.data.minDepositCents) })}
                </span>
              )}
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
            <p className="text-[0.8125rem] leading-relaxed text-subtle">{t("redirectNote")}</p>
          </form>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold">{t("channelsTitle")}</h2>
        {channels.data ? (
          <div className="flex flex-col">
            {channels.data.channels.map((c, i) => (
              <div
                key={c.key}
                className={`flex items-center justify-between gap-3 py-2.5 ${
                  i === 0 ? "" : "border-t border-border"
                }`}
              >
                <span className="text-[0.9375rem]">{t(`channels.${c.key}` as never)}</span>
                <span className="tnum text-[0.9375rem] text-muted-foreground">
                  {c.maxInCents
                    ? t("upTo", { amount: money(c.maxInCents) })
                    : "—"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <Skeleton className="h-24" />
        )}
        <p className="mt-3 text-[0.8125rem] leading-relaxed text-subtle">{t("channelsNote")}</p>
      </Card>
    </div>
  );
}
