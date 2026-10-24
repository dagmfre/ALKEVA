import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Manrope, Noto_Sans_Ethiopic } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Toaster } from "sonner";
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

  return (
    <html lang={locale}>
      <body className={`${manrope.variable} ${jetbrains.variable} ${ethiopic.variable} min-h-dvh`}>
        <NextIntlClientProvider messages={messages}>
          {children}
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
