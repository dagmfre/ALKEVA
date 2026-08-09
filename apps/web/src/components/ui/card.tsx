import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A surface, not a container with opinions.
 *
 * Re-tokenised from shadcn's default: no shadow (depth here is surface +
 * hairline, `design/design.md` §3) and no built-in padding, because ALKEVA
 * cards vary between 16px and 20px and several hold edge-to-edge divided
 * lists. Callers set their own padding.
 */
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "rounded-lg border border-border bg-card text-card-foreground",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="card-title"
      className={cn("text-[1.125rem] font-semibold", className)}
      {...props}
    />
  );
}

/** A key/value row inside a card — the fee breakdown and holding rows. */
function CardRow({
  label,
  children,
  className,
  divided = false,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  divided?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 py-2.5",
        divided && "border-b border-border",
        className,
      )}
    >
      <span className="text-[0.9375rem] text-muted-foreground">{label}</span>
      <span className="text-[0.9375rem] font-medium">{children}</span>
    </div>
  );
}

export { Card, CardTitle, CardRow };
