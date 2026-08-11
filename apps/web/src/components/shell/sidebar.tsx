"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { PortfolioResponse } from "@alkeva/shared";

import { Mark } from "@/components/brand/mark";
import { NavIcon, TierMark, useNavItems, type NavItem } from "@/components/shell/nav-items";
import { Skeleton } from "@/components/ui/skeleton";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

/**
 * The desktop rail (≥1024px).
 *
 * Two labelled sections rather than a flat list — the market you watch and the
 * account you own are different kinds of destination. The active item is the
 * only gold thing here: raised surface plus a gold-600 rim and gold-400 text,
 * so "where am I" is answered by the same colour that means "asset / action"
 * everywhere else. The tier chip is pinned to the foot, where a status badge
 * belongs, and it is never gold-filled — that colour is spoken for.
 */
export function Sidebar() {
  const t = useTranslations("nav");
  const tt = useTranslations("tier");
  const { market, account } = useNavItems();
  const portfolio = useResource<PortfolioResponse>("/portfolio");

  const tierName = portfolio.data?.tier.name ?? null;
  const localizedTier =
    tierName && tt.has(`names.${tierName}` as never) ? tt(`names.${tierName}` as never) : tierName;
  const band = portfolio.data?.tier.bandMaxUsd;

  return (
    <aside className="hidden w-[248px] flex-none flex-col gap-5 border-e border-border px-3.5 pb-4 pt-5 lg:flex">
      <Link href="/" className="flex items-center gap-2.5 px-2">
        <Mark size={28} />
        <span className="flex flex-col leading-[1.15]">
          <span className="font-latin text-[1.0625rem] font-semibold tracking-[0.02em]">ALKEVA</span>
          <span className="font-latin text-[0.6875rem] tracking-[0.08em] text-subtle">
            XAU · XPT
          </span>
        </span>
      </Link>

      <nav className="flex flex-col gap-1" aria-label={t("home")}>
        <SectionLabel>{t("sectionMarket")}</SectionLabel>
        {market.map((item) => (
          <NavLink key={item.key} item={item} />
        ))}
        <SectionLabel className="pt-3.5">{t("sectionAccount")}</SectionLabel>
        {account.map((item) => (
          <NavLink key={item.key} item={item} />
        ))}
      </nav>

      <div className="mt-auto flex items-center gap-2.5 rounded-md border border-border bg-card px-3 py-3">
        <TierMark />
        {localizedTier ? (
          <span className="flex flex-col">
            <span className="text-[0.9375rem] font-semibold leading-normal">{localizedTier}</span>
            <span className="font-latin text-xs text-muted-foreground">
              {band === null ? tt("topBand") : band ? `< $${band.toLocaleString("en-US")}` : "—"}
            </span>
          </span>
        ) : (
          <Skeleton className="h-8 w-28" />
        )}
      </div>
    </aside>
  );
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("px-3 pb-1 text-[0.9375rem] text-subtle", className)}>{children}</span>
  );
}

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active =
    item.href === "/"
      ? pathname === "/"
      : pathname === item.href ||
        pathname.startsWith(`${item.href}/`) ||
        // A receipt is reached from History but belongs to Receipts.
        (item.key === "receipts" && pathname.startsWith("/receipt/"));

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-[46px] items-center gap-3 rounded-md px-3 text-base transition-colors",
        active
          ? "pill-active font-semibold"
          : "text-muted-foreground hover:bg-card hover:text-foreground",
      )}
    >
      <NavIcon name={item.key} />
      {item.label}
    </Link>
  );
}
