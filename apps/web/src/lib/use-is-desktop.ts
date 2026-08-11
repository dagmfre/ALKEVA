"use client";

import { useEffect, useState } from "react";

/** The one breakpoint that changes behaviour, not just layout: rail vs tab bar. */
export const DESKTOP_QUERY = "(min-width: 1024px)";

/**
 * True at ≥1024px, and only after mount.
 *
 * Layout is done in CSS — this exists for the handful of places where the two
 * compositions genuinely *behave* differently: on a phone Trade is a sheet
 * over the page you were reading, on a desk it is a route with the chart
 * beside the ticket. Defaulting to false keeps server and first client render
 * identical, so nothing hydrates into a mismatch.
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return isDesktop;
}
