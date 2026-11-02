"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { MailWarning, ShieldAlert } from "lucide-react";

import { useAppData } from "@/components/shell/app-data";

/**
 * What still stands between a customer and their money, said once at the top
 * of every screen: confirm your email, then verify your identity with Fayda.
 * Both are hard gates on the API (email_unverified / kyc_required); this
 * banner just makes sure nobody discovers them by being refused.
 */
export function AccountGateBanner() {
  const t = useTranslations("gate");
  const pathname = usePathname();
  const me = useAppData().me.data;
  if (!me || me.role !== "user") return null;

  if (!me.emailVerified) {
    return (
      <Banner
        icon={<MailWarning className="size-4.5 flex-none" aria-hidden="true" />}
        text={t("email")}
        cta={t("emailCta")}
        href={`/verify-email?next=${encodeURIComponent(pathname)}`}
      />
    );
  }
  if (me.kycTier < 1 && pathname !== "/kyc") {
    return (
      <Banner
        icon={<ShieldAlert className="size-4.5 flex-none" aria-hidden="true" />}
        text={t("identity")}
        cta={t("identityCta")}
        href="/kyc"
      />
    );
  }
  return null;
}

function Banner({ icon, text, cta, href }: { icon: React.ReactNode; text: string; cta: string; href: string }) {
  return (
    <div
      role="status"
      className="mb-3 flex flex-col gap-2 rounded-lg border border-gold-400/30 bg-gold-400/8 px-4 py-3 text-[0.875rem] sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="flex items-center gap-2.5 text-foreground">
        <span className="text-gold-400">{icon}</span>
        {text}
      </span>
      <Link href={href} className="font-semibold whitespace-nowrap text-gold-400 underline-offset-4 hover:underline">
        {cta} →
      </Link>
    </div>
  );
}
