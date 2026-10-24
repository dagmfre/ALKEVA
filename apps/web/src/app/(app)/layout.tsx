import { PriceProvider } from "@/components/market/price-provider";
import { BottomNav } from "@/components/shell/bottom-nav";
import { MobileHeader, TopBar } from "@/components/shell/top-bar";
import { TradeSheet } from "@/components/trade/trade-sheet";
import { TradeSheetProvider } from "@/components/trade/trade-sheet-context";

/**
 * The authenticated shell: the V2 tab bar on a desk, a deep header and the
 * V2 bottom bar on a phone. Content runs full width with 16px gutters up to
 * 1680px, and `main` is a flex column so a screen can make its last row take
 * the remaining height instead of ending in empty page.
 *
 * TradeSheetProvider and PriceProvider stay OUTERMOST: the price store owns
 * the app's single SSE connection and its staleness ratchet, and remounting
 * it would reset both.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TradeSheetProvider>
      <PriceProvider>
        <div className="flex min-h-dvh flex-col">
          <TopBar />
          <MobileHeader />
          <main className="mx-auto flex w-full max-w-[1680px] min-w-0 flex-1 flex-col px-4 pt-4 pb-[calc(4.5rem+env(safe-area-inset-bottom)+1rem)] lg:pb-5">
            {children}
          </main>
          <BottomNav />
          <TradeSheet />
        </div>
      </PriceProvider>
    </TradeSheetProvider>
  );
}
