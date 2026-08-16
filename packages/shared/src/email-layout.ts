/**
 * The one branded email frame every ALKEVA mail renders inside.
 *
 * Deliberately a LIGHT layout: dark-mode email rendering is a client lottery
 * (Gmail inverts, Outlook doesn't, Apple Mail sometimes), so the body is white
 * with a charcoal header band and the client's brand gold (#d4a017 — an
 * email-safe hex, not OKLCH) as the single accent. Table-based and fully
 * inline-styled because email clients ignore stylesheets.
 */

export interface EmailLayoutInput {
  locale: "am" | "en";
  heading: string;
  /** Already-escaped HTML for the body (use escapeHtml for interpolations). */
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

/** Minimal HTML escaping for user-derived strings interpolated into emails. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const FONT_STACK =
  "'Noto Sans Ethiopic','Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function renderEmailHtml({ locale, heading, bodyHtml, ctaLabel, ctaUrl }: EmailLayoutInput): string {
  const am = locale === "am";
  const footer = am
    ? "ይህ መልእክት ከALKEVA በራስ-ሰር ተልኳል። እባክዎ አይመልሱ።"
    : "This message was sent automatically by ALKEVA. Please do not reply.";

  const cta =
    ctaLabel && ctaUrl
      ? `<tr><td style="padding:8px 32px 28px 32px">
           <a href="${ctaUrl}"
              style="display:inline-block;background:#d4a017;color:#161207;text-decoration:none;
                     font-weight:600;font-size:15px;padding:13px 28px;border-radius:10px;font-family:${FONT_STACK}">
             ${escapeHtml(ctaLabel)}
           </a>
         </td></tr>`
      : "";

  return `<!doctype html>
<html lang="${locale}">
<body style="margin:0;padding:0;background:#f4f2ee">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ee;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0"
             style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;
                    border:1px solid #e5e0d5">
        <tr>
          <td style="background:#181818;padding:20px 32px;border-bottom:3px solid #d4a017">
            <span style="font-family:${FONT_STACK};font-size:18px;font-weight:700;letter-spacing:0.04em;color:#f2f2f2">
              ALKEVA
            </span>
            <span style="font-family:${FONT_STACK};font-size:11px;color:#a5a5a5;padding-left:8px">
              XAU · XPT
            </span>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 4px 32px">
            <h1 style="margin:0;font-family:${FONT_STACK};font-size:19px;line-height:1.45;color:#181818">
              ${escapeHtml(heading)}
            </h1>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 32px 24px 32px;font-family:${FONT_STACK};font-size:15px;line-height:1.7;color:#3a3a3a">
            ${bodyHtml}
          </td>
        </tr>
        ${cta}
        <tr>
          <td style="padding:16px 32px 22px 32px;border-top:1px solid #eee9dd">
            <p style="margin:0;font-family:${FONT_STACK};font-size:12px;line-height:1.7;color:#8a8578">
              ${footer}
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
