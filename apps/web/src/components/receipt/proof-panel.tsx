"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { LedgerLegDto, OrderProofResponse } from "@alkeva/shared";

import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { direction, eatStamp, grams, money, SIGN } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

/** Signed ledger amount: ETB in cents, metals in milligrams. */
function legAmount(leg: LedgerLegDto): string {
  const v = BigInt(leg.amount);
  const abs = (v < 0n ? -v : v).toString();
  return `${SIGN[direction(leg.amount)]}${leg.asset === "ETB" ? money(abs) : `${grams(abs)}`}`;
}

/**
 * The record behind the receipt.
 *
 * A receipt asks to be believed. This shows the entries instead: both sides of
 * every leg, the check that each asset nets to zero, the quote that fixed the
 * price and the feed it came from. The zero-sum figures are computed by the API
 * from these same legs, so the claim and the evidence cannot drift apart.
 */
export function ProofPanel({ orderId, className }: { orderId: string; className?: string }) {
  const t = useTranslations("receipt.proof");
  const tc = useTranslations("common");
  const { data, error, loading } = useResource<OrderProofResponse>(`/orders/${orderId}/proof`);

  function accountLabel(leg: LedgerLegDto): string {
    if (leg.account === "you") return t("you");
    if (leg.account.startsWith("system:vault:")) {
      return t("accounts.vault", {
        metal: leg.account.endsWith("XAU") ? tc("gold") : tc("platinum"),
      });
    }
    const key = leg.account.replace("system:", "");
    return ["cash", "fees", "tax", "reforestation"].includes(key)
      ? t(`accounts.${key}` as never)
      : leg.account;
  }

  if (error && !loading) return null;

  return (
    <Panel className={className} data-print="hide">
      <PanelHeader title={t("title")} hint={t("hint")} />
      <PanelBody>
        {!data ? (
          <Skeleton className="h-56 rounded-lg" />
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">{t("intro")}</p>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[20rem] text-[0.9375rem]">
                <thead>
                  <tr className="border-b border-border text-start text-[0.8125rem] text-muted-foreground">
                    <th scope="col" className="py-2 text-start font-normal">
                      {t("accountCol")}
                    </th>
                    <th scope="col" className="py-2 text-end font-normal">
                      {t("amountCol")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.legs.map((leg, i) => (
                    <tr key={`${leg.account}-${leg.asset}-${i}`} className="border-b border-border">
                      <td className="py-2.5">
                        {accountLabel(leg)}
                        <span className="ms-2 text-[0.8125rem] text-muted-foreground">
                          {leg.asset}
                        </span>
                      </td>
                      <td className="tnum py-2.5 text-end font-medium">{legAmount(leg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* The check itself, stated per asset. An unbalanced result would
                be a defect in the ledger, so it is shown, never hidden. */}
            <div className="well flex flex-col gap-1.5 rounded-lg p-3">
              {data.checks.map((c) => (
                <p key={c.asset} className="flex items-baseline justify-between gap-3 text-[0.9375rem]">
                  <span className="text-muted-foreground">
                    {t("checkLabel", { asset: c.asset })}
                  </span>
                  <span className={`tnum font-medium ${c.balanced ? "text-gain" : "text-loss"}`}>
                    {c.balanced ? "✓ " : "✕ "}
                    {c.asset === "ETB" ? money(c.sum) : grams(c.sum)}
                  </span>
                </p>
              ))}
              <p className="pt-1 text-[0.8125rem] text-muted-foreground">
                {data.balanced ? t("balancedYes") : t("balancedNo")}
              </p>
            </div>

            <dl className="flex flex-col gap-1.5 text-[0.8125rem] text-muted-foreground">
              <div className="flex flex-wrap justify-between gap-x-3">
                <dt>{t("quoteLock")}</dt>
                <dd className="tnum">
                  {money(data.quote.unitEtbCentsPerGram)} · {eatStamp(data.quote.createdAt)} →{" "}
                  {eatStamp(data.quote.expiresAt)}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-x-3">
                <dt>{t("provenance")}</dt>
                <dd>
                  {data.price.source} · {data.price.fxSource} · {eatStamp(data.price.at)}
                </dd>
              </div>
            </dl>

            <Button asChild variant="outline" className="self-start">
              <Link href={`/assistant?prove=${encodeURIComponent(data.serial)}`}>{t("askAi")}</Link>
            </Button>
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}
