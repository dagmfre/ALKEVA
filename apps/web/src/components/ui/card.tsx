import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A bare panel surface for one-off compositions (auth, legal). Screens use
 * `Panel`; this is the surface without the header vocabulary. No padding.
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
      className={cn("text-[1.0625rem] font-bold", className)}
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
      <span className="text-[0.875rem] text-muted-foreground">{label}</span>
      <span className="tnum text-[0.875rem] font-medium">{children}</span>
    </div>
  );
}

export { Card, CardTitle, CardRow };
