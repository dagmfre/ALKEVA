import { Wordmark } from "@/components/brand/mark";
import { BottomNav } from "@/components/shell/bottom-nav";
import { LocaleToggle } from "@/components/shell/locale-toggle";
import { TradeSheet } from "@/components/trade/trade-sheet";
import { TradeSheetProvider } from "@/components/trade/trade-sheet-context";

/**
 * The authenticated shell.
 *
 * One column, 480px max, centred on wider screens: this is a mobile-web
 * product and the desktop view is the same composition rather than a second
 * design (`design/design.md` §6). Content scrolls under the fixed tab bar with
 * bottom padding equal to the bar height plus the safe-area inset.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TradeSheetProvider>
      <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col">
        <header className="flex items-center justify-between px-4 pb-3 pt-4">
          <Wordmark />
          <LocaleToggle />
        </header>

        <main className="flex-1 px-4 pb-[calc(4rem+env(safe-area-inset-bottom)+1.5rem)]">
          {children}
        </main>

        <BottomNav />
        <TradeSheet />
      </div>
    </TradeSheetProvider>
  );
}
