"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  ArrowLeftRight,
  BadgeCheck,
  Banknote,
  ChartColumn,
  CircleDollarSign,
  Landmark,
  LayoutDashboard,
  ScanSearch,
  ScrollText,
  ShieldCheck,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { MeResponse } from "@alkeva/shared";

import { Mark } from "@/components/brand/mark";
import { UserMenu } from "@/components/shell/header-actions";
import { LocaleToggle } from "@/components/shell/locale-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

type StaffRole = "administrator" | "compliance" | "finance";

interface AdminNavItem {
  href: string;
  key: string;
  roles: StaffRole[];
  icon: LucideIcon;
}

/**
 * Mirrors the API's RolesGuard matrix — the API is the boundary, this is UX.
 * The administrator is the superuser (sees and acts on everything);
 * compliance and finance stay scoped.
 */
const NAV: AdminNavItem[] = [
  { href: "/admin", key: "overview", roles: ["administrator", "compliance", "finance"], icon: LayoutDashboard },
  // Revenue is the owner's P&L — administrator only, matching the API guard.
  { href: "/admin/revenue", key: "revenue", roles: ["administrator"], icon: CircleDollarSign },
  { href: "/admin/analytics", key: "analytics", roles: ["administrator", "compliance", "finance"], icon: ChartColumn },
  { href: "/admin/users", key: "users", roles: ["administrator", "compliance"], icon: Users },
  { href: "/admin/kyc", key: "kyc", roles: ["administrator", "compliance"], icon: BadgeCheck },
  { href: "/admin/reviews", key: "reviews", roles: ["administrator", "compliance"], icon: ScanSearch },
  { href: "/admin/payouts", key: "payouts", roles: ["administrator", "finance"], icon: Banknote },
  { href: "/admin/orders", key: "orders", roles: ["administrator", "compliance", "finance"], icon: ArrowLeftRight },
  { href: "/admin/treasury", key: "treasury", roles: ["administrator", "finance"], icon: Landmark },
  { href: "/admin/delivery", key: "delivery", roles: ["administrator", "compliance"], icon: Truck },
  { href: "/admin/compliance", key: "compliance", roles: ["administrator", "compliance"], icon: ShieldCheck },
  { href: "/admin/audit", key: "audit", roles: ["administrator", "compliance"], icon: ScrollText },
];

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

