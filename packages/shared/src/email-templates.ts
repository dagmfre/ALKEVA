import { escapeHtml, renderEmailHtml } from "./email-layout.js";

/**
 * Notification copy, both locales — the single source for the API and the
 * worker (the worker used to carry its own duplicated alert copy).
 * Deterministic templates — the LLM never writes a notification (design doc
 * §8: "the LLM phrases; thresholds trigger" applies to chat, and even there
 * alerts are templated). Amharic drafted by the developer; Dagmfre reviews
 * per the translation working rule.
 */
export type NotificationTemplate =
  | "deposit_credited"
  | "payout_approved"
  | "payout_settled"
  | "payout_rejected"
  | "kyc_approved"
  | "kyc_rejected"
  | "account_frozen"
  | "account_unfrozen"
  | "price_alert"
  | "order_receipt"
  | "password_reset"
  | "delivery_requested"
  | "delivery_approved"
  | "delivery_scheduled"
  | "delivery_rejected";

export type NotificationPayload = Record<string, string>;

export interface RenderedEmail {
  subject: string;
  /** Plain-text part — kept for deliverability alongside the branded HTML. */
  text: string;
  html: string;
}

/** "123456" cents → "1,234.56". Payloads carry raw cent strings. */
function fmtEtb(cents: string | undefined): string {
  if (!cents) return "0.00";
  const v = BigInt(cents);
  const sign = v < 0n ? "-" : "";
  const abs = v < 0n ? -v : v;
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${whole}.${(abs % 100n).toString().padStart(2, "0")}`;
}

function fmtGrams(mg: string | undefined): string {
  if (!mg) return "0";
  const v = BigInt(mg);
  return `${v / 1000n}.${(v % 1000n).toString().padStart(3, "0")}`;
}

const METAL_AM: Record<string, string> = { XAU: "ወርቅ", XPT: "ፕላቲነም" };
const METAL_EN: Record<string, string> = { XAU: "gold", XPT: "platinum" };

interface Copy {
  subject: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

function copyFor(
  template: NotificationTemplate,
  locale: "am" | "en",
  p: NotificationPayload,
): Copy {
  const am = locale === "am";
  switch (template) {
    case "deposit_credited":
      return {
        subject: am ? "ገቢ ተመዝግቧል — ALKEVA" : "Deposit credited — ALKEVA",
        body: am
          ? `ብር ${fmtEtb(p.amountCents)} ወደ መለያዎ ገብቷል። ማጣቀሻ፦ ${p.txRef ?? ""}`
          : `ETB ${fmtEtb(p.amountCents)} has been credited to your account. Reference: ${p.txRef ?? ""}`,
      };
    case "payout_approved":
      return {
        subject: am ? "ወጪ ጸድቋል — ALKEVA" : "Withdrawal approved — ALKEVA",
        body: am
          ? `የብር ${fmtEtb(p.amountCents)} ወጪ ጥያቄዎ ጸድቆ በሂደት ላይ ነው።`
          : `Your withdrawal of ETB ${fmtEtb(p.amountCents)} was approved and is being processed.`,
      };
    case "payout_settled":
      return {
        subject: am ? "ወጪ ተልኳል — ALKEVA" : "Withdrawal sent — ALKEVA",
        body: am
          ? `ብር ${fmtEtb(p.amountCents)} ወደ ${p.accountNumber ?? ""} ተልኳል።`
          : `ETB ${fmtEtb(p.amountCents)} has been sent to ${p.accountNumber ?? ""}.`,
      };
    case "payout_rejected":
      return {
        subject: am ? "ወጪ ውድቅ ተደርጓል — ALKEVA" : "Withdrawal rejected — ALKEVA",
        body: am
          ? `የብር ${fmtEtb(p.amountCents)} ወጪ ጥያቄዎ ውድቅ ተደርጓል፤ ገንዘቡ ወደ መለያዎ ተመልሷል።`
          : `Your withdrawal of ETB ${fmtEtb(p.amountCents)} was rejected; the funds are back in your account.`,
      };
    case "kyc_approved":
      return {
        subject: am ? "መታወቂያዎ ተረጋግጧል — ALKEVA" : "Identity verified — ALKEVA",
        body: am
          ? "የመታወቂያ ማረጋገጫዎ ጸድቋል። አሁን ገቢ ማድረግ እና መገበያየት ይችላሉ።"
          : "Your identity verification is approved. You can now deposit and trade.",
      };
    case "kyc_rejected":
      return {
        subject: am ? "መታወቂያ ውድቅ ተደርጓል — ALKEVA" : "Identity submission rejected — ALKEVA",
        body: am
          ? `የመታወቂያ ማስረጃዎ ውድቅ ተደርጓል።${p.note ? ` ምክንያት፦ ${p.note}` : ""} እባክዎ እንደገና ያስገቡ።`
          : `Your identity document was rejected.${p.note ? ` Reason: ${p.note}` : ""} Please resubmit.`,
      };
    case "account_frozen":
      return {
        subject: am ? "መለያዎ ታግዷል — ALKEVA" : "Account frozen — ALKEVA",
        body: am
          ? `መለያዎ በጊዜያዊነት ታግዷል።${p.reason ? ` ምክንያት፦ ${p.reason}` : ""} ለተጨማሪ መረጃ ድጋፍን ያግኙ።`
          : `Your account has been temporarily frozen.${p.reason ? ` Reason: ${p.reason}` : ""} Contact support for details.`,
      };
    case "account_unfrozen":
      return {
        subject: am ? "መለያዎ ተከፍቷል — ALKEVA" : "Account unfrozen — ALKEVA",
        body: am
          ? "መለያዎ እንደገና ነቅቷል። ሁሉም አገልግሎቶች ተመልሰዋል።"
          : "Your account is active again. All services are restored.",
      };
    case "price_alert": {
      const metal = am ? (METAL_AM[p.asset ?? ""] ?? p.asset) : (METAL_EN[p.asset ?? ""] ?? p.asset);
      const dir = p.direction === "above" ? (am ? "በላይ" : "above") : (am ? "በታች" : "below");
      // Non-advisory by construction: states the crossing, never suggests action.
      return {
        subject: am ? `የዋጋ ማንቂያ፦ ${metal} — ALKEVA` : `Price alert: ${metal} — ALKEVA`,
        body: am
          ? `የ${metal} ዋጋ ከብር ${fmtEtb(p.thresholdCentsPerGram)}/ግ ${dir} ደርሷል። አሁን፦ ብር ${fmtEtb(p.priceCentsPerGram)}/ግ።`
          : `The ${metal} price crossed ${dir} ETB ${fmtEtb(p.thresholdCentsPerGram)}/g. Now: ETB ${fmtEtb(p.priceCentsPerGram)}/g.`,
      };
    }
    case "order_receipt": {
      const metal = am ? (METAL_AM[p.asset ?? ""] ?? p.asset) : (METAL_EN[p.asset ?? ""] ?? p.asset);
      const side = p.side === "buy" ? (am ? "ግዢ" : "Purchase") : (am ? "ሽያጭ" : "Sale");
      return {
        subject: am
          ? `ደረሰኝ ${p.serial ?? ""} — ALKEVA`
          : `Receipt ${p.serial ?? ""} — ALKEVA`,
        body: am
          ? `${side}፦ ${fmtGrams(p.gramsMg)} ግ ${metal}፣ ጠቅላላ ብር ${fmtEtb(p.totalCents)}። ደረሰኝ ቁጥር፦ ${p.serial ?? ""}።`
          : `${side}: ${fmtGrams(p.gramsMg)} g ${metal}, total ETB ${fmtEtb(p.totalCents)}. Receipt number: ${p.serial ?? ""}.`,
      };
    }
    case "password_reset":
      return {
        subject: am ? "የይለፍ ቃል ዳግም ማስጀመሪያ — ALKEVA" : "Reset your password — ALKEVA",
        body: am
          ? "የይለፍ ቃልዎን ዳግም ለማስጀመር ከታች ያለውን አዝራር ይጫኑ። ማገናኛው ለ30 ደቂቃ ብቻ ይሰራል። ይህን ጥያቄ እርስዎ ካላቀረቡ ይህን መልእክት ችላ ይበሉ — ምንም አልተለወጠም።"
          : "Use the button below to set a new password. The link works for 30 minutes only. If you did not request this, ignore this message — nothing has changed.",
        ctaLabel: am ? "የይለፍ ቃል ዳግም አስጀምር" : "Reset password",
        ctaUrl: p.resetUrl,
      };
    case "delivery_requested": {
      const metal = am ? (METAL_AM[p.asset ?? ""] ?? p.asset) : (METAL_EN[p.asset ?? ""] ?? p.asset);
      return {
        subject: am ? "የአቅርቦት ጥያቄ ተመዝግቧል — ALKEVA" : "Delivery request received — ALKEVA",
        body: am
          ? `የ${fmtGrams(p.gramsMg)} ግ ${metal} አቅርቦት ጥያቄዎ ተመዝግቧል። ቡድናችን መርምሮ ያሳውቅዎታል።`
          : `Your request for physical delivery of ${fmtGrams(p.gramsMg)} g of ${metal} has been recorded. Our team will review it and get back to you.`,
      };
    }
    case "delivery_approved": {
      const metal = am ? (METAL_AM[p.asset ?? ""] ?? p.asset) : (METAL_EN[p.asset ?? ""] ?? p.asset);
      return {
        subject: am ? "የአቅርቦት ጥያቄ ጸድቋል — ALKEVA" : "Delivery request approved — ALKEVA",
        body: am
          ? `የ${fmtGrams(p.gramsMg)} ግ ${metal} አቅርቦት ጥያቄዎ ጸድቋል። የመላኪያ ቀን ሲያዝ እናሳውቅዎታለን።`
          : `Your delivery request for ${fmtGrams(p.gramsMg)} g of ${metal} was approved. We will notify you when a delivery date is scheduled.`,
      };
    }
    case "delivery_scheduled": {
      const metal = am ? (METAL_AM[p.asset ?? ""] ?? p.asset) : (METAL_EN[p.asset ?? ""] ?? p.asset);
      return {
        subject: am ? "አቅርቦት ቀን ተይዟል — ALKEVA" : "Delivery scheduled — ALKEVA",
        body: am
          ? `የ${fmtGrams(p.gramsMg)} ግ ${metal} አቅርቦትዎ ለ${p.scheduledFor ?? ""} ተይዟል።`
          : `Your delivery of ${fmtGrams(p.gramsMg)} g of ${metal} is scheduled for ${p.scheduledFor ?? ""}.`,
      };
    }
    case "delivery_rejected": {
      const metal = am ? (METAL_AM[p.asset ?? ""] ?? p.asset) : (METAL_EN[p.asset ?? ""] ?? p.asset);
      return {
        subject: am ? "የአቅርቦት ጥያቄ ውድቅ ተደርጓል — ALKEVA" : "Delivery request declined — ALKEVA",
        body: am
          ? `የ${fmtGrams(p.gramsMg)} ግ ${metal} አቅርቦት ጥያቄዎ ውድቅ ተደርጓል።${p.note ? ` ምክንያት፦ ${p.note}` : ""}`
          : `Your delivery request for ${fmtGrams(p.gramsMg)} g of ${metal} was declined.${p.note ? ` Reason: ${p.note}` : ""}`,
      };
    }
  }
}

export function renderNotification(
  template: NotificationTemplate,
  locale: "am" | "en",
  p: NotificationPayload,
): RenderedEmail {
  const copy = copyFor(template, locale, p);
  return {
    subject: copy.subject,
    text: copy.body + (copy.ctaUrl ? `\n\n${copy.ctaUrl}` : ""),
    html: renderEmailHtml({
      locale,
      heading: copy.subject.replace(/\s+—\s+ALKEVA$/u, ""),
      bodyHtml: `<p style="margin:0">${escapeHtml(copy.body)}</p>`,
      ctaLabel: copy.ctaLabel,
      ctaUrl: copy.ctaUrl,
    }),
  };
}
