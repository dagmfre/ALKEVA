"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { AlertsResponse, MetalAsset } from "@alkeva/shared";

import { useAssetPrice } from "@/components/market/price-provider";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Set a one-shot threshold alert (F24). Non-advisory by design: the dialog
 * asks for a number and a direction, and the notification that eventually
 * fires states the crossing — it never suggests acting on it.
 */
export function PriceAlertButton({ asset }: { asset: MetalAsset }) {
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
    <div className="relative">
      <Button variant="outline" className="w-full" onClick={() => setOpen((v) => !v)}>
        {t("cta", { metal: asset === "XAU" ? tc("gold") : tc("platinum") })}
      </Button>

      {open && (
        <div className="absolute bottom-full start-0 z-40 mb-2 w-full min-w-[280px] rounded-lg border border-border bg-popover p-4 shadow-lg">
          <p className="mb-3 text-[0.9375rem] font-semibold">{t("title")}</p>
          <div className="mb-3 grid grid-cols-2 gap-1.5">
            {(["above", "below"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                className={cn(
                  "rounded-md px-3 py-2 text-[0.875rem]",
                  direction === d ? "pill-active" : "well text-muted-foreground",
                )}
              >
                {t(d)}
              </button>
            ))}
          </div>
          <div className="well mb-3 flex items-center rounded-md">
            <input
              inputMode="decimal"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="tnum min-h-11 w-full bg-transparent px-3 text-base outline-none"
              disabled={busy}
            />
            <span className="pe-3 text-[0.875rem] text-muted-foreground">
              {tc("birr")}/{tc("g")}
            </span>
          </div>
          {price && (
            <p className="mb-3 text-[0.8125rem] text-subtle">
              {t("current", { price: money(price.etbCentsPerGram) })}
            </p>
          )}
          {state === "saved" ? (
            <p className="text-[0.9375rem] text-gain">✓ {t("saved")}</p>
          ) : (
            <Button variant="flat" size="sm" className="w-full" disabled={busy} onClick={() => void save()}>
              {t("save")}
            </Button>
          )}
          {state === "error" && <p className="mt-2 text-[0.875rem] text-loss">{t("error")}</p>}
        </div>
      )}
    </div>
  );
}
