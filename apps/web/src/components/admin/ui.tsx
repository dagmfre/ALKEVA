"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
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
 * Consistent table chrome for every console screen — a thin wrapper over the
 * shadcn Table primitives so all nine queues share one treatment. Screens
 * still supply raw <tr> rows; the tbody selectors style them, so the wrapper
 * upgrade needed no per-screen edits.
 */
export function AdminTable({
  headers,
  children,
  className,
}: {
  headers: string[];
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}>
      <Table className="min-w-[640px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {headers.map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody className="[&_tr]:border-b [&_tr]:border-border [&_tr:last-child]:border-0 [&_tr]:transition-colors [&_tr:hover]:bg-popover/50">
          {children}
        </TableBody>
      </Table>
    </div>
  );
}

export function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <TableCell className={className}>{children}</TableCell>;
}

/**
 * Two-step action button: first press arms it ("Confirm?"), second press
 * fires the request. Staff actions move money or freeze people — none of
 * them should be one accidental click away, and none need a modal.
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

  return (
    <Button
      variant={tone === "danger" ? "outline" : "soft"}
      size="sm"
      disabled={busy}
      onClick={() => void fire()}
      className={cn(tone === "danger" && "text-loss", armed && "border-gold-500")}
    >
      {busy ? "…" : armed ? t("confirmAction") : label}
    </Button>
  );
}
