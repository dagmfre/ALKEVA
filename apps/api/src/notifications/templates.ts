/**
 * Notification copy, both locales. Deterministic templates — the LLM never
 * writes a notification (design doc §8: "the LLM phrases; thresholds trigger"
 * applies to chat, and even there alerts are templated). Amharic drafted by
 * the developer; Dagmfre reviews per the translation working rule.
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
  | "order_receipt";

export type NotificationPayload = Record<string, string>;

interface Rendered {
  subject: string;
  body: string;
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

export function renderNotification(
  template: NotificationTemplate,
  locale: "am" | "en",
  p: NotificationPayload,
): Rendered {
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
  }
}
