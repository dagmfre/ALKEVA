import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Manrope, Noto_Sans_Ethiopic } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import Script from "next/script";
import { Toaster } from "sonner";
import { TelegramGate } from "@/components/telegram/telegram-gate";
import { isTelegramRequest } from "@/lib/server/surface";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  weight: ["400", "500", "600"],
});
const ethiopic = Noto_Sans_Ethiopic({
  subsets: ["ethiopic", "latin"],
  variable: "--font-ethiopic",
});

export const metadata: Metadata = {
  title: "ALKEVA",
  description: "Digital precious metals for Ethiopia",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#060607",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  // Decided on the server from a header only Caddy can set (lib/surface-host).
  const telegram = await isTelegramRequest();

  return (
    // suppressHydrationWarning: on the Mini App host telegram-web-app.js
    // writes its CSS variables (--tg-viewport-height…) onto <html> before
    // React hydrates. It covers this element's own attributes only.
    <html lang={locale} data-surface={telegram ? "telegram" : "web"} suppressHydrationWarning={telegram}>
      <body className={`${manrope.variable} ${jetbrains.variable} ${ethiopic.variable} min-h-dvh`}>
        {telegram ? (
          // Telegram's own bridge, loaded ONLY on the Mini App host. It must
          // run before the app so window.Telegram.WebApp exists at hydration.
          <Script src="https://telegram.org/js/telegram-web-app.js?64" strategy="beforeInteractive" />
        ) : null}
        <NextIntlClientProvider messages={messages}>
          {telegram ? <TelegramGate>{children}</TelegramGate> : children}
          <Toaster
            position="top-center"
            toastOptions={{
              style: {
                background: "var(--raised)",
                border: "1px solid var(--input)",
                borderRadius: "12px",
                boxShadow: "var(--shadow-pop)",
                color: "var(--foreground)",
                fontFamily: "var(--font-manrope), var(--font-ethiopic), sans-serif",
              },
            }}
          />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
