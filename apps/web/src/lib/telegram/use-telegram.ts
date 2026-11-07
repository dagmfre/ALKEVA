"use client";

import { useSyncExternalStore } from "react";
import { isTelegramSurface } from "@/lib/telegram/webapp";

const subscribe = () => () => {};

/**
 * The surface as a hook, hydration-safe: the server render (and the first
 * client render) answer false, then the client re-renders with the truth —
 * no mismatch warning, and the surface never changes afterwards.
 */
export function useIsTelegram(): boolean {
  return useSyncExternalStore(subscribe, isTelegramSurface, () => false);
}
