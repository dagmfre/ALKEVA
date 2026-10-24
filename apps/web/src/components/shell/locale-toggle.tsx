"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Check, Languages } from "lucide-react";
import { LOCALES, LOCALE_META, isLocale, type Locale } from "@alkeva/shared/locales";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const LOCALE_COOKIE = "ALKEVA_LOCALE";

/**
 * Language picker. It was a two-way toggle while the product shipped Amharic
 * and English only; with five languages a toggle cannot express the choice.
 *
 * Each option is written in its OWN language — a reader who cannot read the
 * current interface must be able to find their language without reading the
 * current interface. That is also why it stays reachable before sign-in.
 *
 * The cookie drives the UI. The PATCH additionally persists the choice on the
 * account, because the assistant and every email read `user.locale` from the
 * database; without it, switching to Tigrinya would change the screens and
 * leave the mail in whatever language was picked at registration. It is
 * fire-and-forget: a signed-out visitor 401s and the UI switch still works.
 */
export function LocaleToggle({ className }: { className?: string }) {
  const active = useLocale();
  const t = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: Locale) {
    if (next === active) return;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    void fetch("/api/auth/me/locale", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locale: next }),
    }).catch(() => {});
    startTransition(() => router.refresh());
  }

  const current = isLocale(active) ? LOCALE_META[active] : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          aria-label={t("language")}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-[0.5625rem] px-2.5 text-[0.75rem] font-semibold text-muted-foreground outline-none transition-colors hover:bg-white/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60 data-[state=open]:bg-white/5 data-[state=open]:text-foreground",
            className,
          )}
        >
          <Languages className="size-4" aria-hidden="true" />
          <span lang={active} className="max-w-[7rem] truncate">
            {current?.native ?? active}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {LOCALES.map((code) => (
          <DropdownMenuItem
            key={code}
            onSelect={() => choose(code)}
            lang={code}
            className="flex items-center justify-between gap-3"
          >
            <span>{LOCALE_META[code].native}</span>
            {code === active ? <Check className="size-4 text-gold-400" aria-hidden="true" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
