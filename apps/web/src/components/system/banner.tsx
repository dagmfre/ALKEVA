import { cn } from "@/lib/utils";

/**
 * The two non-normal states this app can be in.
 *
 * There is no amber/yellow variant anywhere: it would collide with the brand
 * gold and dilute the one signal meaning "asset / action". Caution is built
 * from the cool platinum family instead (`design/design.md` §1).
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
        "mb-3 flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-[0.9375rem]",
        tone === "caution" && "border-border bg-popover text-platinum-400",
        tone === "critical" && "border-loss/40 bg-loss/[0.13] text-loss",
        tone === "info" && "border-gain/40 bg-gain/[0.1] text-gain",
        className,
      )}
    >
      <span aria-hidden="true">{tone === "caution" ? "◑" : tone === "info" ? "✓" : "▲"}</span>
      <span>{children}</span>
    </div>
  );
}
