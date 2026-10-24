"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Search } from "lucide-react";
import type { OrderListResponse, ReceiptResponse } from "@alkeva/shared";

import { ReceiptDocument } from "@/components/receipt/receipt-screen";
import { Button } from "@/components/ui/button";
import { Coin, Panel, PanelHeader, Stat, StatStrip } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useTradeSheet } from "@/components/trade/trade-sheet-context";
import { displaySerial, eatStamp, grams, money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

/**
 * Every receipt this account holds, by serial — a list beside the document.
 *
 * Only settled orders appear, because only settled orders have a serial: the
 * number is allocated at settle, so its presence IS the answer to "is there a
 * receipt?". On a desk the selected receipt renders beside the list, so
 * finding one is reading it; on a phone each row opens the receipt page.
 */
export function ReceiptsScreen() {
  const t = useTranslations("receipt");
  const tc = useTranslations("common");
  const th = useTranslations("history");
  const { revision } = useTradeSheet();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const { data, loading } = useResource<OrderListResponse>("/orders?limit=50", { revision });

  const receipts = useMemo(
    () =>
      (data?.orders ?? [])
        .filter((o) => o.receiptSerial !== null)
        .map((o) => ({ ...o, serial: displaySerial(o.receiptSerial!, o.settledAt) })),
    [data],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return receipts;
    return receipts.filter((o) => o.serial.toLowerCase().includes(q) || o.receiptSerial === q);
  }, [receipts, query]);

  const selectedId = picked ?? shown[0]?.id ?? null;
  const settledBuys = receipts.filter((o) => o.side === "buy").reduce((s, o) => s + BigInt(o.totalCents), 0n);
  const settledSells = receipts.filter((o) => o.side === "sell").reduce((s, o) => s + BigInt(o.totalCents), 0n);

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-[4.5rem] rounded-lg" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  if (receipts.length === 0) {
    return (
      <Panel className="flex-1 items-center justify-center gap-2 p-8 text-center">
        <h2 className="text-[1.125rem] font-bold">{t("emptyTitle")}</h2>
        <p className="max-w-sm text-[0.875rem] text-muted-foreground">{t("emptyBody")}</p>
      </Panel>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      <section data-panel="" aria-label={t("title")} className="overflow-hidden rounded-lg border border-border bg-card">
        <StatStrip className="lg:[&>*]:flex-auto">
          <Stat surface="strip" size="lg" label={t("statCount")} value={String(receipts.length)} />
          <Stat surface="strip" size="lg" label={t("statLatest")} value={receipts[0]?.serial ?? "—"} tone="gold" />
          <Stat surface="strip" size="lg" label={t("statBuys")} value={money(settledBuys)} unit={tc("birr")} />
          <Stat surface="strip" size="lg" label={t("statSells")} value={money(settledSells)} unit={tc("birr")} />
        </StatStrip>
      </section>

      <div className="grid flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,42rem)]">
        {/* h-0 + min-h-full: the list takes the preview's height and scrolls,
            so a long list never stretches the row and a short one never leaves
            a hole beside the document. */}
        <Panel aria-label={t("title")} className="lg:h-0 lg:min-h-full">
          <PanelHeader
            title={t("title")}
            hint={t("countNote", { count: receipts.length })}
            action={
              <label className="flex h-9 items-center gap-2 rounded-[0.5625rem] border border-border bg-panel-2 px-3 transition-colors focus-within:border-gold-500">
                <Search className="size-4 text-subtle" aria-hidden="true" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("searchSerial")}
                  aria-label={t("searchSerial")}
                  className="tnum w-[10rem] bg-transparent text-[0.8125rem] outline-none placeholder:text-subtle"
                />
              </label>
            }
          />
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto border-t border-border">
            {shown.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                <p className="text-[0.875rem] text-muted-foreground">{t("noMatch")}</p>
                <Button variant="outline" size="sm" onClick={() => setQuery("")}>
                  {t("clearSearch")}
                </Button>
              </div>
            ) : (
              shown.map((o) => {
                const metal = o.asset === "XAU" ? tc("gold") : tc("platinum");
                const active = o.id === selectedId;
                const row = (
                  <>
                    <Coin metal={o.asset} size="lg" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="tnum text-[0.875rem] font-semibold text-gold-300">{o.serial}</span>
                      <span className="truncate text-[0.75rem] text-muted-foreground">
                        {o.side === "buy" ? th("buyLabel", { metal }) : th("sellLabel", { metal })} ·{" "}
                        <span className="tnum">
                          {grams(o.gramsMg)} {tc("g")}
                        </span>
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-0.5">
                      <span className="tnum text-[0.875rem] font-semibold">{money(o.totalCents)}</span>
                      <span className="tnum text-[0.6875rem] text-subtle">
                        {o.settledAt ? eatStamp(o.settledAt) : "—"}
                      </span>
                    </span>
                  </>
                );
                const cls = cn(
                  "relative flex w-full items-center gap-3 border-b border-border px-[1.125rem] py-3 text-start transition-colors last:border-b-0",
                  active ? "bg-white/[0.035]" : "hover:bg-white/[0.02]",
                );
                return (
                  <div key={o.id}>
                    {/* Desk: select into the preview. Phone: open the receipt. */}
                    <button
                      type="button"
                      onClick={() => setPicked(o.id)}
                      aria-pressed={active}
                      className={cn(cls, "hidden lg:flex")}
                    >
                      {active && (
                        <span aria-hidden="true" className="absolute inset-y-2 start-0 w-0.5 rounded-e-full bg-gold-400" />
                      )}
                      {row}
                    </button>
                    <Link href={`/receipt/${o.id}`} className={cn(cls, "lg:hidden")}>
                      {row}
                    </Link>
                  </div>
                );
              })
            )}
            <p className="mt-auto border-t border-border px-[1.125rem] py-3.5 text-[0.75rem] leading-relaxed text-subtle">
              {t("listNote")}
            </p>
          </div>
        </Panel>

        <div className="hidden min-w-0 flex-col lg:flex">
          {selectedId && <Preview orderId={selectedId} />}
        </div>
      </div>
    </div>
  );
}

function Preview({ orderId }: { orderId: string }) {
  const t = useTranslations("receipt");
  const { data, loading } = useResource<ReceiptResponse>(`/orders/${orderId}/receipt`);
  if (loading || !data) return <Skeleton className="h-[34rem] rounded-xl" />;
  return (
    <div className="relative">
      <ReceiptDocument data={data} />
      <Button variant="ghost" size="sm" className="absolute end-3 bottom-3" asChild>
        <Link href={`/receipt/${orderId}`}>
          {t("openFull")}
          <ArrowUpRight />
        </Link>
      </Button>
    </div>
  );
}
