"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Consistent table chrome for every console screen. */
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
    <div className={cn("overflow-x-auto rounded-lg border border-border bg-card", className)}>
      <table className="w-full min-w-[640px] text-[0.9375rem]">
        <thead>
          <tr className="border-b border-border text-start">
            {headers.map((h) => (
              <th
                key={h}
                className="px-4 py-2.5 text-start text-[0.8125rem] font-medium text-muted-foreground"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("border-t border-border px-4 py-2.5 align-middle", className)}>{children}</td>;
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
