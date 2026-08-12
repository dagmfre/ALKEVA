"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import type { MeResponse } from "@alkeva/shared";

import { Wordmark } from "@/components/brand/mark";
import { LocaleToggle } from "@/components/shell/locale-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

type StaffRole = "administrator" | "compliance" | "finance";

interface AdminNavItem {
  href: string;
  key: string;
  roles: StaffRole[];
}

/** Mirrors the API's RolesGuard matrix — the API is the boundary, this is UX. */
const NAV: AdminNavItem[] = [
  { href: "/admin", key: "overview", roles: ["administrator", "compliance", "finance"] },
  { href: "/admin/users", key: "users", roles: ["administrator", "compliance"] },
  { href: "/admin/kyc", key: "kyc", roles: ["compliance"] },
  { href: "/admin/reviews", key: "reviews", roles: ["compliance"] },
  { href: "/admin/payouts", key: "payouts", roles: ["finance"] },
  { href: "/admin/orders", key: "orders", roles: ["administrator", "compliance", "finance"] },
  { href: "/admin/treasury", key: "treasury", roles: ["administrator", "finance"] },
  { href: "/admin/audit", key: "audit", roles: ["administrator", "compliance"] },
];

/**
 * The staff console's frame. The role gate here is user experience — every
 * /admin API route enforces its own roles server-side, so a spoofed client
 * sees an empty console, not data.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const pathname = usePathname();
  const me = useResource<MeResponse>("/auth/me");

  const role = me.data?.role;
  const isStaff = role === "administrator" || role === "compliance" || role === "finance";

  useEffect(() => {
    if (me.data && !isStaff) router.replace("/");
  }, [me.data, isStaff, router]);

  if (!me.data) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Skeleton className="h-8 w-40" />
      </div>
    );
  }
  if (!isStaff) return null;

  const items = NAV.filter((item) => item.roles.includes(role as StaffRole));

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-[220px] flex-none flex-col gap-1 border-e border-border bg-card px-3 py-5 lg:flex">
        <div className="mb-4 flex items-center gap-2 px-2">
          <Wordmark size={24} />
          <span className="rounded bg-popover px-1.5 py-0.5 text-[0.6875rem] font-medium text-platinum-400">
            {t(`roles.${role}` as never)}
          </span>
        </div>
        {items.map((item) => {
          const active =
            item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-2 text-[0.9375rem] transition-colors",
                active ? "pill-active font-medium" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`nav.${item.key}` as never)}
            </Link>
          );
        })}
        <div className="mt-auto flex flex-col gap-2 px-2">
          <Link href="/" className="text-[0.875rem] text-muted-foreground hover:text-foreground">
            ← {t("backToApp")}
          </Link>
          <LocaleToggle />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Phone fallback: a horizontal tab strip — the console is desktop-first
            but must not be a dead end on a small screen. */}
        <nav className="flex gap-1 overflow-x-auto border-b border-border bg-card px-3 py-2 lg:hidden">
          {items.map((item) => {
            const active =
              item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.key}
                href={item.href}
                className={cn(
                  "whitespace-nowrap rounded-md px-3 py-1.5 text-[0.875rem]",
                  active ? "pill-active" : "text-muted-foreground",
                )}
              >
                {t(`nav.${item.key}` as never)}
              </Link>
            );
          })}
        </nav>
        <main className="mx-auto w-full max-w-[1200px] px-4 py-5 lg:px-8 lg:py-7">
          {children}
        </main>
      </div>
    </div>
  );
}
