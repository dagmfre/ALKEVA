"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { cn } from "@/lib/utils";

const LOCALE_COOKIE = "ALKEVA_LOCALE";

/**
 * A single toggle, not a menu — there are exactly two languages for the demo
 * and a user who cannot read the current one must be able to escape it in one
 * tap. Reachable before authentication for the same reason.
 */
export function LocaleToggle({ className }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = locale === "am" ? "en" : "am";
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-label={locale === "am" ? "Switch to English" : "ወደ አማርኛ ቀይር"}
      className={cn(
        "font-latin inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-input px-3.5 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:border-foreground hover:text-foreground disabled:opacity-60",
        className,
      )}
    >
      {locale === "am" ? "አማ · EN" : "EN · አማ"}
    </button>
  );
}
