"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";

const LOCALE_COOKIE = "ALKEVA_LOCALE";

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();

  function setLocale(next: "am" | "en") {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return (
    <div className="flex gap-1 rounded-full bg-neutral-800 p-1 text-sm">
      {(["am", "en"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          className={`rounded-full px-3 py-1 transition-colors ${
            locale === l ? "bg-gold-500 text-neutral-950 font-semibold" : "text-neutral-300"
          }`}
        >
          {l === "am" ? "አማ" : "EN"}
        </button>
      ))}
    </div>
  );
}
