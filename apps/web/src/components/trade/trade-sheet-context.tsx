"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { MetalAsset, OrderSide } from "@alkeva/shared";

interface TradeSheetState {
  isOpen: boolean;
  asset: MetalAsset;
  side: OrderSide;
  open: (asset?: MetalAsset, side?: OrderSide) => void;
  close: () => void;
  /**
   * Bumped whenever money moved. Screens pass it to useResource so a settled
   * order invalidates balances, portfolio and history at once — without a
   * global store and without every screen polling.
   */
  revision: number;
  settled: () => void;
}

const Ctx = createContext<TradeSheetState | null>(null);

export function TradeSheetProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [asset, setAsset] = useState<MetalAsset>("XAU");
  const [side, setSide] = useState<OrderSide>("buy");
  const [revision, setRevision] = useState(0);

  const open = useCallback((nextAsset?: MetalAsset, nextSide?: OrderSide) => {
    if (nextAsset) setAsset(nextAsset);
    if (nextSide) setSide(nextSide);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);
  const settled = useCallback(() => setRevision((n) => n + 1), []);

  const value = useMemo(
    () => ({ isOpen, asset, side, open, close, revision, settled }),
    [isOpen, asset, side, open, close, revision, settled],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTradeSheet(): TradeSheetState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTradeSheet must be used inside TradeSheetProvider");
  return ctx;
}
