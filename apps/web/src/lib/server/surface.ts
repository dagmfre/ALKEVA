import { headers } from "next/headers";
import { isTelegramHost } from "@/lib/surface-host";

/** Server components: is this render for the Telegram Mini App host? */
export async function isTelegramRequest(): Promise<boolean> {
  const h = await headers();
  return isTelegramHost((name) => h.get(name));
}
