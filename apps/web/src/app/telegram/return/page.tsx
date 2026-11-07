import { Suspense } from "react";
import type { Metadata } from "next";
import { TelegramReturnScreen } from "@/components/telegram/telegram-return-screen";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** useSearchParams requires a Suspense boundary in the app router. */
export default function Page() {
  return (
    <Suspense>
      <TelegramReturnScreen />
    </Suspense>
  );
}
