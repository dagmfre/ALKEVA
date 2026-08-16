"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { eatStamp } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

interface CredentialRow {
  id: string;
  label: string | null;
  deviceType: string | null;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

interface ProvidersResponse {
  google: boolean;
  webauthn: boolean;
}

/**
 * Passkey management on /account: enroll (with an optional label), list,
 * remove. Hidden entirely when the API has WebAuthn unconfigured or the
 * browser lacks PublicKeyCredential — an absent feature, not a broken one.
 */
export function PasskeysCard({ className }: { className?: string }) {
  const t = useTranslations("account");
  const providers = useResource<ProvidersResponse>("/auth/providers");
  const [revision, setRevision] = useState(0);
  const list = useResource<{ credentials: CredentialRow[] }>(
    providers.data?.webauthn ? "/auth/webauthn/credentials" : null,
    { revision },
  );

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const supported =
    typeof window !== "undefined" && "PublicKeyCredential" in window;
  if (!providers.data?.webauthn || !supported) return null;

  async function enroll() {
    setError(false);
    setBusy(true);
    try {
      const options = await api<PublicKeyCredentialCreationOptionsJSON>(
        "/auth/webauthn/register/options",
        { method: "POST" },
      );
      const response = await startRegistration({ optionsJSON: options });
      await api("/auth/webauthn/register/verify", {
        method: "POST",
        body: JSON.stringify({ response, label: label.trim() || undefined }),
      });
      setEnrollOpen(false);
      setLabel("");
      setRevision((n) => n + 1);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await api(`/auth/webauthn/credentials/${id}`, { method: "DELETE" });
      setRemoving(null);
      setRevision((n) => n + 1);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-base font-medium">{t("passkeys.title")}</h2>
          <p className="text-[0.8125rem] text-muted-foreground">{t("passkeys.body")}</p>
        </div>
        <Button variant="gold" size="sm" onClick={() => setEnrollOpen(true)}>
          {t("passkeys.add")}
        </Button>
      </div>

      {list.loading ? (
        <div className="px-4 py-3">
          <Skeleton className="h-6 w-full" />
        </div>
      ) : (list.data?.credentials.length ?? 0) === 0 ? (
        <p className="px-4 py-3.5 text-[0.9375rem] text-muted-foreground">
          {t("passkeys.empty")}
        </p>
      ) : (
        (list.data?.credentials ?? []).map((c, i, arr) => (
          <div
            key={c.id}
            className={`flex items-center justify-between gap-3 px-4 py-3 ${
              i < arr.length - 1 ? "border-b border-border" : ""
            }`}
          >
            <div className="min-w-0">
              <p className="truncate text-[0.9375rem] font-medium">
                {c.label || t("passkeys.unnamed")}
              </p>
              <p className="font-latin text-[0.8125rem] text-subtle">
                {eatStamp(c.createdAt)}
                {c.lastUsedAt ? ` · ${t("passkeys.lastUsed")} ${eatStamp(c.lastUsedAt)}` : ""}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setRemoving(c.id)}>
              {t("passkeys.remove")}
            </Button>
          </div>
        ))
      )}

      {error && (
        <p className="border-t border-border px-4 py-2.5 text-[0.875rem] text-loss">
          {t("passkeys.failed")}
        </p>
      )}

      {/* Enroll dialog: optional label, then the platform passkey prompt. */}
      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("passkeys.add")}</DialogTitle>
            <DialogDescription>{t("passkeys.addBody")}</DialogDescription>
          </DialogHeader>
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.9375rem] font-medium">{t("passkeys.labelField")}</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={60}
              className="well min-h-12 rounded-md border-input px-3.5 text-base outline-none transition-colors focus:border-gold-400"
            />
          </label>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEnrollOpen(false)}>
              {t("passkeys.cancel")}
            </Button>
            <Button onClick={() => void enroll()} disabled={busy}>
              {t("passkeys.confirmAdd")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Two-step remove — losing a passkey is a lockout risk on that device. */}
      <Dialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("passkeys.removeTitle")}</DialogTitle>
            <DialogDescription>{t("passkeys.removeBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              {t("passkeys.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => removing && void remove(removing)}
            >
              {t("passkeys.remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
