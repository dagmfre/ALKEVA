"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { OrderListResponse } from "@alkeva/shared";

import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTradeSheet } from "@/components/trade/trade-sheet-context";
import { eatStamp, grams, money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

/**
 * Every receipt this account holds, by serial.
 *
 * Only settled orders appear here, because only settled orders have a serial —
 * the number is allocated at settle, so its presence is the answer to "is
 * there a receipt?" rather than a second flag that could disagree with the
 * ledger.
 *
 * The serial leads the row: it is what someone reads out on the phone when
 * they ask about a trade, so it is the column the eye lands on first.
 */
export function ReceiptsScreen() {
  const t = useTranslations("receipt");
  const tc = useTranslations("common");
  const th = useTranslations("history");
  const { revision } = useTradeSheet();
  const [query, setQuery] = useState("");
  const { data, loading } = useResource<OrderListResponse>("/orders?limit=50", { revision });

  const receipts = useMemo(
    () => (data?.orders ?? []).filter((o) => o.receiptSerial !== null),
    [data],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return receipts;
    return receipts.filter((o) => (o.receiptSerial ?? "").toLowerCase().includes(q));
  }, [receipts, query]);

  if (loading) {
    return (
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (receipts.length === 0) {
    return (
      <Panel className="mx-auto max-w-[36rem] p-5">
        <h2 className="text-[1.125rem] font-semibold">{t("emptyTitle")}</h2>
        <p className="mt-1 text-[0.9375rem] text-muted-foreground">{t("emptyBody")}</p>
      </Panel>
    );
  }

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title={t("title")}
        hint={t("countNote", { count: receipts.length })}
        action={
          <label className="well flex min-h-11 items-center gap-2.5 rounded-md px-3.5">
            <span aria-hidden="true" className="text-muted-foreground">
              ⌕
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchSerial")}
              aria-label={t("searchSerial")}
              className="font-latin w-[11rem] bg-transparent text-[0.9375rem] outline-none placeholder:text-muted-foreground"
            />
          </label>
        }
        className="border-b border-border"
      />

      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-4 py-10 text-center lg:px-5">
          <p className="text-[0.9375rem] text-muted-foreground">{t("noMatch")}</p>
          <Button variant="outline" size="sm" onClick={() => setQuery("")}>
            {t("clearSearch")}
          </Button>
        </div>
      ) : (
        <>
          <div className="hidden md:block">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead style={{ width: "16%" }}>{t("serialLabel")}</TableHead>
                  <TableHead style={{ width: "26%" }}>{th("colOrder")}</TableHead>
                  <TableHead className="text-end" style={{ width: "14%" }}>
                    {th("colAmount")}
                  </TableHead>
                  <TableHead className="text-end" style={{ width: "18%" }}>
                    {th("colValue")}
                  </TableHead>
                  <TableHead style={{ width: "26%" }}>{t("dateTime")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((o) => {
                  const metal = o.asset === "XAU" ? tc("gold") : tc("platinum");
                  return (
                    <TableRow key={o.id} className="cursor-pointer">
                      <TableCell className="tnum font-semibold">
                        <Link href={`/receipt/${o.id}`} className="hover:text-gold-400">
                          {o.receiptSerial}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2.5">
                          <span
                            aria-hidden="true"
                            className={cn(
                              "size-2 flex-none rounded-full",
                              o.asset === "XAU" ? "bg-gold-500" : "bg-platinum-400",
                            )}
                          />
                          {o.side === "buy"
                            ? th("buyLabel", { metal })
                            : th("sellLabel", { metal })}
                        </span>
                      </TableCell>
                      <TableCell className="tnum text-end text-muted-foreground">
                        {grams(o.gramsMg)} <span className="font-sans">{tc("g")}</span>
                      </TableCell>
                      <TableCell className="tnum text-end font-semibold">
                        {money(o.totalCents)}
                      </TableCell>
                      <TableCell className="font-latin text-[0.875rem] text-subtle">
                        {o.settledAt ? eatStamp(o.settledAt) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="md:hidden">
            {shown.map((o) => {
              const metal = o.asset === "XAU" ? tc("gold") : tc("platinum");
              return (
                <Link
                  key={o.id}
                  href={`/receipt/${o.id}`}
                  className="block border-b border-border px-4 py-3.5 last:border-0 active:bg-popover/60"
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="tnum font-semibold">{o.receiptSerial}</span>
                    <span className="tnum font-semibold">{money(o.totalCents)}</span>
                  </span>
                  <span className="mt-1.5 flex items-center justify-between gap-3 text-[0.875rem] text-muted-foreground">
                    <span className="flex items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-2 flex-none rounded-full",
                          o.asset === "XAU" ? "bg-gold-500" : "bg-platinum-400",
                        )}
                      />
                      {o.side === "buy" ? th("buyLabel", { metal }) : th("sellLabel", { metal })}
                    </span>
                    <span className="tnum">
                      {grams(o.gramsMg)} {tc("g")}
                    </span>
                  </span>
                  <span className="font-latin mt-1 block text-[0.8125rem] text-subtle">
                    {o.settledAt ? eatStamp(o.settledAt) : "—"}
                  </span>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </Panel>
  );
}
