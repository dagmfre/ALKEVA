"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

/** Submit → review → verified, with the current step marked. */
export function KycTimeline({ stage }: { stage: "submit" | "review" | "verified" }) {
  const t = useTranslations("kyc");
  const steps = [
    { k: "submit", label: t("stepSubmit"), body: t("stepSubmitBody") },
    { k: "review", label: t("stepReview"), body: t("stepReviewBody") },
    { k: "verified", label: t("stepVerified"), body: t("stepVerifiedBody") },
  ] as const;
  const at = steps.findIndex((s) => s.k === stage);

  return (
    <ol className="flex flex-col">
      {steps.map((s, i) => {
        const done = i < at || stage === "verified";
        const current = i === at && stage !== "verified";
        return (
          <li key={s.k} className="relative flex gap-3 pb-4 last:pb-0">
            {i < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={cn("absolute start-[0.6875rem] top-6 bottom-0 w-px", done ? "bg-gold-400/60" : "bg-border")}
              />
            )}
            <span
              className={cn(
                "tnum relative grid size-[1.375rem] flex-none place-items-center rounded-full text-[0.6875rem] font-semibold",
                done && "bg-gold-400 text-primary-foreground",
                current && "bg-gold-400/15 text-gold-300 ring-1 ring-gold-400/60",
                !done && !current && "bg-raised text-subtle",
              )}
            >
              {done ? "✓" : i + 1}
            </span>
            <span className="flex flex-col gap-0.5">
              <span className={cn("text-[0.8125rem] font-semibold", !done && !current && "text-muted-foreground")}>
                {s.label}
              </span>
              <span className="text-[0.75rem] leading-snug text-subtle">{s.body}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
