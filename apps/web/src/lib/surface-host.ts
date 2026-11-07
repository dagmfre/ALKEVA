/**
 * Is this request for the Telegram Mini App host (tg.allkeva.com)?
 *
 * Production: Caddy's Mini App site block sets `X-Alkeva-Surface: telegram`
 * on every request it forwards, and the main site block DELETES any copy a
 * client sent — so the header cannot be forged from a browser. Development
 * has no Caddy: a `tg.localhost` host stands in, never in production.
 *
 * Pure (no imports) so the middleware and server components share it.
 */
export function isTelegramHost(get: (name: string) => string | null): boolean {
  if (get("x-alkeva-surface") === "telegram") return true;
  if (process.env.NODE_ENV !== "production") {
    const host = (get("host") ?? "").toLowerCase();
    return host === "tg.localhost" || host.startsWith("tg.localhost:");
  }
  return false;
}
