"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { PaymentResponse } from "@alkeva/shared";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { money } from "@/lib/format";

/**
 * Where Chapa's checkout sends the browser back. This page NEVER credits —
 * it asks the API to reconcile (server-side verify against Chapa) and then
 * polls the payment row until it turns credited or failed. Design doc §5:
 * "Return-URL landing polls payment status; it never credits."
 */
export function DepositReturnScreen() {
  const t = useTranslations("deposit");
  const tc = useTranslations("common");
  const params = useSearchParams();
  const id = params.get("id");
  const [payment, setPayment] = useState<PaymentResponse | null>(null);
  const [attempts, setAttempts] = useState(0);
  const reconciled = useRef(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function check() {
      try {
        // First pass triggers a server-side verify; later passes just read.
        const next = reconciled.current
          ? await api<PaymentResponse>(`/payments/${id}`)
          : await api<PaymentResponse>(`/payments/${id}/reconcile`, { method: "POST" });
        reconciled.current = true;
        if (!cancelled) setPayment(next);
      } catch {
        /* keep polling — transient errors must not kill the page */
      }
    }

    void check();
    const timer = setInterval(() => {
      setAttempts((n) => n + 1);
      void check();
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id]);

  if (!id) {
    return (
      <Card className="mx-auto max-w-[28rem] p-6 text-center text-muted-foreground">
        {t("errors.generic")}
      </Card>
    );
  }

  const status = payment?.status;
  const settled = status === "credited";
  const failed = status === "failed";
  const waitingLong = !settled && !failed && attempts >= 5;

  return (
    <div className="mx-auto flex max-w-[28rem] flex-col gap-4">
      <Card className="flex flex-col items-center gap-3 p-6 text-center">
        {settled ? (
          <>
            <span className="text-3xl text-gain">✓</span>
            <h1 className="text-xl font-semibold">{t("returnSettledTitle")}</h1>
            <p className="tnum text-2xl font-semibold text-gold-400">
              {payment ? money(payment.amountCents) : ""}{" "}
              <span className="text-base font-normal text-muted-foreground">{tc("birr")}</span>
            </p>
            <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
              {t("returnSettledBody")}
            </p>
            <Button size="cta" asChild className="mt-1 w-full">
              <Link href="/">{t("returnHome")}</Link>
            </Button>
          </>
        ) : failed ? (
          <>
            <span className="text-3xl text-loss">✕</span>
            <h1 className="text-xl font-semibold">{t("returnFailedTitle")}</h1>
            <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
              {t("returnFailedBody")}
            </p>
            <Button size="cta" asChild className="mt-1 w-full">
              <Link href="/deposit">{t("returnRetry")}</Link>
            </Button>
          </>
        ) : (
          <>
            {/* No spinner theatrics: an honest "verifying with Chapa" line. */}
            <Skeleton className="size-9 rounded-full" />
            <h1 className="text-xl font-semibold">{t("returnPendingTitle")}</h1>
            <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
              {t("returnPendingBody")}
            </p>
            {waitingLong && (
              <p className="text-[0.8125rem] leading-relaxed text-subtle">
                {t("returnPendingLong")}
              </p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
