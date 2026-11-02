"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowDownToLine, ArrowUpFromLine, Banknote, Eye, EyeOff, Truck, Wallet } from "lucide-react";
import type { MetalAsset, WalletPendingItem, WalletResponse } from "@alkeva/shared";

import { useAssetPrice } from "@/components/market/price-provider";
import { useAppData } from "@/components/shell/app-data";
import { useTradeSheet } from "@/components/trade/trade-sheet-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { eatStamp, grams, money } from "@/lib/format";
import { cn } from "@/lib/utils";

const HIDE_KEY = "alkeva.hideBalances";

/** Per-viewer convenience only: hide figures on a shared screen. */
function useHideBalances(): [boolean, () => void] {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(HIDE_KEY) === "1");
    } catch {
      /* storage unavailable — show balances */
    }
  }, []);
  const toggle = () =>
    setHidden((h) => {
      try {
        localStorage.setItem(HIDE_KEY, h ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !h;
    });
  return [hidden, toggle];
}

/** Gold bar / platinum bar glyphs: same shape, told apart by tone AND label. */
export function MetalIcon({ asset, className }: { asset: MetalAsset; className?: string }) {
  const tone = asset === "XAU" ? "var(--gold-400)" : "var(--platinum-400)";
  return (
    <svg viewBox="0 0 24 24" className={cn("size-4", className)} aria-hidden="true">
      <path d="M6 9h12l3 8H3Z" fill={tone} fillOpacity={0.25} stroke={tone} strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M8 9l1.2-3h5.6L16 9" fill="none" stroke={tone} strokeWidth={1.4} strokeLinejoin="round" />
      {asset === "XPT" && <path d="M9 13h6" stroke={tone} strokeWidth={1.4} strokeLinecap="round" />}
    </svg>
  );
}

const mask = "••••";

/**
 * The wallet as a shopping-cart: always in the header, figures at a glance —
 * birr, gold, platinum, each with its own icon — and a badge counting what is
 * still in flight (withdrawals, deposits, deliveries). Opens a drawer with the
 * live value of each holding and the money actions.
 */
export function WalletButton({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("wallet");
  const { wallet } = useAppData();
  const [open, setOpen] = useState(false);
  const [hidden, toggleHidden] = useHideBalances();
  const w = wallet.data;
  const pending = w?.pendingCount ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("open", { count: pending })}
        className={cn(
          "relative flex h-9 items-center gap-1 rounded-[0.5625rem] border border-border bg-panel-2 px-1.5 outline-none transition-colors hover:border-input hover:bg-raised focus-visible:outline-2 focus-visible:outline-ring",
          compact && "size-9 justify-center px-0",
        )}
      >
        {compact ? (
          <Wallet className="size-[18px] text-foreground" strokeWidth={1.8} aria-hidden="true" />
        ) : (
          <>
            <Segment icon={<Banknote className="size-4 text-gain" strokeWidth={1.8} aria-hidden="true" />}>
              {w ? (hidden ? mask : money(w.etbCents).replace(/\.\d+$/, "")) : "—"}
            </Segment>
            <span className="h-4 w-px bg-border" aria-hidden="true" />
            <Segment icon={<MetalIcon asset="XAU" />}>{w ? (hidden ? mask : `${grams(w.xauMg)} g`) : "—"}</Segment>
            <span className="hidden h-4 w-px bg-border xl:block" aria-hidden="true" />
            <Segment icon={<MetalIcon asset="XPT" />} className="hidden xl:flex">
              {w ? (hidden ? mask : `${grams(w.xptMg)} g`) : "—"}
            </Segment>
          </>
        )}
        {pending > 0 && (
          <span className="tnum absolute -end-1.5 -top-1.5 grid min-w-4.5 place-items-center rounded-full bg-gold-400 px-1 text-[0.625rem] leading-4.5 font-bold text-primary-foreground ring-2 ring-bg-deep">
            {pending}
          </span>
        )}
      </button>
      <WalletDrawer open={open} onOpenChange={setOpen} wallet={w} hidden={hidden} toggleHidden={toggleHidden} side={compact ? "bottom" : "right"} />
    </>
  );
}

function Segment({ icon, children, className }: { icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("tnum flex items-center gap-1.5 px-1.5 text-[0.8125rem] font-semibold whitespace-nowrap", className)}>
      {icon}
      {children}
    </span>
  );
}

