"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { useTradeSheet } from "@/components/trade/trade-sheet-context";

function IconHome() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
    </svg>
  );
}
function IconTrade() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 8h13l-3.5-3.5" />
      <path d="M20 16H7l3.5 3.5" />
    </svg>
  );
}
function IconPortfolio() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M3.5 10h17" />
    </svg>
  );
}
function IconHistory() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 6.5h16M4 12h16M4 17.5h10" />
    </svg>
  );
}
function IconAccount() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="9" r="3.4" />
      <path d="M5.5 20c1.2-3.4 3.6-5 6.5-5s5.3 1.6 6.5 5" />
    </svg>
  );
}

const itemClass =
  "flex flex-1 flex-col items-center justify-center gap-[3px] text-[0.8125rem] leading-tight transition-colors";

export function BottomNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const { open } = useTradeSheet();

  const links = [
    { href: "/", label: t("home"), icon: <IconHome /> },
    { href: "/portfolio", label: t("portfolio"), icon: <IconPortfolio /> },
    { href: "/history", label: t("history"), icon: <IconHistory /> },
    { href: "/account", label: t("account"), icon: <IconAccount /> },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-[480px] items-stretch border-t border-border bg-card pb-[env(safe-area-inset-bottom)]"
      aria-label={t("home")}
    >
      <Link
        href="/"
        className={cn(
          itemClass,
          "min-h-16",
          pathname === "/" ? "text-gold-400" : "text-subtle hover:text-muted-foreground",
        )}
        aria-current={pathname === "/" ? "page" : undefined}
      >
        <IconHome />
        {t("home")}
      </Link>

      {/*
        Trade opens a sheet rather than navigating: the price or holding that
        prompted the trade has to stay visible behind it (`design.md` §6).
      */}
      <button
        type="button"
        onClick={() => open()}
        className={cn(itemClass, "min-h-16 text-subtle hover:text-muted-foreground")}
      >
        <IconTrade />
        {t("trade")}
      </button>

      {links.slice(1).map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={cn(
            itemClass,
            "min-h-16",
            pathname === l.href ? "text-gold-400" : "text-subtle hover:text-muted-foreground",
          )}
          aria-current={pathname === l.href ? "page" : undefined}
        >
          {l.icon}
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
