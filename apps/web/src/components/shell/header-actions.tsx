"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Bell, ChevronDown, LogOut, ShieldCheck, UserRound } from "lucide-react";
import type { MeResponse, NotificationsResponse } from "@alkeva/shared";

import { usePrices } from "@/components/market/price-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { eatStamp, eatTime, money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

const iconBtn =
  "relative grid size-9 place-items-center rounded-[0.5625rem] text-muted-foreground outline-none transition-colors hover:bg-white/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-white/5 data-[state=open]:text-foreground";

export function isStaffRole(role: MeResponse["role"] | undefined): boolean {
  return role === "administrator" || role === "compliance" || role === "finance";
}

/**
 * Feed status and the Addis clock: a green ring while the shared price store
 * is fresh, flat grey once the staleness ratchet trips. Rendered after mount —
 * the server has no viewer clock.
 */
export function LiveClock({ withLabel = true }: { withLabel?: boolean }) {
  const tc = useTranslations("common");
  const { anyStale } = usePrices();
  const [now, setNow] = useState<string | null>(null);

  useEffect(() => {
    const write = () => setNow(eatTime(new Date()));
    write();
    const id = setInterval(write, 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="tnum flex items-center gap-2 px-2 text-[0.75rem] whitespace-nowrap text-muted-foreground">
      <span
        aria-hidden="true"
        className={cn("size-[7px] flex-none rounded-full", anyStale ? "bg-subtle" : "live-dot bg-gain")}
      />
      {withLabel && <span className="font-sans">{anyStale ? tc("delayed") : tc("live")}</span>}
      {withLabel && <span aria-hidden="true">·</span>}
      <span>{now ?? "--:--"} EAT</span>
    </span>
  );
}

/** The in-app notices: a bell listing the records the money paths write. */
export function NotificationsBell() {
  const t = useTranslations("notifications");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { data } = useResource<NotificationsResponse>("/notifications", {
    intervalMs: 60_000,
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items = data?.notifications ?? [];

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label={t("title")}
        aria-expanded={open}
        data-state={open ? "open" : "closed"}
        onClick={() => setOpen((v) => !v)}
        className={iconBtn}
      >
        <Bell className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
        {items.length > 0 && (
          <span className="absolute end-2 top-2 size-1.5 rounded-full bg-gold-400 ring-2 ring-bg-deep" />
        )}
      </button>

      {open && (
        <div className="absolute end-0 top-11 z-(--z-index-dropdown) w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-[0.75rem] border border-input bg-popover shadow-(--shadow-pop) animate-in fade-in-0 zoom-in-95">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-[0.875rem] font-bold">{t("title")}</span>
            {items.length > 0 && (
              <span className="tnum text-[0.75rem] text-subtle">{items.length}</span>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-[0.8125rem] text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="max-h-[360px] overflow-y-auto">
              {items.map((n) => (
                <div key={n.id} className="border-b border-border px-4 py-3 last:border-b-0">
                  <p className="text-[0.8125rem] leading-snug">
                    {t.has(`templates.${n.template}` as never)
                      ? t(`templates.${n.template}` as never)
                      : n.template}
                    {n.payload?.amountCents && (
                      <span className="tnum ms-1.5 font-semibold text-gold-300">
                        {money(n.payload.amountCents)}
                      </span>
                    )}
                  </p>
                  <p className="tnum mt-1 text-[0.6875rem] text-subtle">{eatStamp(n.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The avatar menu: Account, the staff console when this identity holds a staff
 * role (RolesGuard on the API is the real boundary — this is a door, not a
 * lock), and sign-out.
 */
export function UserMenu({ showName = false }: { showName?: boolean }) {
  const tn = useTranslations("nav");
  const tc = useTranslations("common");
  const router = useRouter();
  const { data: me } = useResource<MeResponse>("/auth/me");

  const initials =
    me?.fullName
      ?.trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0))
      .join("")
      .toUpperCase() || "·";

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
      <DropdownMenuTrigger
        aria-label={tn("account")}
        className="flex h-9 items-center gap-2.5 rounded-[0.5625rem] ps-1 pe-2 outline-none transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-white/5"
      >
        <span className="grid size-7 place-items-center rounded-full bg-raised font-latin text-[0.6875rem] font-bold text-gold-300">
          {initials}
        </span>
        {showName && (
          <span className="hidden max-w-[8rem] truncate text-[0.8125rem] font-semibold min-[1400px]:inline">
            {me?.fullName?.split(/\s+/)[0] ?? ""}
          </span>
        )}
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[14rem]">
        {me && (
          <>
            <DropdownMenuLabel className="flex flex-col gap-0.5 font-sans">
              <span className="truncate text-[0.875rem] font-semibold text-foreground">{me.fullName}</span>
              <span className="tnum truncate text-[0.75rem]">{me.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={() => router.push("/account")}>
          <UserRound />
          {tn("account")}
        </DropdownMenuItem>
        {isStaffRole(me?.role) && (
          <DropdownMenuItem onSelect={() => router.push("/admin")}>
            <ShieldCheck />
            {tn("adminConsole")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void signOut()}>
          <LogOut />
          {tc("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
