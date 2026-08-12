"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * The name of the screen you are on, from the route alone.
 *
 * One source for both shells: the desktop top bar prints it beside the clock,
 * the phone header prints it where the wordmark sits on Home. A receipt is
 * titled by its section (Receipts) rather than by its serial — the serial is
 * already the loudest thing on the document itself.
 */
export function usePageTitle(): string {
  const t = useTranslations("nav");
  const pathname = usePathname();

  if (pathname === "/") return t("home");
  if (pathname.startsWith("/trade")) return t("trade");
  if (pathname.startsWith("/portfolio")) return t("portfolio");
  if (pathname.startsWith("/history")) return t("history");
  if (pathname.startsWith("/receipts") || pathname.startsWith("/receipt/")) return t("receipts");
  if (pathname.startsWith("/deposit")) return t("deposit");
  if (pathname.startsWith("/withdraw")) return t("withdraw");
  if (pathname.startsWith("/kyc")) return t("kyc");
  if (pathname.startsWith("/assistant")) return t("assistant");
  return t("account");
}
