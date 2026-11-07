import type { Metadata } from "next";
import { HandoffScreen } from "@/components/telegram/handoff-screen";

// The ticket lives in the fragment; keep this page out of every index and
// send no Referer anywhere from it.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function Page() {
  return <HandoffScreen />;
}
