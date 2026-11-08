"use client";

import type { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { requestTelegramSignOut } from "@/lib/telegram/session";
import { isTelegramSurface } from "@/lib/telegram/webapp";

/**
 * One sign-out for every menu and button.
 *
 * On the website: revoke this session, drop the cookies, go to /login.
 * Inside Telegram there is no /login — the Telegram account itself signs the
 * person in — so the Mini App's gate takes over and asks which of the two
 * real choices they mean: end this session, or also disconnect Telegram from
 * the account so a different one can be used.
 */
export async function signOut(router: ReturnType<typeof useRouter>): Promise<void> {
  if (isTelegramSurface()) {
    requestTelegramSignOut();
    return;
  }
  try {
    await api("/auth/logout", { method: "POST" });
  } finally {
    router.replace("/login");
    router.refresh();
  }
}
