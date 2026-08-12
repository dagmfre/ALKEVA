"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { AiChatResponse, AiConversationResponse } from "@alkeva/shared";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

/**
 * The chat surface. One disclaimer line does permanent duty: the assistant
 * explains, it never advises — matching the server-side guardrail so the UI
 * never promises more than the model is allowed to do.
 */
export function AssistantScreen() {
  const t = useTranslations("assistant");
  const history = useResource<AiConversationResponse>("/ai/conversation");
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    if (history.data && !hydrated.current) {
      hydrated.current = true;
      setMessages(history.data.messages);
      setConversationId(history.data.conversationId);
    }
  }, [history.data]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setInput("");
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: "user", content: text }]);
    setBusy(true);
    try {
      const res = await api<AiChatResponse>("/ai/chat", {
        method: "POST",
        body: JSON.stringify({ message: text, conversationId: conversationId ?? undefined }),
      });
      setConversationId(res.conversationId);
      setMessages((prev) => [
        ...prev,
        { id: `reply-${Date.now()}`, role: "assistant", content: res.reply },
      ]);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "generic";
      setError(
        code === "ai_unconfigured" || code === "ai_unavailable" ? code : "generic",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-180px)] max-w-[44rem] flex-col lg:h-[calc(100dvh-150px)]">
      <div className="flex-1 space-y-3 overflow-y-auto pb-4">
        {history.loading ? (
          <Skeleton className="h-24 rounded-lg" />
        ) : messages.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-5">
            <h1 className="text-lg font-semibold">{t("emptyTitle")}</h1>
            <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted-foreground">
              {t("emptyBody")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["examplePrice", "examplePortfolio", "exampleFees"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setInput(t(key))}
                  className="well rounded-full px-3.5 py-2 text-[0.875rem] text-muted-foreground hover:text-foreground"
                >
                  {t(key)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-lg px-4 py-3 text-[0.9375rem] leading-relaxed",
                m.role === "user"
                  ? "ms-auto bg-popover"
                  : "me-auto border border-border bg-card",
              )}
            >
              {m.content}
            </div>
          ))
        )}
        {busy && (
          <div className="me-auto flex max-w-[85%] items-center gap-2 rounded-lg border border-border bg-card px-4 py-3">
            <span className="size-1.5 animate-pulse rounded-full bg-gold-400" />
            <span className="text-[0.9375rem] text-muted-foreground">{t("thinking")}</span>
          </div>
        )}
        {error && (
          <p className="me-auto max-w-[85%] rounded-lg border border-destructive/40 bg-card px-4 py-3 text-[0.9375rem] text-loss">
            {t(`errors.${error}` as never)}
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={(e) => void send(e)} className="flex gap-2 border-t border-border pt-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("inputPlaceholder")}
          maxLength={2000}
          className="well min-h-12 w-full rounded-md px-3.5 text-base outline-none"
          disabled={busy}
        />
        <Button type="submit" variant="flat" disabled={busy || input.trim().length === 0}>
          {t("send")}
        </Button>
      </form>
      <p className="pt-2 text-center text-[0.75rem] text-subtle">{t("disclaimer")}</p>
    </div>
  );
}
