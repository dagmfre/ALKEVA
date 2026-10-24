"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { NavIcon, isActive, useNav } from "@/components/shell/nav-items";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";

/** The one field look for the money forms: panel-2 surface, champagne focus ring. */
export const fieldCls =
  "h-11 w-full rounded-md border border-border bg-panel-2 px-3.5 text-[0.9375rem] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-subtle hover:border-input focus:border-gold-500 focus:shadow-[0_0_0_3px_oklch(0.717_0.098_73.3/0.18)] disabled:opacity-50";

/**
 * Wallet sub-navigation: Deposit · Withdraw · Identity check as one segmented
 * track of links, so the three money doors read as one place.
 */
export function WalletNav() {
  const pathname = usePathname();
  const { wallet } = useNav();
  return (
    <nav
      aria-label={wallet.map((w) => w.label).join(" · ")}
      className="flex w-full gap-0.5 overflow-x-auto rounded-[0.75rem] border border-border bg-panel-2 p-[3px] [scrollbar-width:none] sm:w-fit"
    >
      {wallet.map((w) => {
        const on = isActive(pathname, w.href);
        return (
          <Link
            key={w.key}
            href={w.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex h-9 flex-1 items-center justify-center gap-2 rounded-[0.5625rem] px-3.5 text-[0.8125rem] font-semibold whitespace-nowrap transition-colors sm:flex-none",
              on
                ? "bg-raised text-foreground shadow-(--shadow-thumb) [&_svg]:text-gold-400"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <NavIcon name={w.key} size={16} />
            {w.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The large amount input with a currency suffix and optional quick chips. */
export function AmountField({
  value,
  onChange,
  unit,
  disabled,
  label,
  chips,
  foot,
}: {
  value: string;
  onChange: (v: string) => void;
  unit: string;
  disabled?: boolean;
  label: string;
  chips?: string[];
  foot?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="data-label" htmlFor="amount-field">
        {label}
      </label>
      <div className="flex h-16 items-center gap-3 rounded-[0.75rem] border border-border bg-panel-2 px-4 transition-[border-color,box-shadow] focus-within:border-gold-500 focus-within:shadow-[0_0_0_3px_oklch(0.717_0.098_73.3/0.18)]">
        <input
          id="amount-field"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0.00"
          disabled={disabled}
          className="tnum w-full min-w-0 flex-1 bg-transparent text-[1.625rem] font-semibold tracking-[-0.02em] outline-none placeholder:text-subtle"
        />
        <span className="text-[0.9375rem] font-medium text-muted-foreground">{unit}</span>
      </div>
      {chips && (
        <div className="grid grid-cols-4 gap-1.5">
          {chips.map((v) => (
            <button
              key={v}
              type="button"
              disabled={disabled}
              onClick={() => onChange(v)}
              className={cn(
                "tnum h-[1.875rem] rounded-full border text-[0.75rem] font-medium transition-colors",
                value === v
                  ? "border-gold-400/45 bg-gold-400/8 text-gold-300"
                  : "border-input text-muted-foreground hover:border-white/25 hover:text-foreground",
              )}
            >
              {Number(v).toLocaleString("en-US")}
            </button>
          ))}
        </div>
      )}
      {foot && <span className="text-[0.75rem] text-subtle">{foot}</span>}
    </div>
  );
}

/** Numbered steps — "how it works" blocks. */
export function Steps({ items, title }: { items: string[]; title?: string }) {
  return (
    <div className="flex flex-col gap-3">
      {title && <span className="text-[0.8125rem] font-bold">{title}</span>}
      <ol className="flex flex-col gap-2.5">
        {items.map((step, i) => (
          <li key={step} className="flex gap-3 text-[0.8125rem] leading-snug">
            <span className="tnum grid size-5 flex-none place-items-center rounded-full bg-raised text-[0.6875rem] font-semibold text-gold-300">
              {i + 1}
            </span>
            <span className="text-muted-foreground">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Shown in place of a money form while identity is unverified. */
export function KycGate({ title, body, cta }: { title: string; body: string; cta: string }) {
  return (
    <Panel className="items-start justify-center gap-3 p-6">
      <span className="grid size-11 place-items-center rounded-full bg-gold-400/12 text-gold-300">
        <ShieldCheck className="size-5" />
      </span>
      <h2 className="text-[1.0625rem] font-bold">{title}</h2>
      <p className="max-w-md text-[0.875rem] leading-relaxed text-muted-foreground">{body}</p>
      <Button asChild>
        <Link href="/kyc">{cta}</Link>
      </Button>
    </Panel>
  );
}
