import type { MetalAsset, OrderSide } from "@alkeva/shared";

import { TradeWorkspace } from "@/components/trade/trade-workspace";

/**
 * The trading terminal, on every screen size: the Trade tab opens it on a
 * desk and on a phone. Buy/Sell buttons elsewhere may still open the phone
 * sheet so the price behind them stays visible.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ asset?: string; side?: string }>;
}) {
  const { asset, side } = await searchParams;
  return (
    <TradeWorkspace
      initialAsset={(asset === "XPT" ? "XPT" : "XAU") as MetalAsset}
      initialSide={(side === "sell" ? "sell" : "buy") as OrderSide}
    />
  );
}
