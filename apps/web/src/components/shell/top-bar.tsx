"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";

import { Mark } from "@/components/brand/mark";
import { LiveClock, NotificationsBell, UserMenu } from "@/components/shell/header-actions";
import { LocaleToggle } from "@/components/shell/locale-toggle";
import { NavIcon, isActive, useNav, usePageTitle } from "@/components/shell/nav-items";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The V2 tab bar (≥1024px). The bar is the deepest surface; the active tab is
 * filled with the page colour and grows concave feet at its base, so it reads
 * as the top edge of the page you are on rather than a highlighted button.
 *
 * Labels show from 1280px; between 1024 and 1280 the tabs are icon-only with
 * the label kept for screen readers and as a tooltip.
 */
export function TopBar() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const { main } = useNav();

  return (
    <header
      className="sticky top-0 z-(--z-index-sticky) hidden h-[3.75rem] items-end bg-bg-deep px-5 lg:flex"
      data-print="hide"
    >
      <Link
        href="/"
        className="me-3 flex items-center gap-2.5 self-center rounded-md outline-none focus-visible:outline-2 focus-visible:outline-ring xl:me-5"
      >
        <Mark size={30} />
        <span className="hidden font-latin text-[0.9375rem] font-extrabold tracking-[0.22em] xl:inline">
          ALKEVA
        </span>
      </Link>

      <nav aria-label={t("primary")} className="flex items-end gap-0.5">
        {main.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.key}
              href={item.href}
              className="v2-tab outline-none focus-visible:[&>.v2-pill]:outline-2 focus-visible:[&>.v2-pill]:outline-ring"
              data-active={active}
              aria-current={active ? "page" : undefined}
              title={item.label}
            >
              <span className="v2-pill">
                <NavIcon name={item.key} />
                <span className="sr-only xl:not-sr-only">{item.label}</span>
              </span>
            </Link>
          );
        })}
        <span aria-hidden="true" className="mx-2 mb-3 h-[22px] w-px bg-input" />
        <WalletTab />
      </nav>

      <div className="ms-auto flex items-center gap-1 self-center">
        <span className="hidden xl:flex">
          <LiveClock withLabel />
        </span>
        <span className="flex xl:hidden">
          <LiveClock withLabel={false} />
        </span>
        <NotificationsBell />
        <LocaleToggle />
        <UserMenu showName />
      </div>
    </header>
  );
}

/** Wallet: one tab that opens Deposit / Withdraw / Identity check. */
function WalletTab() {
  const pathname = usePathname();
  const router = useRouter();
  const { wallet, walletLabel } = useNav();
  const active = wallet.some((i) => isActive(pathname, i.href));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="v2-tab outline-none focus-visible:[&>.v2-pill]:outline-2 focus-visible:[&>.v2-pill]:outline-ring data-[state=open]:[&>.v2-pill]:bg-white/5"
        data-active={active}
        title={walletLabel}
      >
        <span className="v2-pill">
          <NavIcon name="wallet" />
          <span className="sr-only xl:not-sr-only">{walletLabel}</span>
          <ChevronDown className="size-3.5" aria-hidden="true" />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4} className="min-w-[13rem]">
        {wallet.map((item) => (
          <DropdownMenuItem
            key={item.key}
            onSelect={() => router.push(item.href)}
            className={isActive(pathname, item.href) ? "text-gold-300 [&_svg]:!text-gold-400" : undefined}
          >
            <NavIcon name={item.key} />
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The phone header (<1024px): the deep bar with the brand on Markets and the
 * screen's name everywhere else. Language stays in the same corner on every
 * screen — someone who cannot read the current language must find the escape.
 */
export function MobileHeader() {
  const pathname = usePathname();
  const title = usePageTitle();

  return (
    <header
      className="sticky top-0 z-(--z-index-sticky) flex h-[3.75rem] items-center justify-between gap-2 bg-bg-deep ps-4 pe-2 lg:hidden"
      data-print="hide"
    >
      {pathname === "/" ? (
        <Link href="/" className="flex items-center gap-2.5">
          <Mark size={28} />
          <span className="font-latin text-[0.9375rem] font-extrabold tracking-[0.22em]">ALKEVA</span>
        </Link>
      ) : (
        <h1 className="truncate text-[1.0625rem] font-bold">{title}</h1>
      )}
      <span className="flex flex-none items-center">
        <LiveClock withLabel={false} />
        <NotificationsBell />
        <LocaleToggle className="[&>span]:hidden" />
        <UserMenu />
      </span>
    </header>
  );
}
