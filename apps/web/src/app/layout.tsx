import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Ethiopic } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
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
  themeColor: "#0c0905",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className={`${inter.variable} ${ethiopic.variable} min-h-dvh`}>
        <NextIntlClientProvider messages={messages}>
          {children}
          <Toaster
            position="top-center"
            toastOptions={{
              style: {
                background: "var(--popover)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
                fontFamily: "var(--font-sans)",
              },
            }}
          />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
