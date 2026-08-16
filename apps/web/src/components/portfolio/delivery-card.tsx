"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { DeliveryListResponse, HoldingDto, MetalAsset } from "@alkeva/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, ApiError } from "@/lib/api";
import { grams, gramsToMg } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

const DELIVERY_ERRORS = new Set([
  "delivery_not_eligible",
  "delivery_already_open",
  "insufficient_metal",
  "amount_too_small",
  "account_frozen",
]);

/**
 * Physical delivery (spec F18): eligible tiers request the handover of held
 * grams. A workflow record, not a trade — nothing moves in the ledger when a
 * request is filed, and the copy says the team confirms the handover.
 */
export function DeliveryCard({
  eligible,
  holdings,
  className,
}: {
  eligible: boolean;
  holdings: HoldingDto[];
  className?: string;
}) {
  const t = useTranslations("portfolio");
  const tc = useTranslations("common");
  const [revision, setRevision] = useState(0);
  const { data } = useResource<DeliveryListResponse>(eligible ? "/delivery" : null, {
    revision,
  });

  const [open, setOpen] = useState(false);
  const [asset, setAsset] = useState<MetalAsset>(holdings[0]?.asset ?? "XAU");
  const [gramsInput, setGramsInput] = useState("1");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  if (!eligible) return null;

  const requests = data?.requests ?? [];

  async function submit() {
    setErrorCode(null);
    const mg = gramsToMg(gramsInput);
    if (mg === null) {
      setErrorCode("amount_too_small");
      return;
    }
    setBusy(true);
    try {
      await api("/delivery", {
        method: "POST",
        body: JSON.stringify({
          asset,
          gramsMg: mg.toString(),
          contactPhone: phone,
          address,
        }),
      });
      setOpen(false);
      setPhone("");
      setAddress("");
      setRevision((n) => n + 1);
    } catch (err) {
      setErrorCode(
        err instanceof ApiError && DELIVERY_ERRORS.has(err.code) ? err.code : "generic",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={cn("rounded-lg border border-border bg-card p-4 lg:p-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[1.125rem] font-semibold">{t("delivery.title")}</h2>
          <p className="mt-0.5 text-[0.9375rem] leading-relaxed text-muted-foreground">
            {t("delivery.body")}
          </p>
        </div>
        <Button variant="gold" onClick={() => setOpen(true)}>
          {t("delivery.request")}
        </Button>
      </div>

      {requests.length > 0 && (
        <div className="mt-3.5 flex flex-col border-t border-border">
          {requests.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2.5 last:border-b-0"
            >
              <span className="flex items-center gap-2.5 text-[0.9375rem]">
                <span
                  className={cn(
                    "size-2 rounded-full",
                    r.asset === "XAU" ? "bg-gold-500" : "bg-platinum-400",
                  )}
                />
                <span className="tnum font-semibold">{grams(r.gramsMg)}</span> {tc("g")}{" "}
                {r.asset === "XAU" ? tc("gold") : tc("platinum")}
              </span>
              <span className="flex items-center gap-3">
                {r.reviewNote && r.status === "rejected" && (
                  <span className="text-[0.8125rem] text-muted-foreground">{r.reviewNote}</span>
                )}
                <Badge
                  variant={
                    r.status === "rejected"
                      ? "loss"
                      : r.status === "scheduled" || r.status === "approved"
                        ? "gain"
                        : "muted"
                  }
                >
                  {t(`delivery.status.${r.status}` as never)}
                </Badge>
              </span>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("delivery.request")}</DialogTitle>
            <DialogDescription>{t("delivery.dialogBody")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[0.9375rem] font-medium">{t("delivery.metal")}</span>
              <Select value={asset} onValueChange={(v) => setAsset(v as MetalAsset)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {holdings.map((h) => (
                    <SelectItem key={h.asset} value={h.asset}>
                      {h.asset === "XAU" ? tc("gold") : tc("platinum")} · {grams(h.gramsMg)}{" "}
                      {tc("g")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[0.9375rem] font-medium">{t("delivery.grams")}</span>
              <div className="well flex min-h-12 items-center gap-2.5 rounded-md pe-3.5 ps-3.5">
                <input
                  value={gramsInput}
                  onChange={(e) => setGramsInput(e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  className="tnum w-full flex-1 border-0 bg-transparent text-base font-semibold outline-none"
                />
                <span className="text-[0.9375rem] text-muted-foreground">{tc("gram")}</span>
              </div>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[0.9375rem] font-medium">{t("delivery.phone")}</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                autoComplete="tel"
                className="well min-h-12 rounded-md border-input px-3.5 text-base outline-none transition-colors focus:border-gold-400"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[0.9375rem] font-medium">{t("delivery.address")}</span>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={3}
                className="well rounded-md border-input px-3.5 py-2.5 text-base outline-none transition-colors focus:border-gold-400"
              />
            </label>

            {errorCode && (
              <p className="text-[0.9375rem] text-loss">
                {t(`delivery.errors.${errorCode}` as never)}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("delivery.cancel")}
            </Button>
            <Button onClick={() => void submit()} disabled={busy || !phone || address.length < 10}>
              {t("delivery.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
