"use client";

import { authInit } from "@/lib/api";

/**
 * Server-Sent Events over fetch, for the Telegram Mini App: EventSource cannot
 * send an Authorization header, and the Mini App has no cookies. Parses the
 * standard `event:` / `data:` framing (comments and ids ignored). Returns a
 * close function. `onError` fires once when the stream ends for any reason —
 * the caller decides whether and when to reconnect.
 */
export function openAuthedStream(
  path: string,
  handlers: {
    onOpen?: () => void;
    onEvent: (event: string, data: string) => void;
    onError: (status: number | null) => void;
  },
): () => void {
  const controller = new AbortController();
  let ended = false;
  const end = (status: number | null) => {
    if (ended) return;
    ended = true;
    if (!controller.signal.aborted) handlers.onError(status);
  };

  void (async () => {
    let res: Response;
    try {
      const auth = authInit();
      res = await fetch(`/api${path}`, {
        credentials: auth.credentials,
        headers: { Accept: "text/event-stream", ...auth.headers },
        signal: controller.signal,
        cache: "no-store",
      });
    } catch {
      end(null);
      return;
    }
    if (!res.ok || !res.body) {
      end(res.status);
      return;
    }
    handlers.onOpen?.();
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    let event = "message";
    let data: string[] = [];
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).replace(/\r$/, "");
          buffer = buffer.slice(nl + 1);
          if (line === "") {
            if (data.length > 0) handlers.onEvent(event, data.join("\n"));
            event = "message";
            data = [];
          } else if (line.startsWith("event:")) {
            event = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            data.push(line.slice(5).replace(/^ /, ""));
          }
          // `:` comments (heartbeats) and `id:`/`retry:` are ignored.
        }
        // A runaway line without newlines is not SSE; stop holding it.
        if (buffer.length > 64_000) break;
      }
    } catch {
      /* aborted or dropped */
    }
    end(null);
  })();

  return () => controller.abort();
}
