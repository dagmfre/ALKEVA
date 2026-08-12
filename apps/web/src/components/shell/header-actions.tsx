"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { NotificationsResponse } from "@alkeva/shared";

import { eatStamp, money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

/** Assistant entry — same glyph both shells, active state on /assistant. */
export function AssistantLink() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const active = pathname.startsWith("/assistant");
  return (
    <Link
      href="/assistant"
      aria-label={t("assistant")}
      className={cn(
        "grid size-10 place-items-center rounded-full border transition-colors",
        active
          ? "border-gold-500 text-gold-400"
          : "border-input text-muted-foreground hover:text-foreground",
      )}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path
          d="M2.5 9a6.5 6.5 0 1 1 3.1 5.55L2.5 15.5l.86-2.94A6.47 6.47 0 0 1 2.5 9Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle cx="6.4" cy="9" r="0.9" fill="currentColor" />
        <circle cx="9" cy="9" r="0.9" fill="currentColor" />
        <circle cx="11.6" cy="9" r="0.9" fill="currentColor" />
      </svg>
    </Link>
  );
}

/**
 * The in-app notices surface (Phase 5.5): a bell listing the notification
 * records the money paths write. Read-only — dismissing is just closing.
 */
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
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const items = data?.notifications ?? [];

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label={t("title")}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "grid size-10 place-items-center rounded-full border transition-colors",
          open
            ? "border-gold-500 text-gold-400"
            : "border-input text-muted-foreground hover:text-foreground",
        )}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path
            d="M9 2.2a4.3 4.3 0 0 0-4.3 4.3c0 3.1-1 4.2-1.7 4.9h12c-.7-.7-1.7-1.8-1.7-4.9A4.3 4.3 0 0 0 9 2.2Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M7.3 14.2a1.8 1.8 0 0 0 3.4 0" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        {items.length > 0 && (
          <span className="absolute end-1.5 top-1.5 size-2 rounded-full bg-gold-500" />
        )}
      </button>

      {open && (
        <div className="absolute end-0 top-12 z-50 w-[320px] rounded-lg border border-border bg-popover shadow-lg">
          <div className="border-b border-border px-4 py-2.5 text-[0.9375rem] font-semibold">
            {t("title")}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-5 text-center text-[0.875rem] text-muted-foreground">
              {t("empty")}
            </p>
          ) : (
            <div className="max-h-[360px] overflow-y-auto">
              {items.map((n) => (
                <div key={n.id} className="border-b border-border/60 px-4 py-2.5 last:border-b-0">
                  <p className="text-[0.875rem] leading-snug">
                    {t.has(`templates.${n.template}` as never)
                      ? t(`templates.${n.template}` as never)
                      : n.template}
                    {n.payload?.amountCents && (
                      <span className="tnum ms-1.5 font-semibold text-gold-400">
                        {money(n.payload.amountCents)}
                      </span>
                    )}
                  </p>
                  <p className="font-latin mt-0.5 text-[0.75rem] text-subtle">
                    {eatStamp(n.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
