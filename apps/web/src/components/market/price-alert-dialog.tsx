"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { AlertsResponse, MetalAsset } from "@alkeva/shared";

import { useAssetPrice } from "@/components/market/price-provider";
import { BellPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Set a one-shot threshold alert (F24). Non-advisory by design: the dialog
 * asks for a number and a direction, and the notification that eventually
 * fires states the crossing — it never suggests acting on it.
 *
 * A real Dialog (focus-trapped, Escape closes, backdrop) — the old hand-rolled
 * popover positioned itself off the card and could clip against the viewport.
 */
export function PriceAlertButton({
  asset,
  compact = false,
}: {
  asset: MetalAsset;
  /** An icon button for panel headers; the full-width button otherwise. */
  compact?: boolean;
}) {
  const t = useTranslations("alerts");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [threshold, setThreshold] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  // The shared store — instant prefill with the same tick every surface shows.
  const price = useAssetPrice(asset);

  // Prefill with the live price so "a bit above current" is one edit away.
  useEffect(() => {
    if (open && price && threshold === "") {
      setThreshold((Number(BigInt(price.etbCentsPerGram)) / 100).toFixed(2));
    }
  }, [open, price, threshold]);

  async function save() {
    const parsed = Number.parseFloat(threshold.replace(/,/g, ""));
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    setBusy(true);
    setState("idle");
    try {
      await api<AlertsResponse>("/alerts", {
        method: "POST",
        body: JSON.stringify({
          asset,
          direction,
          thresholdCentsPerGram: String(Math.round(parsed * 100)),
        }),
      });
      setState("saved");
      setTimeout(() => {
        setOpen(false);
        setState("idle");
        setThreshold("");
      }, 1200);
    } catch (err) {
      setState(err instanceof ApiError ? "error" : "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {compact ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("cta", { metal: asset === "XAU" ? tc("gold") : tc("platinum") })}
            title={t("cta", { metal: asset === "XAU" ? tc("gold") : tc("platinum") })}
          >
            <BellPlus className="size-[1.0625rem]" strokeWidth={1.8} />
          </Button>
        ) : (
          <Button variant="outline" className="w-full">
            <BellPlus />
            {t("cta", { metal: asset === "XAU" ? tc("gold") : tc("platinum") })}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-[24rem]">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          {price && (
            <DialogDescription>
              {t("current", { price: money(price.etbCentsPerGram) })}
            </DialogDescription>
          )}
        </DialogHeader>

        <Segmented
          value={direction}
          onValueChange={setDirection}
          stretch
          size="lg"
          aria-label={t("title")}
          options={[
            { value: "above", label: `↑ ${t("above")}` },
            { value: "below", label: `↓ ${t("below")}` },
          ]}
        />

        <div className="flex h-12 items-center rounded-md border border-border bg-panel-2 transition-[border-color,box-shadow] focus-within:border-gold-500 focus-within:shadow-[0_0_0_3px_oklch(0.717_0.098_73.3/0.18)]">
          <input
            inputMode="decimal"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            aria-label={t("title")}
            className="tnum h-full w-full bg-transparent px-3.5 text-[1.0625rem] font-medium outline-none"
            disabled={busy}
          />
          <span className="tnum pe-3.5 text-[0.8125rem] text-muted-foreground">
            {tc("birr")}/{tc("g")}
          </span>
        </div>

        {state === "saved" ? (
          <p className="text-[0.875rem] text-gain">✓ {t("saved")}</p>
        ) : (
          <Button className="w-full" disabled={busy} onClick={() => void save()}>
            {t("save")}
          </Button>
        )}
        {state === "error" && <p className="text-[0.875rem] text-loss">{t("error")}</p>}
      </DialogContent>
    </Dialog>
  );
}
