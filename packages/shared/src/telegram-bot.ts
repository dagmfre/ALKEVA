/**
 * Minimal Telegram Bot API client (Phase 11), shared by the API (webhook
 * replies) and the worker (notification delivery). Uses the platform fetch
 * with a hard timeout. The bot token is part of every request URL, so URLs
 * are NEVER logged and error text never echoes the request — only Telegram's
 * own `description`.
 *
 * Messages are sent as plain text with no parse_mode: nothing taken from a
 * payload or a user's name can ever be interpreted as markup.
 */

export type TelegramSendOutcome =
  | { ok: true; result: unknown }
  | {
      ok: false;
      /** blocked = 403 (bot blocked / user deactivated) — stop messaging this chat. */
      kind: "blocked" | "rate_limited" | "bad_request" | "transient";
      retryAfterSec?: number;
      description: string;
    };

export interface InlineKeyboard {
  inline_keyboard: Array<
    Array<{ text: string; web_app?: { url: string }; url?: string }>
  >;
}

export class TelegramBotApi {
  constructor(
    private readonly token: string,
    private readonly opts: { testEnv?: boolean; timeoutMs?: number } = {},
  ) {}

  get configured(): boolean {
    return this.token.length > 0;
  }

  async call(method: string, params: Record<string, unknown>): Promise<TelegramSendOutcome> {
    if (!this.configured) return { ok: false, kind: "bad_request", description: "bot token not set" };
    const url = `https://api.telegram.org/bot${this.token}/${this.opts.testEnv ? "test/" : ""}${method}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 10_000),
      });
    } catch {
      return { ok: false, kind: "transient", description: "network error or timeout" };
    }
    let body: {
      ok?: boolean;
      result?: unknown;
      description?: string;
      error_code?: number;
      parameters?: { retry_after?: number };
    } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      return { ok: false, kind: "transient", description: `HTTP ${res.status} (non-JSON)` };
    }
    if (body.ok === true) return { ok: true, result: body.result };
    const description = String(body.description ?? `HTTP ${res.status}`).slice(0, 300);
    const code = body.error_code ?? res.status;
    if (code === 429) {
      return {
        ok: false,
        kind: "rate_limited",
        retryAfterSec: Math.max(1, Math.min(3600, Number(body.parameters?.retry_after ?? 5))),
        description,
      };
    }
    if (code === 403) return { ok: false, kind: "blocked", description };
    if (code >= 500) return { ok: false, kind: "transient", description };
    return { ok: false, kind: "bad_request", description };
  }

  sendMessage(
    chatId: string | number | bigint,
    text: string,
    replyMarkup?: InlineKeyboard,
  ): Promise<TelegramSendOutcome> {
    return this.call("sendMessage", {
      chat_id: chatId.toString(),
      text: text.slice(0, 4096),
      link_preview_options: { is_disabled: true },
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  }
}

/** One "Open ALKEVA" button that launches the Mini App on a given screen. */
export function openAppKeyboard(label: string, miniAppOrigin: string, path = "/"): InlineKeyboard {
  const safePath = path.startsWith("/") && !path.startsWith("//") ? path : "/";
  return { inline_keyboard: [[{ text: label, web_app: { url: `${miniAppOrigin}${safePath}` } }]] };
}
