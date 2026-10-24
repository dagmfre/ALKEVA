"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * The single navigation source. The V2 top bar, the phone bottom bar, the
 * More sheet and the page title all read from here, so a renamed or added
 * destination can never drift between them.
 */
export type NavKey =
  | "home"
  | "trade"
  | "portfolio"
  | "history"
  | "receipts"
  | "assistant"
  | "wallet"
  | "deposit"
  | "withdraw"
  | "kyc"
  | "account"
  | "more"
  | "admin";

export interface NavItem {
  key: NavKey;
  href: string;
  label: string;
}

export function useNav() {
  const t = useTranslations("nav");
  const main: NavItem[] = [
    { key: "home", href: "/", label: t("markets") },
    { key: "trade", href: "/trade", label: t("trade") },
    { key: "portfolio", href: "/portfolio", label: t("portfolio") },
    { key: "history", href: "/history", label: t("history") },
    { key: "receipts", href: "/receipts", label: t("receipts") },
    { key: "assistant", href: "/assistant", label: t("assistant") },
  ];
  const wallet: NavItem[] = [
    { key: "deposit", href: "/deposit", label: t("deposit") },
    { key: "withdraw", href: "/withdraw", label: t("withdraw") },
    { key: "kyc", href: "/kyc", label: t("kyc") },
  ];
  const account: NavItem = { key: "account", href: "/account", label: t("account") };
  return { main, wallet, account, walletLabel: t("wallet"), moreLabel: t("more") };
}

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/receipts") return pathname.startsWith("/receipts") || pathname.startsWith("/receipt/");
  if (href === "/deposit") return pathname.startsWith("/deposit");
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The name of the screen you are on, from the route alone. */
export function usePageTitle(): string {
  const pathname = usePathname();
  const { main, wallet, account } = useNav();
  const hit = [...main, ...wallet, account].find((i) => isActive(pathname, i.href));
  return hit?.label ?? account.label;
}

/**
 * Duotone line icons on a 24 grid: a 1.8 stroke plus a 14% fill on the main
 * shape, so the active tab's champagne reads as a filled token, not a hairline.
 */
export function NavIcon({ name, size = 18 }: { name: NavKey; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  } as const;
  const tint = { fill: "currentColor", fillOpacity: 0.14 } as const;

  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M3 17l5-5 4 4 8-8" />
          <path d="M14 8h6v6" />
        </svg>
      );
    case "trade":
      return (
        <svg {...common}>
          <path d="M7 4 3 8l4 4" />
          <path d="M3 8h14" />
          <path d="m17 20 4-4-4-4" />
          <path d="M21 16H7" />
        </svg>
      );
    case "portfolio":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="15" rx="2.5" {...tint} />
          <path d="M8 5V3.8A.8.8 0 0 1 8.8 3h6.4a.8.8 0 0 1 .8.8V5" />
          <circle cx="12" cy="12.5" r="3" />
        </svg>
      );
    case "history":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" {...tint} />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "receipts":
      return (
        <svg {...common}>
          <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" {...tint} />
          <path d="M9 8h6M9 12h6" />
        </svg>
      );
    case "assistant":
      return (
        <svg {...common}>
          <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" {...tint} />
          <path d="M19 16v4M17 18h4" />
        </svg>
      );
    case "wallet":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="14" rx="2.5" {...tint} />
          <path d="M3 10h18" />
          <path d="M16 15h2" />
        </svg>
      );
    case "deposit":
      return (
        <svg {...common}>
          <path d="M12 3v11" />
          <path d="m7.5 9.5 4.5 4.5 4.5-4.5" />
          <path d="M4 17v1.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V17" />
        </svg>
      );
    case "withdraw":
      return (
        <svg {...common}>
          <path d="M12 14V3" />
          <path d="M7.5 7.5 12 3l4.5 4.5" />
          <path d="M4 17v1.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V17" />
        </svg>
      );
    case "kyc":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2.5" {...tint} />
          <circle cx="9" cy="11" r="2.2" />
          <path d="M5.8 16c.6-1.6 1.8-2.4 3.2-2.4s2.6.8 3.2 2.4M14.5 10h3.5M14.5 13.5h3.5" />
        </svg>
      );
    case "account":
      return (
        <svg {...common}>
          <circle cx="12" cy="8.5" r="3.8" {...tint} />
          <path d="M5 20c0-3.6 3.1-5.8 7-5.8s7 2.2 7 5.8" />
        </svg>
      );
    case "admin":
      return (
        <svg {...common}>
          <path d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6z" {...tint} />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "more":
      return (
        <svg {...common}>
          <rect x="4" y="4" width="6.5" height="6.5" rx="1.8" {...tint} />
          <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8" />
          <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8" />
          <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8" {...tint} />
        </svg>
      );
  }
}

/** The faceted gemstone that carries tier identity. */
export function TierMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" fill="none" aria-hidden="true">
      <path
        d="M17 3 28 12l-4.5 15h-13L6 12z"
        fill="var(--gold-400)"
        fillOpacity="0.12"
        stroke="var(--gold-300)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M6 12h22M17 3v24M11 12l6 15 6-15" stroke="var(--gold-300)" strokeWidth="1" opacity="0.5" />
    </svg>
  );
}
