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
  /** Local delivery state: pending while in flight, failed keeps the bubble retryable. */
  status?: "pending" | "failed";
  /** The error code attached to a failed bubble — rendered inline under it. */
  errorCode?: string;
}

/** API failure → assistant error key. Any 429 (Gemini quota OR our own throttle) is "slow down", not "broken". */
function errorCodeFor(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return "ai_rate_limited";
    if (err.code === "ai_unconfigured" || err.code === "ai_unavailable") return err.code;
  }
  return "generic";
}

/**
 * The chat surface. One disclaimer line does permanent duty: the assistant
 * explains, it never advises — matching the server-side guardrail so the UI
 * never promises more than the model is allowed to do.
 *
 * A failed send never leaves an orphan bubble: the bubble is marked failed
 * with a Retry and a dismiss (which puts the text back in the input), so the
 * history the user sees always matches what the server actually stored.
 */
export function AssistantScreen() {
  const t = useTranslations("assistant");
  const history = useResource<AiConversationResponse>("/ai/conversation");
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
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

  async function deliver(text: string, bubbleId: string) {
    setBusy(true);
    try {
      const res = await api<AiChatResponse>("/ai/chat", {
        method: "POST",
        body: JSON.stringify({ message: text, conversationId: conversationId ?? undefined }),
      });
      setConversationId(res.conversationId);
      setMessages((prev) => [
        ...prev.map((m) =>
          m.id === bubbleId ? { ...m, status: undefined, errorCode: undefined } : m,
        ),
        { id: `reply-${Date.now()}`, role: "assistant" as const, content: res.reply },
      ]);
    } catch (err) {
      const code = errorCodeFor(err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === bubbleId ? { ...m, status: "failed" as const, errorCode: code } : m,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const bubbleId = `local-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: bubbleId, role: "user", content: text, status: "pending" },
    ]);
    await deliver(text, bubbleId);
  }

  function retry(m: Message) {
    if (busy) return;
    setMessages((prev) =>
      prev.map((x) =>
        x.id === m.id ? { ...x, status: "pending" as const, errorCode: undefined } : x,
      ),
    );
    void deliver(m.content, m.id);
  }

  /** Remove the failed bubble and hand its text back to the input. */
  function dismiss(m: Message) {
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    setInput((current) => (current.trim().length > 0 ? current : m.content));
  }

  /** A fresh conversation row is created server-side on the first send without an id. */
  function newChat() {
    if (busy) return;
    setMessages([]);
    setConversationId(null);
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-180px)] max-w-[44rem] flex-col lg:h-[calc(100dvh-150px)]">
      {messages.length > 0 && (
        <div className="flex justify-end pb-2">
          <button
            type="button"
            onClick={newChat}
            disabled={busy}
            className="rounded-full border border-input px-3.5 py-1.5 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            {t("newChat")}
          </button>
        </div>
      )}

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
            <div key={m.id} className={cn("flex flex-col gap-1.5", m.role === "user" && "items-end")}>
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-lg px-4 py-3 text-[0.9375rem] leading-relaxed",
                  m.role === "user"
                    ? "ms-auto bg-popover"
                    : "me-auto border border-border bg-card",
                  m.status === "pending" && "opacity-70",
                  m.status === "failed" && "border border-destructive/50",
                )}
              >
                {m.content}
              </div>
              {m.status === "failed" && (
                <div className="flex max-w-[85%] items-center gap-3 text-[0.8125rem]">
                  <span className="text-loss">
                    ✕ {t("failed")}
                    {m.errorCode ? ` — ${t(`errors.${m.errorCode}` as never)}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => retry(m)}
                    disabled={busy}
                    className="font-semibold text-gold-400 hover:text-gold-300 disabled:opacity-50"
                  >
                    {t("retry")}
                  </button>
                  <button
                    type="button"
                    onClick={() => dismiss(m)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {t("dismiss")}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
        {busy && (
          <div className="me-auto flex max-w-[85%] items-center gap-2 rounded-lg border border-border bg-card px-4 py-3">
            <span className="size-1.5 animate-pulse rounded-full bg-gold-400" />
            <span className="text-[0.9375rem] text-muted-foreground">{t("thinking")}</span>
          </div>
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
