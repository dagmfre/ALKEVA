"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { OrderListItem } from "@alkeva/shared";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KNOWN_ERRORS } from "@/components/trade/use-trade-form";
import { grams, money, timeOfDay } from "@/lib/format";
import { cn } from "@/lib/utils";

export type OrderGroup = { key: string; label?: string; orders: OrderListItem[] };

/**
 * Every list of orders in the product — History, the dashboard's recent
 * activity, the trade workspace's recent orders — renders through here.
 *
 * Two compositions, chosen by CSS so nothing depends on a JS breakpoint: a real
 * table with headers from `md` up, a two-line block below it. They carry the
 * same figures; the phone never gets an abridged truth.
 *
 * The refusal reason lives inside the first cell, under the order label. It
 * used to be a `w-full` span inside a flex row, which claimed the entire row
 * width at every breakpoint and squeezed "Buy Gold" into two cramped lines —
 * the clutter this component was rebuilt to end.
 */
export function OrdersTable({
  groups,
  showSerial = false,
  showReceipt = true,
  className,
}: {
  groups: OrderGroup[];
  showSerial?: boolean;
  showReceipt?: boolean;
  className?: string;
}) {
  const t = useTranslations("history");

  return (
    <>
      {/* ≥md: aligned columns. Money under money, status under status. */}
      <div className={cn("hidden md:block", className)}>
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead style={{ width: showSerial ? "26%" : "30%" }}>{t("colOrder")}</TableHead>
              {showSerial && <TableHead style={{ width: "12%" }}>{t("colSerial")}</TableHead>}
              <TableHead className="text-end" style={{ width: "13%" }}>
                {t("colAmount")}
              </TableHead>
              <TableHead className="text-end" style={{ width: "16%" }}>
                {t("colValue")}
              </TableHead>
              <TableHead style={{ width: "17%" }}>{t("colStatus")}</TableHead>
              <TableHead
                className={cn(!showReceipt && "text-end")}
                style={{ width: showReceipt ? "11%" : "21%" }}
              >
                {t("colWhen")}
              </TableHead>
              {showReceipt && <TableHead style={{ width: "10%" }} className="text-end" />}
            </TableRow>
          </TableHeader>
          {groups.map((group) => (
            <TableBody key={group.key} className="border-b border-border last:border-0">
              {group.label && (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={5 + (showSerial ? 1 : 0) + (showReceipt ? 1 : 0)}
                    className="bg-well/60 py-2 text-[0.875rem] text-muted-foreground"
                  >
                    {group.label}
                  </TableCell>
                </TableRow>
              )}
              {group.orders.map((o) => (
                <Row
                  key={o.id}
                  order={o}
                  showSerial={showSerial}
                  showReceipt={showReceipt}
                />
              ))}
            </TableBody>
          ))}
        </Table>
      </div>

      {/* Phone: one block per order, still with every figure. */}
      <div className={cn("md:hidden", className)}>
        {groups.map((group) => (
          <div key={group.key}>
            {group.label && (
              <p className="border-b border-border bg-well/60 px-4 py-2 text-[0.875rem] text-muted-foreground">
                {group.label}
              </p>
            )}
            {group.orders.map((o) => (
              <Block key={o.id} order={o} />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

function useOrderCopy(o: OrderListItem) {
  const t = useTranslations("history");
  const tc = useTranslations("common");
  const tt = useTranslations("trade");
  const locale = useLocale();

  const metal = o.asset === "XAU" ? tc("gold") : tc("platinum");
  return {
    label: o.side === "buy" ? t("buyLabel", { metal }) : t("sellLabel", { metal }),
    reason:
      o.failureReason && KNOWN_ERRORS.has(o.failureReason)
        ? tt(`errors.${o.failureReason}` as never)
        : null,
    when: timeOfDay(o.createdAt, locale),
    unit: tc("g"),
  };
}

function Row({
  order: o,
  showSerial,
  showReceipt,
}: {
  order: OrderListItem;
  showSerial: boolean;
  showReceipt: boolean;
}) {
  const t = useTranslations("history");
  const { label, reason, when, unit } = useOrderCopy(o);

  return (
    <TableRow className="align-top">
      <TableCell className="py-3.5">
        <span className="flex items-start gap-2.5">
          <span
            aria-hidden="true"
            className={cn(
              "mt-2 size-2 flex-none rounded-full",
              o.asset === "XAU" ? "bg-gold-500" : "bg-platinum-400",
            )}
          />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{label}</span>
            {reason && (
              <span className="text-[0.875rem] leading-snug text-muted-foreground">
                {reason}
              </span>
            )}
          </span>
        </span>
      </TableCell>

      {showSerial && (
        <TableCell className="font-latin py-3.5 text-[0.875rem] text-muted-foreground">
          {o.receiptSerial ?? "—"}
        </TableCell>
      )}

      <TableCell className="tnum py-3.5 text-end text-muted-foreground">
        {grams(o.gramsMg)} <span className="font-sans">{unit}</span>
      </TableCell>

      <TableCell
        className={cn(
          "tnum py-3.5 text-end font-semibold",
          o.status === "rejected" && "text-subtle",
        )}
      >
        {money(o.totalCents)}
      </TableCell>

      <TableCell className="py-3.5 pe-1">
        <StatusBadge status={o.status} />
      </TableCell>

      <TableCell
        className={cn(
          "font-latin whitespace-nowrap py-3.5 text-[0.875rem] text-subtle",
          !showReceipt && "text-end",
        )}
      >
        {when}
      </TableCell>

      {showReceipt && (
        <TableCell className="py-3.5 text-end">
          {o.status === "settled" && (
            <Link
              href={`/receipt/${o.id}`}
              className="text-[0.9375rem] text-gold-400 hover:text-gold-300"
            >
              {t("receiptLink")}
            </Link>
          )}
        </TableCell>
      )}
    </TableRow>
  );
}

function Block({ order: o }: { order: OrderListItem }) {
  const t = useTranslations("history");
  const { label, reason, when, unit } = useOrderCopy(o);

  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5 font-medium">
          <span
            aria-hidden="true"
            className={cn(
              "size-2 flex-none rounded-full",
              o.asset === "XAU" ? "bg-gold-500" : "bg-platinum-400",
            )}
          />
          <span className="truncate">{label}</span>
        </span>
        <span
          className={cn(
            "tnum flex-none font-semibold",
            o.status === "rejected" && "text-subtle",
          )}
        >
          {money(o.totalCents)}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <StatusBadge status={o.status} />
        <span className="tnum text-[0.875rem] text-muted-foreground">
          {grams(o.gramsMg)} <span className="font-sans">{unit}</span>
        </span>
        <span className="font-latin ms-auto text-[0.8125rem] text-subtle">{when}</span>
      </div>
      {reason && (
        <p className="mt-1.5 text-[0.875rem] leading-snug text-muted-foreground">{reason}</p>
      )}
      {o.status === "settled" && (
        <span className="mt-1.5 block text-[0.9375rem] text-gold-400">
          {t("receiptLink")} →
        </span>
      )}
    </>
  );

  const cls = "block border-b border-border px-4 py-3.5 last:border-0";
  return o.status === "settled" ? (
    <Link href={`/receipt/${o.id}`} className={cn(cls, "transition-colors active:bg-popover/60")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function StatusBadge({ status }: { status: OrderListItem["status"] }) {
  const t = useTranslations("history");
  if (status === "settled") return <Badge variant="gain">✓ {t("settled")}</Badge>;
  if (status === "review") return <Badge variant="platinum">◑ {t("review")}</Badge>;
  if (status === "rejected") return <Badge variant="loss">✕ {t("rejected")}</Badge>;
  return <Badge variant="muted">{t("created")}</Badge>;
}
