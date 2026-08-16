"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

/**
 * The compliance exports destination. The AML CSV used to be a link buried at
 * the foot of the audit page — a regulator-facing artifact deserves its own
 * nav entry. The download itself is the API's `/admin/compliance/export.csv`
 * (roles: administrator, compliance), streamed through the cookie proxy.
 */
export function AdminComplianceScreen() {
  const t = useTranslations("admin");

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold">{t("nav.compliance")}</h1>

      <section className="max-w-[40rem] rounded-lg border border-border bg-card p-5">
        <h2 className="text-[1.0625rem] font-semibold">{t("compliance.exportTitle")}</h2>
        <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted-foreground">
          {t("compliance.exportBody")}
        </p>
        <Button variant="outline" className="mt-4" asChild>
          <a href="/api/admin/compliance/export.csv" download>
            {t("compliance.exportButton")}
          </a>
        </Button>
      </section>

      <section className="max-w-[40rem] rounded-lg border border-border bg-card p-5">
        <h2 className="text-[1.0625rem] font-semibold">{t("compliance.rulesTitle")}</h2>
        <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted-foreground">
          {t("compliance.rulesBody")}
        </p>
      </section>
    </div>
  );
}
