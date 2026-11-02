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
  | "delivery_rejected"
  // Phase 10
  | "delivery_delivered"
  | "payout_requested"
  | "order_in_review"
  | "order_rejected"
  | "deposit_reversed"
  | "fayda_verified"
  | "new_sign_in"
  | "passkey_added"
  | "staff_alert"
  // Codes: emailed directly, NEVER stored as a notification row (the payload
  // carries the secret, exactly like the password-reset link).
  | "email_code"
  | "withdrawal_code";

export type NotificationCategory = "alerts" | "money" | "security";

/**
 * Which preference switch governs a template. Security notices (new sign-in,
 * passkey added, freezes) can turn off browser push but never email — the
 * owner must hear about them.
 */
export function notificationCategory(template: NotificationTemplate): NotificationCategory {
  switch (template) {
    case "price_alert":
      return "alerts";
    case "new_sign_in":
    case "passkey_added":
    case "account_frozen":
    case "account_unfrozen":
    case "fayda_verified":
    case "deposit_reversed":
      return "security";
    default:
      return "money";
  }
}

/** Templates that carry a secret and therefore must never be persisted. */
export const SECRET_TEMPLATES: readonly NotificationTemplate[] = [
  "password_reset",
  "email_code",
  "withdrawal_code",
];

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
    case "delivery_delivered": {
      const metal = am ? (METAL_AM[p.asset ?? ""] ?? p.asset) : (METAL_EN[p.asset ?? ""] ?? p.asset);
      return {
        subject: am ? "አቅርቦት ተጠናቋል — ALKEVA" : "Delivery completed — ALKEVA",
        body: am
          ? `${fmtGrams(p.gramsMg)} ግ ${metal} ለእርስዎ ተረክቧል፤ ከመለያዎ ተቀንሷል።`
          : `${fmtGrams(p.gramsMg)} g of ${metal} has been handed over to you and deducted from your holdings.`,
      };
    }
    case "payout_requested":
      return {
        subject: am ? "የወጪ ጥያቄ ደርሷል — ALKEVA" : "Withdrawal request received — ALKEVA",
        body: am
          ? `የብር ${fmtEtb(p.amountCents)} ወጪ ጥያቄዎ ደርሷል፤ የፋይናንስ ቡድናችን ይገመግመዋል። ገንዘቡ እስከዚያው ተይዟል።`
          : `Your withdrawal of ETB ${fmtEtb(p.amountCents)} was received and is waiting for our finance team. The amount is held until then.`,
      };
    case "order_in_review": {
      const metal = am ? (METAL_AM[p.asset ?? ""] ?? p.asset) : (METAL_EN[p.asset ?? ""] ?? p.asset);
      return {
        subject: am ? "ትዕዛዝዎ በግምገማ ላይ ነው — ALKEVA" : "Your order is under review — ALKEVA",
        body: am
          ? `የ${fmtGrams(p.gramsMg)} ግ ${metal} (ብር ${fmtEtb(p.totalCents)}) ትዕዛዝዎ የተጣጣሚነት ግምገማ ይጠብቃል። ውሳኔው ሲሰጥ እናሳውቅዎታለን።`
          : `Your order for ${fmtGrams(p.gramsMg)} g of ${metal} (ETB ${fmtEtb(p.totalCents)}) is waiting for a compliance review. We will tell you the outcome.`,
      };
    }
    case "order_rejected":
      return {
        subject: am ? "ትዕዛዝዎ አልተፈጸመም — ALKEVA" : "Your order was not completed — ALKEVA",
        body: am
          ? `በግምገማ ላይ የነበረው ትዕዛዝዎ አልተፈጸመም${p.reason ? ` (${p.reason})` : ""}። ምንም ገንዘብ አልተንቀሳቀሰም።`
          : `Your order under review was not completed${p.reason ? ` (${p.reason})` : ""}. No money moved.`,
      };
    case "deposit_reversed":
      return {
        subject: am ? "ገቢ ተመልሷል — ALKEVA" : "Deposit reversed — ALKEVA",
        body: am
          ? `የብር ${fmtEtb(p.amountCents)} ገቢዎ በክፍያ አቅራቢው ተመልሷል። መለያዎ ለግምገማ ታግዷል፤ ድጋፍን ያግኙ።`
          : `Your deposit of ETB ${fmtEtb(p.amountCents)} was reversed by the payment provider. Your account is on hold for review; please contact support.`,
      };
    case "fayda_verified":
      return {
        subject: am ? "ማንነትዎ በፋይዳ ተረጋግጧል — ALKEVA" : "Identity verified with Fayda — ALKEVA",
        body: am
          ? `ማንነትዎ በብሔራዊ መታወቂያ (ፋይዳ) ተረጋግጧል${p.legalName ? ` (${p.legalName})` : ""}። አሁን ገቢ ማድረግ፣ መገበያየት እና ወጪ ማድረግ ይችላሉ።`
          : `Your identity was verified with your national ID (Fayda)${p.legalName ? ` as ${p.legalName}` : ""}. You can now deposit, trade and withdraw.`,
      };
    case "new_sign_in":
      return {
        subject: am ? "አዲስ መግቢያ — ALKEVA" : "New sign-in to your account — ALKEVA",
        body: am
          ? `መለያዎ ከአዲስ መሳሪያ ተከፍቷል፦ ${p.device ?? ""}${p.ip ? ` (${p.ip})` : ""}። እርስዎ ካልሆኑ ወዲያውኑ በመለያ ገጽ "ከሁሉም መሳሪያዎች ውጣ" ይጫኑ እና ድጋፍን ያግኙ።`
          : `Your account was signed in from a new device: ${p.device ?? ""}${p.ip ? ` (${p.ip})` : ""}. If this wasn't you, choose "Sign out everywhere" on your Account page now and contact support.`,
      };
    case "passkey_added":
      return {
        subject: am ? "አዲስ የይለፍ ቁልፍ ተጨምሯል — ALKEVA" : "A passkey was added — ALKEVA",
        body: am
          ? `ለመለያዎ አዲስ የይለፍ ቁልፍ (passkey) ተጨምሯል${p.label ? `፦ ${p.label}` : ""}። እርስዎ ካልሆኑ በመለያ ገጽ ያስወግዱት እና ድጋፍን ያግኙ።`
          : `A new passkey was added to your account${p.label ? `: ${p.label}` : ""}. If this wasn't you, remove it on your Account page and contact support.`,
      };
    case "staff_alert":
      return {
        subject: am ? `የሰራተኛ ማስጠንቀቂያ፦ ${p.kind ?? ""} — ALKEVA` : `Staff alert: ${p.kind ?? ""} — ALKEVA`,
        body: p.message ?? "",
      };
    case "email_code":
      return {
        subject: am ? `የማረጋገጫ ኮድዎ ${p.code ?? ""} — ALKEVA` : `Your verification code is ${p.code ?? ""} — ALKEVA`,
        body: am
          ? `የኢሜይል ማረጋገጫ ኮድዎ ${p.code ?? ""} ነው። ለ${p.minutes ?? "10"} ደቂቃ ይሰራል። ለማንም አያጋሩ — ALKEVA በጭራሽ አይጠይቅዎትም።`
          : `Your email verification code is ${p.code ?? ""}. It works for ${p.minutes ?? "10"} minutes. Never share it — ALKEVA will never ask you for it.`,
      };
    case "withdrawal_code":
      return {
        subject: am ? "ወጪን ያረጋግጡ — ALKEVA" : "Confirm your withdrawal — ALKEVA",
        body: am
          ? `የብር ${fmtEtb(p.amountCents)} ወጪ ወደ ${p.accountNumber ?? ""} ለማረጋገጥ ይህን ኮድ ያስገቡ፦ ${p.code ?? ""}። ለ${p.minutes ?? "10"} ደቂቃ ይሰራል። ይህን ጥያቄ እርስዎ ካላቀረቡ ኮዱን አያስገቡ እና የይለፍ ቃልዎን ይቀይሩ።`
          : `To confirm the withdrawal of ETB ${fmtEtb(p.amountCents)} to ${p.accountNumber ?? ""}, enter this code: ${p.code ?? ""}. It works for ${p.minutes ?? "10"} minutes. If you did not ask for this, do not enter the code and change your password.`,
      };
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
