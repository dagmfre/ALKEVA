"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  const tc = useTranslations("common");
  return (
    <Card className="mt-6 p-5">
      <p className="mb-4 text-[0.9375rem] text-muted-foreground">{tc("somethingWrong")}</p>
      <Button size="cta" onClick={reset}>
        {tc("retry")}
      </Button>
    </Card>
  );
}
