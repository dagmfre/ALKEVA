"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Bell, BellRing, ChevronDown, LogOut, ShieldCheck, UserRound } from "lucide-react";
import type { MeResponse } from "@alkeva/shared";

import { usePrices } from "@/components/market/price-provider";
import { useAppData, useOptionalAppData } from "@/components/shell/app-data";
import { Achievements, TierCard, TierGem, tierRing } from "@/components/shell/tier-progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { signOut } from "@/lib/sign-out";
import { eatStamp, eatTime } from "@/lib/format";
import { notificationDetail, notificationHref, notificationTitle } from "@/lib/notifications";
import { currentSubscription, enablePush, pushSupported } from "@/lib/push";
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

/**
 * The bell. Unread count from the server (read state is real since Phase 10);
 * opening it marks what you can see as read; a failed load says so with a
 * retry instead of pretending there is "nothing yet"; every notice carries
 * its figures and links to where it happened.
 */
export function NotificationsBell() {
  const t = useTranslations("notifications");
  const tc = useTranslations("common");
  const router = useRouter();
  const { notifications, markRead } = useAppData();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const data = notifications.data;
  const items = data?.notifications ?? [];
  const unread = data?.unreadCount ?? 0;

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

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      notifications.reload();
      const visibleUnread = items.filter((n) => !n.readAt).map((n) => n.id);
      if (visibleUnread.length > 0) void markRead(visibleUnread);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label={unread > 0 ? t("titleUnread", { count: unread }) : t("title")}
        aria-expanded={open}
        data-state={open ? "open" : "closed"}
        onClick={toggle}
        className={iconBtn}
      >
        <Bell className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
        {unread > 0 && (
          <span className="tnum absolute -end-0.5 -top-0.5 grid min-w-4.5 place-items-center rounded-full bg-gold-400 px-1 text-[0.625rem] leading-4.5 font-bold text-primary-foreground ring-2 ring-bg-deep">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 top-11 z-(--z-index-dropdown) w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-[0.75rem] border border-input bg-popover shadow-(--shadow-pop) animate-in fade-in-0 zoom-in-95">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-[0.875rem] font-bold">{t("title")}</span>
            {items.some((n) => !n.readAt) && (
              <button
                type="button"
                onClick={() => void markRead()}
                className="text-[0.75rem] font-semibold text-gold-400 hover:text-gold-300"
              >
                {t("markAllRead")}
              </button>
            )}
          </div>
          {notifications.error && !data ? (
            <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
              <p className="text-[0.8125rem] text-muted-foreground">{t("loadFailed")}</p>
              <button type="button" onClick={notifications.reload} className="text-[0.8125rem] font-semibold text-gold-400">
                {tc("retry")}
              </button>
            </div>
          ) : items.length === 0 ? (
            <p className="px-4 py-6 text-center text-[0.8125rem] text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="max-h-[380px] overflow-y-auto">
              {items.slice(0, 12).map((n) => {
                const detail = notificationDetail(t, n);
                return (
                  <button
                    type="button"
                    key={n.id}
                    onClick={() => {
                      setOpen(false);
                      router.push(notificationHref(n));
                    }}
                    className={cn(
                      "flex w-full gap-3 border-b border-border px-4 py-3 text-start last:border-b-0 hover:bg-white/4",
                      !n.readAt && "bg-gold-400/5",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn("mt-1.5 size-1.5 flex-none rounded-full", n.readAt ? "bg-transparent" : "bg-gold-400")}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.8125rem] leading-snug font-semibold">{notificationTitle(t, n)}</span>
                      {detail && (
                        <span className="tnum mt-0.5 block truncate text-[0.75rem] text-muted-foreground">{detail}</span>
                      )}
                      <span className="tnum mt-1 block text-[0.6875rem] text-subtle">{eatStamp(n.createdAt)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2.5">
            <PushQuickToggle />
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-[0.75rem] font-semibold text-gold-400 hover:text-gold-300"
            >
              {t("seeAll")} →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/** "Turn on browser alerts" — permission is requested only from this click. */
function PushQuickToggle() {
  const t = useTranslations("notifications");
  const [state, setState] = useState<"idle" | "on" | "busy" | "blocked" | "hidden">("hidden");

  useEffect(() => {
    if (!pushSupported()) return;
    if (Notification.permission === "denied") {
      setState("blocked");
      return;
    }
    void currentSubscription().then((sub) => setState(sub ? "on" : "idle"));
  }, []);

  if (state === "hidden" || state === "on") return <span />;
  if (state === "blocked") return <span className="text-[0.6875rem] text-subtle">{t("pushBlocked")}</span>;
  return (
    <button
      type="button"
      disabled={state === "busy"}
      onClick={async () => {
        setState("busy");
        const result = await enablePush().catch(() => "error");
        setState(result === "granted" ? "on" : result === "denied" ? "blocked" : "idle");
      }}
      className="flex items-center gap-1.5 text-[0.75rem] font-semibold text-muted-foreground hover:text-foreground"
    >
      <BellRing className="size-3.5" aria-hidden="true" />
      {t("pushEnable")}
    </button>
  );
}

/**
 * The profile menu. The trigger carries the holding tier as a game level —
 * avatar ringed in the tier colour, the tier's own gem — and the menu shows
 * progress to the next tier, what it unlocks, and the achievements. Then
 * Account, the staff console for staff (RolesGuard is the real boundary —
 * this is a door, not a lock), and sign-out.
 */
export function UserMenu({ showName = false, me: meProp }: { showName?: boolean; me?: MeResponse }) {
  const tn = useTranslations("nav");
  const tc = useTranslations("common");
  const tt = useTranslations("tier");
  const router = useRouter();
  // The staff console has no customer data provider (no wallet, no tier): it
  // passes `me` in, and the menu shows identity, the doors and sign-out only.
  const app = useOptionalAppData();
  const me = meProp ?? app?.me.data;
  const progressData = app?.progress.data;
  const staff = isStaffRole(me?.role);
  const tierName = progressData?.tier.name ?? null;

  const initials =
    me?.fullName
      ?.trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0))
      .join("")
      .toUpperCase() || "·";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={tn("account")}
        className="flex h-9 items-center gap-2 rounded-[0.5625rem] ps-1 pe-2 outline-none transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-white/5"
      >
        <span className="relative">
          <span
            className={cn(
              "grid size-7 place-items-center rounded-full bg-raised font-latin text-[0.6875rem] font-bold text-gold-300 ring-2",
              staff ? "ring-border" : tierRing(tierName),
            )}
          >
            {initials}
          </span>
          {!staff && tierName && (
            <span className="absolute -end-1 -bottom-1 grid size-4 place-items-center rounded-full bg-bg-deep">
              <TierGem name={tierName} className="size-3" />
            </span>
          )}
        </span>
        {showName && !staff && tierName && (
          <span className="hidden text-[0.75rem] font-semibold text-muted-foreground min-[1720px]:inline">
            {tt(`names.${tierName}` as never)}
          </span>
        )}
        {showName && (
          <span className="hidden max-w-[8rem] truncate text-[0.8125rem] font-semibold min-[1720px]:inline">
            {me?.fullName?.split(/\s+/)[0] ?? ""}
          </span>
        )}
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(20rem,calc(100vw-2rem))]">
        {me && (
          <>
            <DropdownMenuLabel className="flex flex-col gap-0.5 font-sans">
              <span className="truncate text-[0.875rem] font-semibold text-foreground">{me.fullName}</span>
              <span className="tnum truncate text-[0.75rem]">{me.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        {!staff && progressData && (
          <>
            <div className="flex flex-col gap-4 px-2 py-2">
              <TierCard progress={progressData} compact />
              <Achievements badges={progressData.badges} dense />
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={() => router.push("/account")}>
          <UserRound />
          {tn("account")}
        </DropdownMenuItem>
        {staff && (
          <DropdownMenuItem onSelect={() => router.push("/admin")}>
            <ShieldCheck />
            {tn("adminConsole")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void signOut(router)}>
          <LogOut />
          {tc("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
