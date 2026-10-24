"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { ResponsiveContainer } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Coin, Panel, PanelHeader, StatStrip } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * The console's shared vocabulary (design v2). Every queue is one Panel: a
 * header carrying the title and its one control (filter, search, export), the
 * table as the elastic region, and an in-panel empty state — so a queue never
 * renders as a floating table with a heading stranded above it.
 */

export type AdminHeader = string | { label: string; end?: boolean };

/**
 * A queue table inside a Panel. Screens still supply raw <tr> rows; the tbody
 * selectors style them (hairline rows, the barely-there v2 hover), so the
 * primitives' look reaches every queue without per-row classes.
 */
export function AdminTable({
  title,
  hint,
  action,
  intro,
  headers,
  children,
  loading = false,
  empty,
  footer,
  minWidth = 640,
  className,
}: {
  title?: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  /** One explanatory paragraph under the header (what this queue means). */
  intro?: React.ReactNode;
  headers: AdminHeader[];
  children?: React.ReactNode;
  loading?: boolean;
  /** Rendered instead of the table when set (the queue is empty). */
  empty?: string | null;
  footer?: React.ReactNode;
  minWidth?: number;
  className?: string;
}) {
  return (
    <Panel aria-label={typeof title === "string" ? title : undefined} className={className}>
      {title !== undefined && <PanelHeader title={title} hint={hint} action={action} />}
      {intro && (
        <p className="max-w-[52rem] px-[1.125rem] pb-3.5 text-[0.84375rem] leading-relaxed text-muted-foreground">
          {intro}
        </p>
      )}
      <div className={cn("flex min-h-0 flex-1 flex-col", title !== undefined && "border-t border-border")}>
        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-9 rounded-md" />
            <Skeleton className="h-9 rounded-md" />
            <Skeleton className="h-9 rounded-md" />
          </div>
        ) : empty ? (
          <p className="px-4 py-12 text-center text-[0.875rem] text-muted-foreground">{empty}</p>
        ) : (
          <Table style={{ minWidth }}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {headers.map((h, i) => {
                  const label = typeof h === "string" ? h : h.label;
                  const end = typeof h !== "string" && h.end;
                  return (
                    <TableHead key={`${label}-${i}`} className={end ? "text-end" : undefined}>
                      {label}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody className="[&_tr]:border-b [&_tr]:border-border [&_tr:last-child]:border-0 [&_tr]:transition-colors [&_tr:hover]:bg-white/[0.025]">
              {children}
            </TableBody>
          </Table>
        )}
      </div>
      {footer && (
        <div className="flex flex-none items-center justify-center border-t border-border px-4 py-3">
          {footer}
        </div>
      )}
    </Panel>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <TableCell className={className}>{children}</TableCell>;
}

/**
 * A row of short figures across the full width — queue counters, window
 * totals, balances. Cells grow to share the row on a desk and scroll
 * sideways on a phone; they never stack into a column of lonely numbers.
 */
export function AdminStrip({
  label,
  children,
  className,
}: {
  label?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      data-panel=""
      aria-label={label}
      className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}
    >
      <StatStrip className="min-h-[5.25rem] lg:[&>*]:flex-auto">{children}</StatStrip>
    </section>
  );
}

/** Search box for a panel header: submit applies the query, as before. */
export function AdminSearch({
  value,
  onChange,
  onSubmit,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
}) {
  return (
    <form
      role="search"
      className="relative w-full sm:w-[22rem]"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <Search
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
        aria-hidden="true"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 ps-9 text-[0.875rem]"
      />
    </form>
  );
}

/** Status words as dot badges. The word always carries the state too. */
const STATUS_TONE: Record<string, "gold" | "platinum" | "gain" | "loss" | "muted"> = {
  pending: "gold",
  requested: "gold",
  review: "gold",
  reviewing: "gold",
  processing: "platinum",
  approved: "platinum",
  scheduled: "platinum",
  created: "muted",
  settled: "gain",
  active: "gain",
  rejected: "loss",
  frozen: "loss",
};

export function StatusBadge({ status, label }: { status: string; label: React.ReactNode }) {
  return (
    <Badge variant={STATUS_TONE[status] ?? "muted"} dot>
      {label}
    </Badge>
  );
}

/** Metal identity in a cell: the coin plus its name. */
export function MetalLabel({ asset, label }: { asset: "XAU" | "XPT"; label: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Coin metal={asset} size="sm" />
      {label}
    </span>
  );
}

/**
 * A chart that fills its panel's elastic region. ChartContainer takes a fixed
 * height; inside a stretched grid row the chart should take whatever the row
 * gives it instead, with `min` as the floor on small screens.
 */
export function FillChart({
  min = 220,
  children,
  className,
}: {
  min?: number;
  children: React.ReactElement;
  className?: string;
}) {
  return (
    <div className={cn("relative w-full flex-1 text-xs", className)} style={{ minHeight: min }}>
      <div className="absolute inset-0">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * Two-step action button: first press arms it ("Confirm?"), second press
 * fires the request. Staff actions move money or freeze people — none of
 * them should be one accidental click away, and none need a modal. Armed,
 * the button fills: champagne for a go, the loss tint for a refusal.
 */
export function AdminAction({
  path,
  body,
  label,
  tone = "default",
  onDone,
}: {
  path: string;
  body?: unknown;
  label: string;
  tone?: "default" | "danger";
  onDone: (error: string | null) => void;
}) {
  const t = useTranslations("admin");
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function fire() {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 4000);
      return;
    }
    setArmed(false);
    setBusy(true);
    try {
      await api(path, { method: "POST", body: JSON.stringify(body ?? {}) });
      onDone(null);
    } catch (err) {
      onDone(err instanceof ApiError ? err.code : "generic");
    } finally {
      setBusy(false);
    }
  }

  const variant = tone === "danger" ? "destructive" : armed ? "default" : "gold";

  return (
    <Button
      variant={variant}
      size="sm"
      disabled={busy}
      onClick={() => void fire()}
      className={cn(tone === "danger" && armed && "border-loss/60 bg-loss/20")}
    >
      {busy ? "…" : armed ? t("confirmAction") : label}
    </Button>
  );
}
