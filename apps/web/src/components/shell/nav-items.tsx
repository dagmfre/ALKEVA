"use client";

import { useTranslations } from "next-intl";

/**
 * One navigation vocabulary, two surfaces.
 *
 * The desktop sidebar shows all six destinations in two labelled sections;
 * the phone tab bar shows the five that fit a thumb (Trade is a sheet there,
 * not a route, and Receipts lives inside History). Both read from here so a
 * renamed destination can never drift between them.
 */
export type NavKey = "home" | "trade" | "portfolio" | "history" | "receipts" | "account";

export interface NavItem {
  key: NavKey;
  href: string;
  label: string;
}

export function useNavItems(): { market: NavItem[]; account: NavItem[] } {
  const t = useTranslations("nav");
  return {
    market: [
      { key: "home", href: "/", label: t("home") },
      { key: "trade", href: "/trade", label: t("trade") },
    ],
    account: [
      { key: "portfolio", href: "/portfolio", label: t("portfolio") },
      { key: "history", href: "/history", label: t("history") },
      { key: "receipts", href: "/receipts", label: t("receipts") },
      { key: "account", href: "/account", label: t("account") },
    ],
  };
}

/** Line icons at 18px on an 18px grid — the comp's exact paths. */
export function NavIcon({ name, size = 18 }: { name: NavKey; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 18 18",
    fill: "none",
    stroke: "currentColor",
    "aria-hidden": true,
  } as const;

  switch (name) {
    case "home":
      return (
        <svg {...common} strokeWidth="1.7" strokeLinejoin="round">
          <path d="M3 8.2 9 3.2l6 5v7H3z" />
        </svg>
      );
    case "trade":
      return (
        <svg {...common} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6.4h11M11.6 4l2.4 2.4-2.4 2.4M15 11.6H4M6.4 9.2 4 11.6 6.4 14" />
        </svg>
      );
    case "portfolio":
      return (
        <svg {...common} strokeWidth="1.6">
          <rect x="2.6" y="2.6" width="5.6" height="5.6" rx="1.3" />
          <rect x="9.8" y="2.6" width="5.6" height="5.6" rx="1.3" />
          <rect x="2.6" y="9.8" width="5.6" height="5.6" rx="1.3" />
          <rect x="9.8" y="9.8" width="5.6" height="5.6" rx="1.3" />
        </svg>
      );
    case "history":
      return (
        <svg {...common} strokeWidth="1.6" strokeLinecap="round">
          <circle cx="9" cy="9" r="6.4" />
          <path d="M9 5.4V9l2.6 1.6" />
        </svg>
      );
    case "receipts":
      return (
        <svg {...common} strokeWidth="1.6" strokeLinejoin="round">
          <path d="M4.2 2.8h9.6v12.4l-2.4-1.2-2.4 1.2-2.4-1.2-2.4 1.2z" />
          <path d="M6.8 6.6h4.4M6.8 9.6h4.4" />
        </svg>
      );
    case "account":
      return (
        <svg {...common} strokeWidth="1.6">
          <circle cx="9" cy="6.4" r="2.9" />
          <path d="M3.7 15.2c0-2.8 2.4-4.5 5.3-4.5s5.3 1.7 5.3 4.5" />
        </svg>
      );
  }
}

/** The faceted gemstone that carries tier identity — never gold-filled. */
export function TierMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" fill="none" aria-hidden="true">
      <path
        d="M17 3 28 12l-4.5 15h-13L6 12z"
        stroke="var(--platinum-400)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M6 12h22M17 3v24" stroke="var(--platinum-400)" strokeWidth="1" opacity="0.55" />
    </svg>
  );
}
