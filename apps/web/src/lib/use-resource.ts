"use client";

import { useCallback, useEffect, useState } from "react";

import { api, ApiError } from "@/lib/api";

export interface Resource<T> {
  data: T | null;
  error: ApiError | null;
  /** True only on the first load — a refresh must not blank the screen. */
  loading: boolean;
  reload: () => void;
}

/**
 * One small fetch hook instead of a data library.
 *
 * Two rules it exists to enforce:
 *  - a background refresh never clears `data`, so a 30-second price tick can
 *    never flash the whole screen back to skeletons;
 *  - `revision` lets a settled order invalidate every screen at once without
 *    a global store.
 */
export function useResource<T>(
  path: string | null,
  opts: { intervalMs?: number; revision?: number } = {},
): Resource<T> {
  const { intervalMs, revision = 0 } = opts;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;

    async function run() {
      try {
        const next = await api<T>(path as string);
        if (cancelled) return;
        setData(next);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err : new ApiError(0, "generic", err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    if (!intervalMs) return () => {
      cancelled = true;
    };

    const id = setInterval(() => void run(), intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [path, intervalMs, tick, revision]);

  return { data, error, loading, reload };
}
