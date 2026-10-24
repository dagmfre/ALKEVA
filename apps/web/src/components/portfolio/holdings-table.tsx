"use client";

import { useTranslations } from "next-intl";
import type { HoldingDto, MetalAsset, OrderSide } from "@alkeva/shared";

import { Button } from "@/components/ui/button";
import { Coin } from "@/components/ui/panel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ARROW, SIGN, deltaClass, direction, grams, money, pctMilli, signedMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The positions table (RabbitX's, translated to metal): one row per metal
 * with grams, average cost per gram, the live mark, value, gain/loss and the
 * share of everything held — then cash, because cash is a position too.
 *
 * A table from `md` up, a two-line list below it; both carry every figure.
 * Holdings arrive already re-marked at the shared live tick.
 */
export function HoldingsTable({
  holdings,
  cashCents,
  onTrade,
  className,
}: {
  holdings: HoldingDto[];
  cashCents: string;
  onTrade?: (asset: MetalAsset, side: OrderSide) => void;
  className?: string;
}) {
  const t = useTranslations("trade");
  const tc = useTranslations("common");

  const cash = BigInt(cashCents);
  const total = holdings.reduce((s, h) => s + BigInt(h.valueCents), cash);
  const share = (cents: bigint) => (total > 0n ? (Number(cents) / Number(total)) * 100 : 0);

  return (
    <div className={className}>
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t("colAsset")}</TableHead>
            <TableHead className="text-end">{t("colGrams")}</TableHead>
            <TableHead className="text-end">{t("colAvgCost")}</TableHead>
            <TableHead className="text-end">{t("colMark")}</TableHead>
            <TableHead className="text-end">{t("colValue")}</TableHead>
            <TableHead className="text-end">{t("colGainLoss")}</TableHead>
            <TableHead className="text-end">{t("colShare")}</TableHead>
            {onTrade && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {holdings.map((h) => {
            const dir = direction(h.gainLossCents);
            const pct = pctMilli(h.gainLossPctMilli);
            const mg = BigInt(h.gramsMg);
            const avg = mg > 0n ? (BigInt(h.costBasisCents) * 1000n) / mg : 0n;
            return (
              <TableRow key={h.asset}>
                <TableCell>
                  <AssetCell asset={h.asset} />
                </TableCell>
                <TableCell className="tnum text-end">{grams(h.gramsMg)}</TableCell>
                <TableCell className="tnum text-end text-muted-foreground">{money(avg)}</TableCell>
                <TableCell className="tnum text-end">
                  {h.unitEtbCentsPerGram ? money(h.unitEtbCentsPerGram) : "—"}
                </TableCell>
                <TableCell className="tnum text-end font-semibold">{money(h.valueCents)}</TableCell>
                <TableCell className={cn("tnum text-end", deltaClass(dir))}>
                  <span className="flex flex-col items-end gap-0.5">
                    <span>
                      {ARROW[dir]} {signedMoney(h.gainLossCents)}
                    </span>
                    {pct && (
                      <span className="text-[0.75rem]">
                        {SIGN[dir]}
                        {pct}%
                      </span>
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-end">
                  <ShareBar pct={share(BigInt(h.valueCents))} metal={h.asset} />
                </TableCell>
                {onTrade && (
                  <TableCell className="text-end">
                    <span className="inline-flex gap-1.5">
                      <Button size="sm" onClick={() => onTrade(h.asset, "buy")}>
                        {t("buy")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onTrade(h.asset, "sell")}>
                        {t("sell")}
                      </Button>
                    </span>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
          <TableRow>
            <TableCell>
              <span className="flex items-center gap-3">
                <CashToken />
                <span className="flex flex-col gap-0.5">
                  <b className="text-[0.875rem]">{t("cash")}</b>
                  <span className="text-[0.75rem] text-subtle">{t("cashReady")}</span>
                </span>
              </span>
            </TableCell>
            <TableCell className="text-end text-subtle">—</TableCell>
            <TableCell className="text-end text-subtle">—</TableCell>
            <TableCell className="text-end text-subtle">—</TableCell>
            <TableCell className="tnum text-end font-semibold">{money(cash)}</TableCell>
            <TableCell className="text-end text-subtle">—</TableCell>
            <TableCell className="text-end">
              <ShareBar pct={share(cash)} metal="ETB" />
            </TableCell>
            {onTrade && <TableCell />}
          </TableRow>
        </TableBody>
      </Table>

      {/* Phone: one line per position, every figure kept. */}
      <div className="md:hidden">
        {holdings.map((h) => {
          const dir = direction(h.gainLossCents);
          const pct = pctMilli(h.gainLossPctMilli);
          return (
            <div key={h.asset} className="flex items-center gap-3 border-t border-border px-4 py-3 first:border-t-0">
              <Coin metal={h.asset} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="text-[0.9375rem] font-bold">{h.asset === "XAU" ? tc("gold") : tc("platinum")}</div>
                <div className="tnum truncate text-[0.75rem] text-subtle">
                  {grams(h.gramsMg)} {tc("g")} · {h.unitEtbCentsPerGram ? money(h.unitEtbCentsPerGram) : "—"}
                </div>
              </div>
              <div className="text-end">
                <div className="tnum text-[0.875rem] font-semibold">{money(h.valueCents)}</div>
                <div className={cn("tnum text-[0.75rem]", deltaClass(dir))}>
                  {ARROW[dir]} {pct ? `${SIGN[dir]}${pct}%` : signedMoney(h.gainLossCents)}
                </div>
              </div>
            </div>
          );
        })}
        <div className="flex items-center gap-3 border-t border-border px-4 py-3">
          <CashToken large />
          <div className="min-w-0 flex-1">
            <div className="text-[0.9375rem] font-bold">{t("cash")}</div>
            <div className="text-[0.75rem] text-subtle">{t("cashReady")}</div>
          </div>
          <div className="tnum text-[0.875rem] font-semibold">{money(cash)}</div>
        </div>
      </div>
    </div>
  );
}

export function AssetCell({ asset }: { asset: MetalAsset }) {
  const tc = useTranslations("common");
  const t = useTranslations("trade");
  return (
    <span className="flex items-center gap-3">
      <Coin metal={asset} size="lg" className="size-[1.875rem]" />
      <span className="flex flex-col gap-0.5">
        <b className="text-[0.875rem]">{asset === "XAU" ? tc("gold") : tc("platinum")}</b>
        <span className="tnum text-[0.6875rem] text-subtle">{t("vaultBacked", { code: asset })}</span>
      </span>
    </span>
  );
}

function CashToken({ large = false }: { large?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid flex-none place-items-center rounded-full bg-raised font-latin font-bold text-muted-foreground",
        large ? "size-9 text-[0.625rem]" : "size-[1.875rem] text-[0.5625rem]",
      )}
    >
      ETB
    </span>
  );
}

export function ShareBar({ pct, metal }: { pct: number; metal: MetalAsset | "ETB" }) {
  return (
    <span className="tnum inline-flex items-center gap-2 text-[0.8125rem]">
      {pct.toFixed(1)}%
      <span className="inline-block h-[5px] w-14 overflow-hidden rounded-full bg-raised" aria-hidden="true">
        <span
          className={cn(
            "block h-full rounded-full",
            metal === "XAU" ? "bg-gold-400" : metal === "XPT" ? "bg-platinum-400" : "bg-subtle",
          )}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </span>
    </span>
  );
}
