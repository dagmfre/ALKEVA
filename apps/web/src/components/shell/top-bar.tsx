"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { BalancesResponse, MeResponse, MetalAsset } from "@alkeva/shared";

import { Mark } from "@/components/brand/mark";
import { useAssetPrice, usePrices } from "@/components/market/price-provider";
import { AssistantLink, NotificationsBell } from "@/components/shell/header-actions";
import { LocaleToggle } from "@/components/shell/locale-toggle";
import { usePageTitle } from "@/components/shell/page-title";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { eatStamp, money, pctMilli } from "@/lib/format";
import { api } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { useTradeSheet } from "@/components/trade/trade-sheet-context";
import { cn } from "@/lib/utils";

/**
 * The global header (≥1024px) — the Tradeo terminal composition: a full-width
 * ~80px bar with the brand block aligned over the sidebar, a market metrics
 * strip in the middle, and the utility cluster on the right.
 *
 * The ticker is the reason this bar exists — on a trading desk the price is
 * never more than one glance away, on every screen. Both metals and their real
 * 24-hour change are derived from stored ticks, so a quiet day shows a small
 * number rather than a decorative one.
 */
export function TopBar() {
  const tc = useTranslations("common");
  const title = usePageTitle();
  const { revision } = useTradeSheet();

  const balances = useResource<BalancesResponse>("/ledger/balances", { revision });
  const me = useResource<MeResponse>("/auth/me");

  return (
    <header className="hidden min-h-[80px] items-stretch border-b border-border lg:flex">
      {/* Brand block — same width and end-border as the sidebar beneath it. */}
      <Link
        href="/"
        className="flex w-[240px] flex-none items-center gap-2.5 border-e border-border px-5"
      >
        <Mark size={28} />
        <span className="flex flex-col leading-[1.15]">
          <span className="font-latin text-[1.0625rem] font-semibold tracking-[0.02em]">
            ALKEVA
          </span>
          <span className="font-latin text-[0.6875rem] tracking-[0.08em] text-subtle">
            XAU · XPT
          </span>
        </span>
      </Link>

      <div className="flex min-w-0 flex-1 items-center gap-6 px-7">
        <span className="flex flex-col">
          <span className="text-lg font-semibold leading-[1.4]">{title}</span>
          <Clock />
        </span>

        <span className="h-9 w-px bg-border" aria-hidden="true" />

        {/* Market metrics strip — icon/label/value groups on one baseline. */}
        <Ticker asset="XAU" label={tc("gold")} />
        <Ticker asset="XPT" label={tc("platinum")} />
        <LiveDot />

        <span className="ms-auto flex items-center gap-2.5">
          <AssistantLink />
          <NotificationsBell />
          <LocaleToggle />
          <span className="inline-flex min-h-10 items-center gap-2.5 rounded-full border border-input px-3.5 text-[0.9375rem]">
            <span className="text-muted-foreground">{tc("birr")}</span>
            {balances.data ? (
              <span className="tnum font-semibold">{money(balances.data.etbCents)}</span>
            ) : (
              <Skeleton className="h-4 w-20" />
            )}
          </span>
          <UserMenu me={me.data ?? null} />
        </span>
      </div>
    </header>
  );
}

/**
 * The user pill is a menu, not a decoration: Account, the staff console when
 * this identity holds a staff role (the API's RolesGuard stays the real
 * boundary — this is a door, not a lock), and the desktop's sign-out, which
 * previously existed only on the Account page.
 */
function UserMenu({ me }: { me: MeResponse | null }) {
  const tn = useTranslations("nav");
  const tc = useTranslations("common");
  const router = useRouter();

  const isStaff =
    me?.role === "administrator" || me?.role === "compliance" || me?.role === "finance";

  async function signOut() {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex min-h-10 items-center gap-2.5 rounded-full border border-border py-1 pe-3 ps-1 outline-none transition-colors hover:border-input data-[state=open]:border-gold-500">
        <span className="grid size-8 place-items-center rounded-full border border-input bg-popover text-[0.9375rem] font-semibold">
          {me?.fullName?.trim().charAt(0) ?? "·"}
        </span>
        <span className="max-w-[9rem] truncate text-[0.9375rem]">{me?.fullName ?? ""}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[13rem]">
        {me && (
          <>
            <DropdownMenuLabel className="max-w-[16rem] truncate">{me.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={() => router.push("/account")}>
          {tn("account")}
        </DropdownMenuItem>
        {isStaff && (
          <DropdownMenuItem onSelect={() => router.push("/admin")}>
            {tn("adminConsole")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void signOut()}>
          {tc("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Rendered only after mount: the server has no viewer clock, and stamping one
 * during SSR is a hydration mismatch waiting to happen. Ticks each minute.
 */
function Clock() {
  const [now, setNow] = useState<string | null>(null);

  useEffect(() => {
    const write = () => setNow(eatStamp(new Date()));
    write();
    const id = setInterval(write, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="font-latin whitespace-nowrap text-[0.71875rem] text-subtle">
      {now ?? " "}
    </span>
  );
}

/**
 * The live-feed indicator — the one sanctioned outer glow in the system
 * (`.glow-gold`, live indicators only). Gold while the shared price store is
 * fresh; flat and muted once the staleness ratchet trips.
 */
function LiveDot() {
  const tc = useTranslations("common");
  const { anyStale } = usePrices();

  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className={cn(
          "size-2 rounded-full",
          anyStale ? "bg-subtle" : "glow-gold bg-gold-500",
        )}
      />
      <span className="text-[0.8125rem] text-subtle">
        {anyStale ? tc("delayed") : tc("live")}
      </span>
    </span>
  );
}

function Ticker({ asset, label }: { asset: MetalAsset; label: string }) {
  const tc = useTranslations("common");
  // The shared store: this is the identical latest tick every other surface
  // renders — never a bucket average, never an out-of-phase poll.
  const price = useAssetPrice(asset);
  const milli = price?.change24hPctMilli ?? null;
  const pct = pctMilli(milli);
  const up = milli !== null && BigInt(milli) > 0n;
  const down = milli !== null && BigInt(milli) < 0n;

  return (
    <span className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className={cn(
          "size-2.5 flex-none rounded-full",
          asset === "XAU" ? "bg-gold-500" : "bg-platinum-400",
        )}
      />
      <span className="flex flex-col gap-px">
        <span className="text-[0.8125rem] leading-normal text-muted-foreground">
          {label} · {tc("perGram")}
        </span>
        {price ? (
          <span className="flex items-baseline gap-2">
            <span className="tnum text-base font-semibold">{money(price.etbCentsPerGram)}</span>
            {pct && (
              <span
                className={cn(
                  "tnum text-[0.8125rem] font-semibold",
                  up ? "text-gain" : down ? "text-loss" : "text-muted-foreground",
                )}
              >
                {up ? "↑" : down ? "↓" : "·"} {up ? "+" : down ? "−" : ""}{pct}%
              </span>
            )}
          </span>
        ) : (
          <Skeleton className="h-5 w-28" />
        )}
      </span>
    </span>
  );
}
