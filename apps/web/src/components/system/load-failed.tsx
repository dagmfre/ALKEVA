"use client";

import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

/**
 * What a screen shows when its data could not be loaded — never a skeleton
 * that pulses forever (the phone "blank Portfolio" report).
 */
export function LoadFailed({ onRetry }: { onRetry: () => void }) {
  const tc = useTranslations("common");
  return (
    <Panel className="items-center justify-center gap-3 p-10 text-center">
      <p className="max-w-sm text-[0.9375rem] text-muted-foreground">{tc("loadFailed")}</p>
      <Button variant="outline" onClick={onRetry}>
        <RefreshCw className="size-4" aria-hidden="true" />
        {tc("retry")}
      </Button>
    </Panel>
  );
}
