"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type {
  AiChatResponse,
  AiConversationResponse,
  AiConversationsResponse,
} from "@alkeva/shared";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";
import { eatStamp } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

interface Bubble {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Local delivery state: pending while in flight, failed keeps the bubble retryable. */
  status?: "pending" | "failed";
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
 * The chat surface, now multi-thread: every conversation the user has ever had
 * lives in OUR database with no retention window, and this screen exposes that
 * memory — a thread rail (list, switch, delete), with the transcript rendered
 * through the AI SDK's AI Elements components (Conversation / Message /
 * PromptInput) instead of hand-rolled bubbles.
 *
 * The single-thread guarantees survive the rebuild: a failed send never leaves
 * an orphan bubble (Retry / dismiss-to-input), and the disclaimer line does
 * permanent duty — the assistant explains, it never advises.
 */
export function AssistantScreen() {
  const t = useTranslations("assistant");
  const threads = useResource<AiConversationsResponse>("/ai/conversations");

  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);

  // "Prove this transaction" hand-off from a receipt. Read from the URL on the
  // first client render rather than via useSearchParams, which would force the
  // whole route dynamic for a parameter only these effects ever look at.
  const [proveSerial] = useState(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("prove"),
  );
  const proveSent = useRef(false);

  // First load: land on the most recent thread — the "it remembers me" moment.
  useEffect(() => {
    if (bootstrapped || !threads.data) return;
    setBootstrapped(true);
    // A proof hand-off opens its own thread: the question is about one
    // transaction, and burying that answer under an older conversation makes
    // it harder to read back.
    if (proveSerial) return;
    const latest = threads.data.conversations[0];
    if (latest) void openThread(latest.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads.data, bootstrapped, proveSerial]);

  useEffect(() => {
    if (!proveSerial || proveSent.current || !bootstrapped) return;
    proveSent.current = true;
    // Drop the parameter so a refresh doesn't ask the same question twice.
    window.history.replaceState(null, "", window.location.pathname);
    send(t("proveQuestion", { serial: proveSerial }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proveSerial, bootstrapped]);

  async function openThread(id: string) {
    if (busy) return;
    setActiveId(id);
    setTranscriptLoading(true);
    try {
      const res = await api<AiConversationResponse>(`/ai/conversations/${id}`);
      setMessages(res.messages);
    } catch {
      setMessages([]);
    } finally {
      setTranscriptLoading(false);
    }
  }

  /** A fresh conversation row is created server-side on the first send without an id. */
  function newChat() {
    if (busy) return;
    setActiveId(null);
    setMessages([]);
  }

  async function deliver(text: string, bubbleId: string) {
    setBusy(true);
    try {
      const res = await api<AiChatResponse>("/ai/chat", {
        method: "POST",
        body: JSON.stringify({ message: text, conversationId: activeId ?? undefined }),
      });
      setActiveId(res.conversationId);
      setMessages((prev) => [
        ...prev.map((m) =>
          m.id === bubbleId ? { ...m, status: undefined, errorCode: undefined } : m,
        ),
        { id: `reply-${Date.now()}`, role: "assistant" as const, content: res.reply },
      ]);
      threads.reload();
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

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    const bubbleId = `local-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: bubbleId, role: "user", content: trimmed, status: "pending" },
    ]);
    void deliver(trimmed, bubbleId);
  }

  function onSubmit(message: PromptInputMessage) {
    send(message.text ?? "");
  }

  function retry(m: Bubble) {
    if (busy) return;
    setMessages((prev) =>
      prev.map((x) =>
        x.id === m.id ? { ...x, status: "pending" as const, errorCode: undefined } : x,
      ),
    );
    void deliver(m.content, m.id);
  }

  /** Remove the failed bubble and hand its text back to the input. */
  function dismiss(m: Bubble) {
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    setInput((current) => (current.trim().length > 0 ? current : m.content));
  }

  async function confirmDelete() {
    const id = deleteTarget;
    if (!id) return;
    setDeleteTarget(null);
    try {
      await api(`/ai/conversations/${id}`, { method: "DELETE" });
    } finally {
      threads.reload();
      if (id === activeId) newChat();
    }
  }

  const list = threads.data?.conversations ?? [];
  const activeTitle = list.find((c) => c.id === activeId)?.title ?? t("newChat");

  return (
    <div className="mx-auto flex h-[calc(100dvh-180px)] max-w-[72rem] gap-5 lg:h-[calc(100dvh-150px)]">
      {/* ── Thread rail (≥lg) — the long-term memory surface ── */}
      <aside className="hidden w-[260px] flex-none flex-col gap-3 lg:flex">
        <Button variant="outline" size="sm" onClick={newChat} disabled={busy}>
          {t("newChat")}
        </Button>
        <div className="flex-1 space-y-1 overflow-y-auto pe-1">
          {threads.loading ? (
            <>
              <Skeleton className="h-14 rounded-md" />
              <Skeleton className="h-14 rounded-md" />
            </>
          ) : list.length === 0 ? (
            <p className="px-2 pt-2 text-[0.875rem] text-muted-foreground">{t("noThreads")}</p>
          ) : (
            list.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "group relative rounded-md transition-colors",
                  c.id === activeId ? "pill-active" : "hover:bg-card",
                )}
              >
                <button
                  type="button"
                  onClick={() => void openThread(c.id)}
                  disabled={busy}
                  className="w-full min-h-11 px-3 py-2 pe-9 text-start"
                >
                  <span className="block truncate text-[0.9375rem] leading-snug">
                    {c.title || t("newChat")}
                  </span>
                  <span className="font-latin mt-0.5 block text-[0.75rem] text-subtle">
                    {eatStamp(c.lastAt)}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={t("deleteChat")}
                  onClick={() => setDeleteTarget(c.id)}
                  className="absolute end-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded text-subtle opacity-0 transition-opacity hover:text-loss focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path
                      d="M2 3.5h10M5.5 3.5V2.3c0-.4.3-.8.8-.8h1.4c.5 0 .8.4.8.8v1.2m2.3 0-.5 8.2c0 .4-.4.8-.8.8H4.5c-.4 0-.8-.4-.8-.8l-.5-8.2"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ── Chat column ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone thread picker — the rail collapses into a menu. */}
        <div className="flex items-center gap-2 pb-2 lg:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md border border-input px-3 text-start text-[0.9375rem]">
              <span className="truncate">{activeTitle}</span>
              <svg
                width="10"
                height="6"
                viewBox="0 0 10 6"
                fill="none"
                aria-hidden="true"
                className="ms-auto flex-none"
              >
                <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-[50dvh] w-[min(20rem,80vw)]">
              {list.map((c) => (
                <DropdownMenuItem key={c.id} onSelect={() => void openThread(c.id)}>
                  <span className="truncate">{c.title || t("newChat")}</span>
                </DropdownMenuItem>
              ))}
              {list.length === 0 && (
                <p className="px-3 py-2 text-[0.875rem] text-muted-foreground">{t("noThreads")}</p>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={newChat} disabled={busy}>
            {t("newChat")}
          </Button>
        </div>

        <Conversation className="rounded-lg border border-border bg-card">
          <ConversationContent className="gap-5 p-4 lg:p-5">
            {transcriptLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 rounded-lg" />
                <Skeleton className="h-16 rounded-lg" />
              </div>
            ) : messages.length === 0 ? (
              <ConversationEmptyState
                title={t("emptyTitle")}
                description={`${t("emptyBody")} ${t("languageNote")}`}
              />
            ) : (
              messages.map((m) => (
                <div key={m.id} className="flex flex-col gap-1.5">
                  <Message
                    from={m.role}
                    className={cn(
                      m.status === "pending" && "opacity-70",
                      m.status === "failed" &&
                        "[&>div]:rounded-lg [&>div]:border [&>div]:border-destructive/50",
                    )}
                  >
                    <MessageContent>
                      <MessageResponse>{m.content}</MessageResponse>
                    </MessageContent>
                  </Message>
                  {m.status === "failed" && (
                    <div className="ms-auto flex items-center gap-3 text-[0.8125rem]">
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
              <Message from="assistant">
                <MessageContent>
                  <Shimmer as="span" className="text-[0.9375rem]">
                    {t("thinking")}
                  </Shimmer>
                </MessageContent>
              </Message>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {messages.length === 0 && !transcriptLoading && (
          <Suggestions className="pt-3">
            {(
              [
                "examplePrice",
                "exampleWhyMoved",
                "exampleProve",
                "examplePortfolio",
                "exampleFees",
              ] as const
            ).map((key) => (
              <Suggestion key={key} suggestion={t(key)} onClick={(s) => send(s)} />
            ))}
          </Suggestions>
        )}

        <div className="pt-3">
          <PromptInput onSubmit={onSubmit}>
            <PromptInputBody>
              <PromptInputTextarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t("inputPlaceholder")}
                maxLength={2000}
                disabled={busy}
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools />
              <PromptInputSubmit
                status={busy ? "submitted" : "ready"}
                disabled={busy || input.trim().length === 0}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
        <p className="pt-2 text-center text-[0.75rem] text-subtle">{t("disclaimer")}</p>
      </div>

      {/* Delete confirmation — destructive, so it is a Dialog, never a hover-click. */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-[24rem]">
          <DialogHeader>
            <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("deleteConfirmBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button variant="destructive" size="sm" onClick={() => void confirmDelete()}>
              {t("deleteChat")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
