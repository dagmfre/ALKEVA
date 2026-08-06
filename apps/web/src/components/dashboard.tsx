"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { MeResponse, PriceLatestResponse } from "@alkeva/shared";
import { api, ApiError } from "@/lib/api";
import { LocaleSwitcher } from "./locale-switcher";

const REFRESH_MS = 30_000;

function formatEtbPerGram(cents: string): string {
  const birr = Number(BigInt(cents)) / 100;
  return new Intl.NumberFormat("en-ET", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(birr);
}

function PriceCard({
  label,
  price,
  t,
}: {
  label: string;
  price: PriceLatestResponse | null;
  t: ReturnType<typeof useTranslations<"dashboard">>;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
      <div className="text-sm text-neutral-400">{label}</div>
      {price ? (
        <>
          <div className="mt-1 text-3xl font-bold tabular-nums text-gold-500">
            {formatEtbPerGram(price.etbCentsPerGram)}
            <span className="ml-2 text-base font-normal text-neutral-400">
              ETB {t("perGram")}
            </span>
          </div>
          <div className="mt-2 text-xs text-neutral-500">
            {t("updated")}{" "}
            {new Date(price.at).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
            {" · "}
            {t("source")}: {price.source}
          </div>
          {price.stale && (
            <div className="mt-2 rounded-lg bg-amber-950 px-3 py-1.5 text-xs text-amber-300">
              {t("stale")}
            </div>
          )}
        </>
      ) : (
        <div className="mt-2 h-9 w-40 animate-pulse rounded bg-neutral-800" />
      )}
    </div>
  );
}

export function Dashboard() {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [gold, setGold] = useState<PriceLatestResponse | null>(null);
  const [platinum, setPlatinum] = useState<PriceLatestResponse | null>(null);

  const loadPrices = useCallback(async () => {
    try {
      const [xau, xpt] = await Promise.all([
        api<PriceLatestResponse>("/prices/latest?asset=XAU"),
        api<PriceLatestResponse>("/prices/latest?asset=XPT"),
      ]);
      setGold(xau);
      setPlatinum(xpt);
    } catch {
      /* keep last shown prices; health surfaces feed issues */
    }
  }, []);

  useEffect(() => {
    api<MeResponse>("/auth/me")
      .then(setMe)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) router.replace("/login");
      });
  }, [router]);

  useEffect(() => {
    void loadPrices();
    const id = setInterval(() => void loadPrices(), REFRESH_MS);
    return () => clearInterval(id);
  }, [loadPrices]);

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-6 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gold-500">{tc("appName")}</h1>
        <LocaleSwitcher />
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <PriceCard label={t("gold")} price={gold} t={t} />
        <PriceCard label={t("platinum")} price={platinum} t={t} />
      </section>

      <footer className="mt-auto flex items-center justify-between border-t border-neutral-800 pt-4 text-sm text-neutral-400">
        <span>
          {me ? `${t("signedInAs")} ${me.fullName}` : tc("loading")}
        </span>
        <button onClick={logout} className="underline-offset-4 hover:underline">
          {tc("logout")}
        </button>
      </footer>
    </main>
  );
}
