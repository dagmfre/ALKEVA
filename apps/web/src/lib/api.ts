"use client";

/**
 * The single authenticated-fetch helper (reused by every later phase).
 * All requests go to /api/* — the Next.js rewrite proxies them to the
 * NestJS API, so cookies stay first-party. On a 401 it attempts one
 * silent refresh, then retries the original request once.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: unknown,
  ) {
    super(code);
  }
}

async function rawFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res = await rawFetch(path, init);

  if (res.status === 401 && path !== "/auth/refresh" && path !== "/auth/login") {
    const refreshed = await rawFetch("/auth/refresh", { method: "POST" });
    if (refreshed.ok) {
      res = await rawFetch(path, init);
    }
  }

  if (!res.ok) {
    let body: unknown = null;
    let code = `http_${res.status}`;
    try {
      body = await res.json();
      const message = (body as { message?: unknown })?.message;
      if (typeof message === "string") code = message;
    } catch {
      /* non-JSON body */
    }
    throw new ApiError(res.status, code, body);
  }

  return (await res.json()) as T;
}
