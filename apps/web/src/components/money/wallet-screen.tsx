"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowDownToLine, ArrowUpFromLine, Banknote, Truck } from "lucide-react";

import { useAssetPrice } from "@/components/market/price-provider";
import { WalletNav } from "@/components/money/wallet-ui";
import { useAppData } from "@/components/shell/app-data";
import { MetalIcon } from "@/components/shell/wallet-button";
import { useTradeSheet } from "@/components/trade/trade-sheet-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { eatStamp, grams, money } from "@/lib/format";

/**
 * The wallet overview: what you hold (birr, gold, platinum — each valued at
 * the live price), the money still in flight, and the doors (deposit,
 * withdraw, buy, sell). The header chip is the summary; this is the page.
 */
export function WalletScreen() {
  const t = useTranslations("wallet");
  const tc = useTranslations("common");
  const { wallet } = useAppData();
  const gold = useAssetPrice("XAU");
  const plat = useAssetPrice("XPT");
  const { open } = useTradeSheet();
  const w = wallet.data;

  const val = (mg: string | undefined, unit: string | undefined) =>
    mg !== undefined && unit ? (BigInt(unit) * BigInt(mg)) / 1000n : null;
  const goldValue = val(w?.xauMg, gold?.etbCentsPerGram);
  const platValue = val(w?.xptMg, plat?.etbCentsPerGram);
  const total = w && goldValue !== null && platValue !== null ? BigInt(w.etbCents) + goldValue + platValue : null;

  return (
    <div className="flex flex-col gap-3">
      <WalletNav />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_25.25rem]">
        <Panel aria-label={t("title")}>
          <PanelHeader title={t("title")} hint={t("description")} />
          <div className="flex flex-1 flex-col gap-5 px-[1.125rem] pb-[1.125rem]">
            <div>
              <div className="data-label">{t("total")}</div>
              <div className="tnum text-[2rem] leading-tight font-extrabold">
                {total !== null ? money(total) : <Skeleton className="h-9 w-48" />}{" "}
                <span className="font-sans text-[0.9375rem] font-semibold text-subtle">{tc("birr")}</span>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <Tile
                icon={<Banknote className="size-5 text-gain" strokeWidth={1.8} />}
                label={t("cash")}
                primary={w ? `${money(w.etbCents)}` : null}
                unit={tc("birr")}
              />
              <Tile
                icon={<MetalIcon asset="XAU" className="size-5" />}
                label={tc("gold")}
                primary={w ? grams(w.xauMg) : null}
                unit="g"
                secondary={goldValue !== null ? `≈ ${money(goldValue)} ${tc("birr")}` : null}
              />
              <Tile
                icon={<MetalIcon asset="XPT" className="size-5" />}
                label={tc("platinum")}
                primary={w ? grams(w.xptMg) : null}
                unit="g"
                secondary={platValue !== null ? `≈ ${money(platValue)} ${tc("birr")}` : null}
              />
            </div>
            <div className="mt-auto grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Button asChild size="cta">
                <Link href="/deposit">
                  <ArrowDownToLine className="size-4" /> {t("deposit")}
                </Link>
              </Button>
              <Button asChild variant="outline" size="cta">
                <Link href="/withdraw">
                  <ArrowUpFromLine className="size-4" /> {t("withdraw")}
                </Link>
              </Button>
              <Button variant="outline" size="cta" onClick={() => open("XAU", "buy")}>
                {t("buy")}
              </Button>
              <Button variant="outline" size="cta" onClick={() => open("XAU", "sell")}>
                {t("sell")}
              </Button>
            </div>
          </div>
        </Panel>

        <Panel aria-label={t("pendingTitle")} className="lg:h-0 lg:min-h-full">
          <PanelHeader title={t("pendingTitle")} hint={w && w.pendingCount > 0 ? String(w.pendingCount) : undefined} />
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-border">
            {!w ? (
              <div className="p-4">
                <Skeleton className="h-24" />
              </div>
            ) : w.pending.length === 0 ? (
              <p className="flex h-full min-h-32 items-center justify-center px-6 text-center text-[0.8125rem] leading-relaxed text-muted-foreground">
                {t("pendingEmpty")}
              </p>
            ) : (
              w.pending.map((p) => {
                const Icon = p.kind === "withdrawal" ? ArrowUpFromLine : p.kind === "deposit" ? ArrowDownToLine : Truck;
                return (
                  <div key={`${p.kind}-${p.id}`} className="flex items-center gap-3 border-b border-border px-[1.125rem] py-3 last:border-0">
                    <Icon className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[0.875rem] font-semibold">{t(`kinds.${p.kind}` as never)}</div>
                      <div className="tnum text-[0.75rem] text-subtle">{eatStamp(p.createdAt)}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="tnum text-[0.875rem] font-semibold">
                        {p.amountCents !== null
                          ? `${money(p.amountCents)} ${tc("birr")}`
                          : p.gramsMg !== null
                            ? `${grams(p.gramsMg)} g`
                            : ""}
                      </span>
                      <Badge dot variant="platinum">
                        {t(`statuses.${p.status}` as never)}
                      </Badge>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Tile({
  icon,
  label,
  primary,
  unit,
  secondary,
}: {
  icon: React.ReactNode;
  label: string;
  primary: string | null;
  unit: string;
  secondary?: string | null;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-panel-2 p-3.5">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg bg-raised">{icon}</span>
        <span className="text-[0.8125rem] font-semibold text-muted-foreground">{label}</span>
      </div>
      <div className="tnum text-[1.25rem] font-bold">
        {primary ?? <Skeleton className="h-6 w-24" />} <span className="font-sans text-[0.75rem] text-subtle">{unit}</span>
      </div>
      {secondary && <div className="tnum text-[0.75rem] text-subtle">{secondary}</div>}
    </div>
  );
}
