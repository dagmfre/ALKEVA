import type { MetalAsset, OrderSide } from "@alkeva/shared";

import { TradeWorkspace } from "@/components/trade/trade-workspace";

/**
 * The trading route. Reached from the desktop rail, or from any Buy button on
 * a wide screen; on a phone the same state machine opens as a bottom sheet
 * instead, so this page is normally only seen on a desk — but it still lays
 * itself out in one column if a phone lands here directly.
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
