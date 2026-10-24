export type GeminiErrorKind = "rate_limited" | "invalid_history" | "transient" | "unknown";

const DEFAULT_RETRY_AFTER_SECONDS = 30;

/**
 * Sort a Gemini failure into what the caller should do about it. Everything
 * used to funnel into one 503 "busy" — a quota hit, a poisoned history row and
 * a Render cold-start all looked identical and none recovered.
 */
export function classifyGeminiError(err: unknown): GeminiErrorKind {
  const status =
    typeof (err as { status?: unknown }).status === "number"
      ? (err as { status: number }).status
      : typeof (err as { code?: unknown }).code === "number"
        ? (err as { code: number }).code
        : null;
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  if (status === 429 || /RESOURCE_EXHAUSTED|\b429\b|quota/i.test(msg)) return "rate_limited";
  if (status === 400 || /INVALID_ARGUMENT|\b400\b|signature/i.test(msg)) return "invalid_history";
  if (
    (status !== null && status >= 500) ||
    /UNAVAILABLE|DEADLINE|INTERNAL|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|fetch failed|network|socket|abort/i.test(
      msg,
    )
  ) {
    return "transient";
  }
  return "unknown";
}

/** Best effort at the provider's suggested backoff (RetryInfo / Retry-After style hints). */
export function retryAfterSecondsFrom(err: unknown): number {
  const msg = err instanceof Error ? err.message : String(err);
  const m = /retry(?:-|\s)?(?:after|delay)['":\s]*(\d+)/i.exec(msg);
  const parsed = m ? Number(m[1]) : NaN;
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 300
    ? parsed
    : DEFAULT_RETRY_AFTER_SECONDS;
}
