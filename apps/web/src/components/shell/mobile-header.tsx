"use client";

import { usePathname } from "next/navigation";

import { Wordmark } from "@/components/brand/mark";
import { AssistantLink, NotificationsBell } from "@/components/shell/header-actions";
import { LocaleToggle } from "@/components/shell/locale-toggle";
import { usePageTitle } from "@/components/shell/page-title";

/**
 * The phone header (<1024px): identity on Home, where you are everywhere else.
 * The language toggle never moves — a user who cannot read the current
 * language must find the escape in the same place on every screen.
 */
export function MobileHeader() {
  const pathname = usePathname();
  const title = usePageTitle();

  return (
    <header
      className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 lg:hidden"
      data-print="hide"
    >
      {pathname === "/" ? <Wordmark /> : <h1 className="text-[1.125rem] font-semibold">{title}</h1>}
      <span className="flex items-center gap-2">
        <AssistantLink />
        <NotificationsBell />
        <LocaleToggle />
      </span>
    </header>
  );
}
