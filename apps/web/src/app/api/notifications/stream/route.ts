/**
 * SSE pass-through for the signed-in user's live notices (dev; in production
 * Caddy routes /api/* straight to the API with buffering off). Unlike the
 * public price stream this one is authenticated, so the browser's cookies are
 * forwarded to the API as-is.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const base = process.env.API_URL ?? "http://localhost:4000";
  let upstream: Response;
  try {
    upstream = await fetch(`${base}/notifications/stream`, {
      cache: "no-store",
      headers: {
        accept: "text/event-stream",
        cookie: req.headers.get("cookie") ?? "",
      },
      signal: req.signal,
    });
  } catch {
    return new Response("upstream unavailable", { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response(null, { status: upstream.status === 401 ? 401 : 502 });
  }
  return new Response(upstream.body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
