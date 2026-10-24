"use client";

import { useTranslations } from "next-intl";
import { Download, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

/**
 * The compliance exports destination: the AML export beside the rules it
 * documents, one row of two equal panels. The download itself is the API's
 * `/admin/compliance/export.csv` (roles: administrator, compliance), streamed
 * through the cookie proxy.
 */
export function AdminComplianceScreen() {
  const t = useTranslations("admin");

  return (
    <div className="flex flex-col gap-3">
      <h1 className="sr-only">{t("nav.compliance")}</h1>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel aria-label={t("compliance.exportTitle")}>
          <PanelHeader title={t("compliance.exportTitle")} />
          <PanelBody className="flex flex-col items-start gap-4">
            <p className="max-w-[40rem] text-[0.875rem] leading-relaxed text-muted-foreground">
              {t("compliance.exportBody")}
            </p>
            <Button variant="gold" size="sm" className="mt-auto" asChild>
              <a href="/api/admin/compliance/export.csv" download>
                <Download />
                {t("compliance.exportButton")}
              </a>
            </Button>
          </PanelBody>
        </Panel>

        <Panel aria-label={t("compliance.rulesTitle")}>
          <PanelHeader
            title={t("compliance.rulesTitle")}
            action={<ShieldCheck className="size-4 text-gold-400" aria-hidden="true" />}
          />
          <PanelBody>
            <p className="max-w-[40rem] text-[0.875rem] leading-relaxed text-muted-foreground">
              {t("compliance.rulesBody")}
            </p>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
