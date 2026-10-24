import { cn } from "@/lib/utils";

/**
 * The non-normal states this app can be in, as a full-width strip. Caution is
 * the cool platinum family, never amber — amber would read as the champagne
 * gold that means "asset / action".
 */
export function SystemBanner({
  tone,
  children,
  className,
}: {
  tone: "caution" | "critical" | "info";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "mb-3 flex items-start gap-2.5 rounded-[0.75rem] border px-3.5 py-2.5 text-[0.84375rem] leading-relaxed",
        tone === "caution" && "border-platinum-400/25 bg-platinum-400/8 text-platinum-400",
        tone === "critical" && "border-loss/30 bg-loss/8 text-loss",
        tone === "info" && "border-gain/30 bg-gain/10 text-gain",
        className,
      )}
    >
      <span aria-hidden="true">{tone === "caution" ? "◑" : tone === "info" ? "✓" : "▲"}</span>
      <span>{children}</span>
    </div>
  );
}