function WalletDrawer({
  open,
  onOpenChange,
  wallet,
  hidden,
  toggleHidden,
  side,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  wallet: WalletResponse | null;
  hidden: boolean;
  toggleHidden: () => void;
  side: "right" | "bottom";
}) {
  const t = useTranslations("wallet");
  const tc = useTranslations("common");
  const gold = useAssetPrice("XAU");
  const plat = useAssetPrice("XPT");
  const { open: openTrade } = useTradeSheet();

  const value = (mg: string, unit: string | undefined) =>
    unit ? (BigInt(unit) * BigInt(mg)) / 1000n : null;
  const goldValue = wallet ? value(wallet.xauMg, gold?.etbCentsPerGram) : null;
  const platValue = wallet ? value(wallet.xptMg, plat?.etbCentsPerGram) : null;
  const total =
    wallet && goldValue !== null && platValue !== null ? BigInt(wallet.etbCents) + goldValue + platValue : null;
  const show = (v: string) => (hidden ? mask : v);
  const close = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={side} className={cn("gap-0 p-0", side === "right" && "w-full sm:max-w-[26rem]")}>
        <SheetHeader className="border-b border-border pe-14">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle>{t("title")}</SheetTitle>
            <button
              type="button"
              onClick={toggleHidden}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[0.75rem] text-muted-foreground hover:bg-white/5 hover:text-foreground"
            >
              {hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
              {hidden ? t("show") : t("hide")}
            </button>
          </div>
          <SheetDescription className="sr-only">{t("description")}</SheetDescription>
          <div className="mt-2">
            <div className="data-label">{t("total")}</div>
            <div className="tnum text-[1.75rem] leading-tight font-extrabold">
              {total !== null ? show(money(total)) : <Skeleton className="h-8 w-40" />}{" "}
              <span className="font-sans text-[0.875rem] font-semibold text-subtle">{tc("birr")}</span>
            </div>
          </div>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-panel-2">
            <Holding
              icon={<Banknote className="size-5 text-gain" strokeWidth={1.8} />}
              label={t("cash")}
              primary={wallet ? show(`${money(wallet.etbCents)} ${tc("birr")}`) : null}
            />
            <Holding
              icon={<MetalIcon asset="XAU" className="size-5" />}
              label={tc("gold")}
              primary={wallet ? show(`${grams(wallet.xauMg)} g`) : null}
              secondary={goldValue !== null ? show(`≈ ${money(goldValue)} ${tc("birr")}`) : null}
            />
            <Holding
              icon={<MetalIcon asset="XPT" className="size-5" />}
              label={tc("platinum")}
              primary={wallet ? show(`${grams(wallet.xptMg)} g`) : null}
              secondary={platValue !== null ? show(`≈ ${money(platValue)} ${tc("birr")}`) : null}
            />
          </ul>

          <div className="grid grid-cols-2 gap-2">
            <Button asChild size="cta" onClick={close}>
              <Link href="/deposit">
                <ArrowDownToLine className="size-4" /> {t("deposit")}
              </Link>
            </Button>
            <Button asChild variant="outline" size="cta" onClick={close}>
              <Link href="/withdraw">
                <ArrowUpFromLine className="size-4" /> {t("withdraw")}
              </Link>
            </Button>
            <Button variant="outline" onClick={() => { close(); openTrade("XAU", "buy"); }}>
              {t("buy")}
            </Button>
            <Button variant="outline" onClick={() => { close(); openTrade("XAU", "sell"); }}>
              {t("sell")}
            </Button>
          </div>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="data-label">{t("pendingTitle")}</span>
              {wallet && wallet.pendingCount > 0 && <span className="tnum text-[0.75rem] text-subtle">{wallet.pendingCount}</span>}
            </div>
            {!wallet ? (
              <Skeleton className="h-16" />
            ) : wallet.pending.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-[0.8125rem] text-muted-foreground">
                {t("pendingEmpty")}
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {wallet.pending.map((p) => (
                  <PendingRow key={`${p.kind}-${p.id}`} item={p} hidden={hidden} />
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="border-t border-border p-4">
          <Link href="/wallet" onClick={close} className="block text-center text-[0.8125rem] font-semibold text-gold-400 hover:text-gold-300">
            {t("fullWallet")} →
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Holding({
  icon,
  label,
  primary,
  secondary,
}: {
  icon: React.ReactNode;
  label: string;
  primary: string | null;
  secondary?: string | null;
}) {
  return (
    <li className="flex items-center gap-3 px-3.5 py-3">
      <span className="grid size-9 flex-none place-items-center rounded-lg bg-raised">{icon}</span>
      <span className="flex-1 text-[0.875rem] font-semibold">{label}</span>
      <span className="flex flex-col items-end">
        <span className="tnum text-[0.9375rem] font-bold">{primary ?? <Skeleton className="h-4 w-20" />}</span>
        {secondary && <span className="tnum text-[0.75rem] text-subtle">{secondary}</span>}
      </span>
    </li>
  );
}

function PendingRow({ item, hidden }: { item: WalletPendingItem; hidden: boolean }) {
  const t = useTranslations("wallet");
  const tc = useTranslations("common");
  const Icon = item.kind === "withdrawal" ? ArrowUpFromLine : item.kind === "deposit" ? ArrowDownToLine : Truck;
  const figure =
    item.amountCents !== null
      ? `${money(item.amountCents)} ${tc("birr")}`
      : item.gramsMg !== null
        ? `${grams(item.gramsMg)} g ${item.asset === "XPT" ? tc("platinum") : tc("gold")}`
        : "";
  return (
    <li className="flex items-center gap-3 px-3.5 py-2.5">
      <Icon className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[0.8125rem] font-semibold">{t(`kinds.${item.kind}` as never)}</div>
        <div className="tnum text-[0.6875rem] text-subtle">{eatStamp(item.createdAt)}</div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="tnum text-[0.8125rem] font-semibold">{hidden ? mask : figure}</span>
        <Badge variant="platinum" className="text-[0.625rem]">
          {t(`statuses.${item.status}` as never)}
        </Badge>
      </div>
    </li>
  );
}
