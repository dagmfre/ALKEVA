import { PriceProvider } from "@/components/market/price-provider";
import { BottomNav } from "@/components/shell/bottom-nav";
import { MobileHeader } from "@/components/shell/mobile-header";
import { Sidebar } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { TradeSheet } from "@/components/trade/trade-sheet";
import { TradeSheetProvider } from "@/components/trade/trade-sheet-context";

/**
 * The authenticated shell — one responsive system, two compositions.
 *
 * ≥1024px it is a trading terminal (the Tradeo composition): a full-width
 * global header carrying the brand block, the live market strip and the
 * utility cluster, with the fixed rail and the content column beneath it.
 * Below 1024px it is a phone app: a compact header, a single column, and a
 * tab bar under the thumb. The same screens render both — the desktop view is
 * a real desktop layout, never the phone column centred on a wide canvas.
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

        <div className="flex min-h-0 flex-1">
          <Sidebar />

          <main className="min-w-0 flex-1 px-4 pb-[calc(4rem+env(safe-area-inset-bottom)+1.5rem)] pt-3.5 lg:px-7 lg:pb-7 lg:pt-5">
            <div className="mx-auto w-full max-w-[1400px]">{children}</div>
          </main>
        </div>

        <BottomNav />
        <TradeSheet />
      </div>
      </PriceProvider>
    </TradeSheetProvider>
  );
}
