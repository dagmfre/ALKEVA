import type { NotificationItem } from "@alkeva/shared";

import { grams, money } from "@/lib/format";

/** next-intl translator for the "notifications" namespace (structural type). */
type T = ((key: string, values?: Record<string, string | number>) => string) & {
  has: (key: string) => boolean;
};

const metalKey = (asset: string | undefined) => (asset === "XPT" ? "metalPlatinum" : "metalGold");

/** The headline of a notice, in the reader's language. */
export function notificationTitle(t: T, n: NotificationItem): string {
  if (n.template === "staff_alert" && n.payload?.kind) {
    const kind = `staffKinds.${n.payload.kind}`;
    return t.has(kind) ? t(kind) : t("templates.staff_alert");
  }
  const key = `templates.${n.template}`;
  return t.has(key) ? t(key) : n.template;
}

/** One line of figures so a notice says WHAT happened, not just that something did. */
export function notificationDetail(t: T, n: NotificationItem): string | null {
  const p = n.payload ?? {};
  switch (n.template) {
    case "deposit_credited":
    case "deposit_reversed":
    case "payout_requested":
    case "payout_approved":
    case "payout_rejected":
      return p.amountCents ? `${money(p.amountCents)} ${t("birr")}` : null;
    case "payout_settled":
      return p.amountCents
        ? `${money(p.amountCents)} ${t("birr")}${p.accountNumber ? ` → ${p.accountNumber}` : ""}`
        : null;
    case "order_receipt":
    case "order_in_review":
      return p.gramsMg && p.totalCents
        ? `${grams(p.gramsMg)} g ${t(metalKey(p.asset))} · ${money(p.totalCents)} ${t("birr")}`
        : null;
    case "price_alert":
      return p.priceCentsPerGram
        ? t("alertDetail", { metal: t(metalKey(p.asset)), price: money(p.priceCentsPerGram) })
        : null;
    case "delivery_requested":
    case "delivery_approved":
    case "delivery_scheduled":
    case "delivery_rejected":
    case "delivery_delivered":
      return p.gramsMg ? `${grams(p.gramsMg)} g ${t(metalKey(p.asset))}` : null;
    case "new_sign_in":
      return p.device ?? null;
    case "staff_alert":
      return p.message ?? null;
    default:
      return null;
  }
}

/** Where a click on the notice should go (mirrors the service worker's choice). */
export function notificationHref(n: NotificationItem): string {
  const p = n.payload ?? {};
  if (p.url && p.url.startsWith("/")) return p.url;
  if (n.template.startsWith("payout_") || n.template.startsWith("deposit_")) return "/wallet";
  if (n.template.startsWith("order_")) return "/history";
  if (n.template.startsWith("delivery_")) return "/portfolio";
  if (n.template === "price_alert") return "/trade";
  if (n.template === "new_sign_in" || n.template === "passkey_added") return "/account";
  if (n.template.startsWith("kyc_") || n.template === "fayda_verified") return "/kyc";
  return "/notifications";
}
