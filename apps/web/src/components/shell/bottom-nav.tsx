"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { NavIcon } from "@/components/shell/nav-items";
import { useTradeSheet } from "@/components/trade/trade-sheet-context";
import { cn } from "@/lib/utils";

const itemClass =
  "flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[0.9375rem] leading-tight transition-colors";

/**
 * The phone tab bar (<1024px). Above that the rail replaces it entirely.
 *
 * Trade opens a sheet rather than navigating: the price or holding that
 * prompted the trade has to stay visible behind it. On desktop the same state
 * machine gets a full route instead (`/trade`), because there is room for the
 * chart beside the ticket.
 */
export function BottomNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const { open } = useTradeSheet();

  const links = [
    { key: "portfolio", href: "/portfolio", label: t("portfolio") },
    { key: "history", href: "/history", label: t("history") },
    { key: "account", href: "/account", label: t("account") },
  ] as const;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 flex items-stretch border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label={t("home")}
      data-print="hide"
    >
      <Link
        href="/"
        className={cn(
          itemClass,
          pathname === "/" ? "text-gold-400" : "text-subtle hover:text-muted-foreground",
        )}
        aria-current={pathname === "/" ? "page" : undefined}
      >
        <NavIcon name="home" size={20} />
        {t("home")}
      </Link>

      <button
        type="button"
        onClick={() => open()}
        className={cn(itemClass, "text-subtle hover:text-muted-foreground")}
      >
        <NavIcon name="trade" size={20} />
        {t("trade")}
      </button>

      {links.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              itemClass,
              active ? "text-gold-400" : "text-subtle hover:text-muted-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            <NavIcon name={l.key} size={20} />
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
