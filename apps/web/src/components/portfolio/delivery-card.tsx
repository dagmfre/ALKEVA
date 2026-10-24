"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { DeliveryListResponse, HoldingDto, MetalAsset } from "@alkeva/shared";

import { Badge } from "@/components/ui/badge";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Coin, Panel, PanelHeader } from "@/components/ui/panel";
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
 *
 * Always rendered: below the eligible tiers it states what unlocks delivery
 * beside what you hold, instead of leaving a hole in the grid.
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
    <Panel className={className} aria-label={t("delivery.title")}>
      <PanelHeader
        title={t("delivery.title")}
        action={
          <Badge variant={eligible ? "gain" : "muted"} dot>
            {eligible ? t("delivery.open") : t("delivery.lockedBadge")}
          </Badge>
        }
      />
      <div className="flex flex-1 flex-col gap-3.5 px-[1.125rem] pb-[1.125rem]">
        <p className="text-[0.84375rem] leading-relaxed text-muted-foreground">
          {eligible ? t("delivery.body") : t("delivery.locked")}
        </p>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[0.75rem] border border-border bg-border">
          {holdings.length === 0 ? (
            <div className="col-span-2 bg-background p-3 text-[0.8125rem] text-subtle">—</div>
          ) : (
            holdings.map((h) => (
              <div key={h.asset} className="flex flex-col gap-1 bg-background p-3">
                <span className="flex items-center gap-1.5 text-[0.75rem] text-subtle">
                  <Coin metal={h.asset} size="sm" />
                  {t("delivery.youHold")}
                </span>
                <span className="tnum text-[0.9375rem] font-semibold">
                  {grams(h.gramsMg)} <span className="font-sans text-[0.75rem] text-subtle">{tc("g")}</span>
                </span>
              </div>
            ))
          )}
        </div>

      {requests.length === 0 && (
        <ol className="flex flex-col gap-2.5 border-t border-border pt-3.5">
          {(["step1", "step2", "step3"] as const).map((k, i) => (
            <li key={k} className="flex gap-3 text-[0.8125rem] leading-snug">
              <span className="tnum grid size-5 flex-none place-items-center rounded-full bg-raised text-[0.6875rem] font-semibold text-gold-300">
                {i + 1}
              </span>
              <span className="text-muted-foreground">{t(`delivery.${k}` as never)}</span>
            </li>
          ))}
        </ol>
      )}

      {requests.length > 0 && (
        <div className="flex flex-col border-t border-border">
          {requests.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2.5 last:border-b-0"
            >
              <span className="flex items-center gap-2.5 text-[0.9375rem]">
                <Coin metal={r.asset} size="sm" />
                <span className="tnum font-semibold">{grams(r.gramsMg)}</span> {tc("g")}{" "}
                {r.asset === "XAU" ? tc("gold") : tc("platinum")}
              </span>
              <span className="flex items-center gap-3">
                {r.reviewNote && r.status === "rejected" && (
                  <span className="text-[0.8125rem] text-muted-foreground">{r.reviewNote}</span>
                )}
                <Badge
                  dot
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

        {eligible ? (
          <Button variant="outline" className="mt-auto" onClick={() => setOpen(true)}>
            {t("delivery.request")}
          </Button>
        ) : (
          <Button variant="outline" className="mt-auto" disabled>
            <Lock />
            {t("delivery.unlocksLater")}
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("delivery.request")}</DialogTitle>
            <DialogDescription>{t("delivery.dialogBody")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="data-label">{t("delivery.metal")}</span>
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
              <span className="data-label">{t("delivery.grams")}</span>
              <div className="flex h-11 items-center gap-2.5 rounded-md border border-border bg-panel-2 px-3.5 focus-within:border-gold-500">
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
              <span className="data-label">{t("delivery.phone")}</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                autoComplete="tel"
                className="h-11 rounded-md border border-border bg-panel-2 px-3.5 text-[0.9375rem] outline-none transition-colors focus:border-gold-500"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="data-label">{t("delivery.address")}</span>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={3}
                className="rounded-md border border-border bg-panel-2 px-3.5 py-2.5 text-[0.9375rem] outline-none transition-colors focus:border-gold-500"
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
    </Panel>
  );
}
