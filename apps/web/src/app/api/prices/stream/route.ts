/**
 * SSE pass-through for the live price stream.
 *
 * Filesystem routes win over `rewrites()` (which run afterFiles), so this
 * handler shadows the generic /api proxy for exactly one path. It exists
 * because streaming `text/event-stream` through a rewrite is not guaranteed —
 * a Response wrapping the upstream ReadableStream is. The endpoint is public
 * (no cookies involved), so this is a plain pipe.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const base = process.env.API_URL ?? "http://localhost:4000";
  let upstream: Response;
  try {
    upstream = await fetch(`${base}/prices/stream`, {
      cache: "no-store",
      headers: { accept: "text/event-stream" },
    });
  } catch {
    return new Response("upstream unavailable", { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response("upstream unavailable", { status: 502 });
  }
  return new Response(upstream.body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
