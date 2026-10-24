"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { MeResponse } from "@alkeva/shared";

import { isStaffRole } from "@/components/shell/header-actions";
import { NavIcon, isActive, useNav, type NavItem } from "@/components/shell/nav-items";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

/**
 * The phone tab bar (<1024px): the V2 tab turned upside down. The active tab
 * is the page colour and its feet reach up into the page, so the screen and
 * its tab read as one shape. Four destinations and More; More opens a sheet
 * with everything else, so no route is ever more than two taps away.
 */
export function BottomNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const { main, wallet, account, moreLabel } = useNav();
  const [moreOpen, setMoreOpen] = useState(false);
  const { data: me } = useResource<MeResponse>("/auth/me");

  const primary = main.slice(0, 4);
  const rest: NavItem[] = [
    ...main.slice(4),
    ...wallet,
    account,
    ...(isStaffRole(me?.role) ? [{ key: "admin" as const, href: "/admin", label: t("adminConsole") }] : []),
  ];
  const moreActive = rest.some((i) => isActive(pathname, i.href));

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-(--z-index-sticky) flex h-[calc(4.5rem+env(safe-area-inset-bottom))] items-start bg-bg-deep px-2 pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label={t("primary")}
        data-print="hide"
      >
        {primary.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.key}
              href={item.href}
              className="v2-tab-b outline-none focus-visible:[&>svg]:outline-2 focus-visible:[&>svg]:outline-ring"
              data-active={active}
              aria-current={active ? "page" : undefined}
            >
              <NavIcon name={item.key} size={20} />
              <span className="max-w-full truncate px-1">{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="v2-tab-b outline-none"
          data-active={moreActive}
          aria-haspopup="dialog"
        >
          <NavIcon name="more" size={20} />
          <span className="max-w-full truncate px-1">{moreLabel}</span>
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="gap-0 px-4 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <span aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-raised" />
          <SheetTitle className="mb-3 px-1">{moreLabel}</SheetTitle>
          <SheetDescription className="sr-only">{moreLabel}</SheetDescription>
          <div className="grid grid-cols-3 gap-2">
            {rest.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-[5.25rem] flex-col items-center justify-center gap-2 rounded-md border px-2 text-center text-[0.8125rem] font-semibold leading-tight transition-colors",
                    active
                      ? "border-gold-400/40 bg-gold-400/8 text-gold-300"
                      : "border-border bg-panel-2 text-foreground hover:bg-raised",
                  )}
                >
                  <span className={active ? "text-gold-400" : "text-muted-foreground"}>
                    <NavIcon name={item.key} size={22} />
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
