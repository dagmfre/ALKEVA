"use client";

import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";

/**
 * The one labelled input the auth screens use — sign in, register, and password
 * reset. It lived as an identical private copy in two files before this; the
 * reveal toggle would have had to be built twice, and the two copies would have
 * drifted the first time one was touched.
 *
 * Passing `type="password"` gets a reveal control automatically. That is the
 * right default here: every password box in the product wants it, and making it
 * opt-in guarantees someone forgets. Typing a password blind on a phone, into a
 * platform that holds your savings, is where sign-ups are abandoned.
 *
 * What the toggle is careful about:
 *
 *   - `type="button"`. A bare <button> inside a <form> defaults to submit, so
 *     revealing the password would post the form.
 *   - The input keeps its `autoComplete` value across the swap, so password
 *     managers still fill and save it.
 *   - The visible state is never the initial state, and it is not persisted.
 *     A revealed password must not survive a navigation or a remount.
 *   - `aria-pressed` plus a label that names the *action* ("Show password" /
 *     "Hide password"), announced to screen readers; the icon alone carries no
 *     accessible name.
 *   - The control sits outside the label's text but inside the field, and the
 *     input reserves right padding so a long password never runs under it.
 */
export function Field({
  label,
  name,
  type,
  className,
  ...props
}: { label: string; name: string } & React.ComponentProps<"input">) {
  const t = useTranslations("auth");
  const [revealed, setRevealed] = React.useState(false);

  const isPassword = type === "password";
  const inputType = isPassword && revealed ? "text" : type;

  return (
    <label className="flex flex-col gap-1.5">
      <span className="data-label">{label}</span>
      <span className="relative flex items-center">
        <input
          name={name}
          type={inputType}
          {...props}
          className={
            className ??
            `h-12 w-full rounded-md border border-border bg-panel-2 px-3.5 text-[0.9375rem] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-subtle hover:border-input focus:border-gold-500 focus:shadow-[0_0_0_3px_oklch(0.717_0.098_73.3/0.18)] ${
              isPassword ? "pe-12" : ""
            }`
          }
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-pressed={revealed}
            aria-label={revealed ? t("hidePassword") : t("showPassword")}
            title={revealed ? t("hidePassword") : t("showPassword")}
            // 44px target: the same minimum the rest of the product holds to.
            className="absolute end-1 flex size-10 items-center justify-center rounded-[0.5625rem] text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
          >
            {revealed ? (
              <EyeOff className="size-[1.125rem]" aria-hidden="true" />
            ) : (
              <Eye className="size-[1.125rem]" aria-hidden="true" />
            )}
          </button>
        )}
      </span>
    </label>
  );
}
