import { BottomNav } from "@/components/shell/bottom-nav";
import { MobileHeader } from "@/components/shell/mobile-header";
import { Sidebar } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { TradeSheet } from "@/components/trade/trade-sheet";
import { TradeSheetProvider } from "@/components/trade/trade-sheet-context";

/**
 * The authenticated shell — one responsive system, two compositions
 * (`design/design.md` §6).
 *
 * ≥1024px it is a workspace: a fixed rail on the inline-start edge, a top bar
 * carrying the live ticker, and a content column that lays itself out on a
 * 12-column grid. Below that it is a phone app: a compact header, a single
 * column, and a tab bar under the thumb. The same screens render both — the
 * desktop view is a real desktop layout, never the phone column centred on a
 * wide canvas.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TradeSheetProvider>
      <div className="flex min-h-dvh">
        <Sidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />

          <MobileHeader />

          <main className="flex-1 px-4 pb-[calc(4rem+env(safe-area-inset-bottom)+1.5rem)] pt-3.5 lg:px-8 lg:pb-8 lg:pt-6">
            <div className="mx-auto w-full max-w-[1400px]">{children}</div>
          </main>
        </div>

        <BottomNav />
        <TradeSheet />
      </div>
    </TradeSheetProvider>
  );
}