/**
 * The staff console's frame: the user app's V2 tab bar, carrying the console's
 * own role-filtered destinations. On a desk the tabs are icons with the active
 * tab's label (every label from 1800px — twelve destinations do not fit at
 * 1440 with names); on a phone the same tabs become a scrollable row under a
 * compact header. Content runs full width up to 1680px, `main` a flex column.
 *
 * The role gate here is user experience — every /admin API route enforces its
 * own roles server-side, so a spoofed client sees an empty console, not data.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const pathname = usePathname();
  const me = useResource<MeResponse>("/auth/me");
  const rowRef = useRef<HTMLElement>(null);

  const role = me.data?.role;
  const isStaff = role === "administrator" || role === "compliance" || role === "finance";

  // Keep the active tab in view on the phone row (it may be the 9th of 12).
  useEffect(() => {
    const row = rowRef.current;
    const tab = row?.querySelector<HTMLElement>('[data-active="true"]');
    if (!row || !tab) return;
    row.scrollLeft = tab.offsetLeft - (row.clientWidth - tab.offsetWidth) / 2;
  }, [pathname, isStaff]);

  async function signOut() {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  if (!me.data) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Skeleton className="h-8 w-40" />
      </div>
    );
  }

  // A non-staff visitor is told why, and by which identity. This used to be a
  // silent router.replace("/") — indistinguishable from a broken route, and it
  // hid the only thing worth knowing: which account the browser is holding.
  // The API's RolesGuard is the real boundary, so showing this costs nothing.
  if (!isStaff) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <div className="flex max-w-[26rem] flex-col items-center gap-3 rounded-lg border border-border bg-card p-6 text-center">
          <Mark size={34} />
          <h1 className="text-lg font-bold">{t("notStaffTitle")}</h1>
          <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
            {t("notStaffBody", {
              email: me.data.email,
              role: t(`roles.${role ?? "user"}` as never),
            })}
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <Button variant="outline" size="sm" asChild>
              <Link href="/">
                <ArrowLeft />
                {t("backToApp")}
              </Link>
            </Button>
            {/* Sign out rather than a /login link: middleware bounces a
                signed-in visitor away from /login, so the link would loop. */}
            <Button variant="gold" size="sm" onClick={() => void signOut()}>
              {t("signInAsStaff")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const items = NAV.filter((item) => item.roles.includes(role as StaffRole));
  const roleLabel = t(`roles.${role}` as never);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Desk: the V2 tab bar. */}
      <header className="sticky top-0 z-(--z-index-sticky) hidden h-[3.75rem] items-end bg-bg-deep px-5 lg:flex">
        <Link
          href="/admin"
          className="me-3 flex items-center gap-2.5 self-center rounded-md outline-none focus-visible:outline-2 focus-visible:outline-ring xl:me-4"
        >
          <Mark size={30} />
          <span className="hidden font-latin text-[0.9375rem] font-extrabold tracking-[0.22em] min-[1800px]:inline">
            ALKEVA
          </span>
          <Badge variant="platinum">{roleLabel}</Badge>
        </Link>

        <nav aria-label={t("notStaffTitle")} className="flex min-w-0 items-end gap-0.5">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            const label = t(`nav.${item.key}` as never);
            return (
              <Link
                key={item.key}
                href={item.href}
                className="v2-tab outline-none focus-visible:[&>.v2-pill]:outline-2 focus-visible:[&>.v2-pill]:outline-ring"
                data-active={active}
                aria-current={active ? "page" : undefined}
                title={label}
              >
                <span className="v2-pill">
                  <Icon className="size-[18px]" aria-hidden="true" />
                  <span className={active ? "sr-only xl:not-sr-only" : "sr-only min-[1800px]:not-sr-only"}>
                    {label}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="ms-auto flex flex-none items-center gap-1 self-center">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/" title={t("backToApp")}>
              <ArrowLeft />
              <span className="sr-only min-[1400px]:not-sr-only">{t("backToApp")}</span>
            </Link>
          </Button>
          <LocaleToggle />
          <UserMenu showName />
        </div>
      </header>

      {/* Phone: compact header, then the tabs as a sideways-scrolling row. */}
      <div className="sticky top-0 z-(--z-index-sticky) bg-bg-deep lg:hidden">
        <div className="flex h-14 items-center justify-between gap-2 ps-4 pe-2">
          <Link href="/admin" className="flex min-w-0 items-center gap-2.5">
            <Mark size={26} />
            <Badge variant="platinum">{roleLabel}</Badge>
          </Link>
          <span className="flex flex-none items-center">
            <Button variant="ghost" size="icon-sm" asChild>
              <Link href="/" aria-label={t("backToApp")} title={t("backToApp")}>
                <ArrowLeft />
              </Link>
            </Button>
            <LocaleToggle className="[&>span]:hidden" />
            <UserMenu />
          </span>
        </div>
        <nav
          ref={rowRef}
          aria-label={t("notStaffTitle")}
          className="flex items-end gap-0.5 overflow-x-auto px-3 [scrollbar-width:none]"
        >
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                href={item.href}
                className="v2-tab flex-none text-[0.8125rem] outline-none focus-visible:[&>.v2-pill]:outline-2 focus-visible:[&>.v2-pill]:outline-ring"
                data-active={active}
                aria-current={active ? "page" : undefined}
              >
                <span className="v2-pill px-2.5!">
                  <Icon className="size-4" aria-hidden="true" />
                  {t(`nav.${item.key}` as never)}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      <main className="mx-auto flex w-full max-w-[1680px] min-w-0 flex-1 flex-col px-4 pt-4 pb-5">
        {children}
      </main>
    </div>
  );
}
