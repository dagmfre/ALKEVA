import { createHash, timingSafeEqual } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import { Redis } from "ioredis";
import { telegramChats, type Db } from "@alkeva/db";
import { openAppKeyboard, TelegramBotApi, type Env, type Locale } from "@alkeva/shared";
import { DB, ENV, REDIS } from "../core/core.module.js";
import { PricesService } from "../prices/prices.service.js";
import { BOT_COPY } from "./bot-copy.js";
import { localeFromTelegram, TelegramAuthService } from "./telegram-auth.service.js";

/** The parts of a Telegram Update this bot reads. Everything else is ignored. */
interface TgUpdate {
  update_id?: unknown;
  message?: {
    text?: unknown;
    chat?: { id?: unknown; type?: unknown };
    from?: { id?: unknown; is_bot?: unknown; language_code?: unknown };
  };
}

/** Deep-link payloads /start may carry — anything else opens the home screen. */
const START_PATHS: Record<string, string> = {
  trade: "/trade",
  portfolio: "/portfolio",
  history: "/history",
  wallet: "/wallet",
  deposit: "/deposit",
  kyc: "/kyc",
};

/** Replies per chat per minute; beyond this the bot goes quiet (abuse guard). */
const CHAT_REPLY_LIMIT = 20;

/**
 * The bot (Phase 11). Deliberately small: it opens the Mini App, quotes the
 * public live price, explains itself, and lets a person disconnect Telegram.
 * It never moves money, never states a balance in chat, never sends a code,
 * and never acts on a group chat. Webhook requests are authenticated by the
 * secret token Telegram echoes (X-Telegram-Bot-Api-Secret-Token) — and, at
 * the edge, by Telegram's published IP ranges (Caddyfile).
 */
@Injectable()
export class TelegramBotService {
  private readonly log = new Logger("TelegramBot");
  readonly api: TelegramBotApi;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(DB) private readonly db: Db,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly tgAuth: TelegramAuthService,
    private readonly prices: PricesService,
  ) {
    this.api = new TelegramBotApi(env.TELEGRAM_BOT_TOKEN, { testEnv: env.TELEGRAM_TEST_ENV });
  }

  get webhookConfigured(): boolean {
    return this.tgAuth.enabled && this.env.TELEGRAM_WEBHOOK_SECRET.length >= 32;
  }

  /** Timing-safe comparison of the header Telegram sends with every update. */
  verifySecret(header: string | string[] | undefined): boolean {
    if (!this.webhookConfigured || typeof header !== "string") return false;
    const a = createHash("sha256").update(header).digest();
    const b = createHash("sha256").update(this.env.TELEGRAM_WEBHOOK_SECRET).digest();
    return timingSafeEqual(a, b);
  }

  /** At-most-once per update_id: Telegram redelivers until it sees a 200. */
  async firstDelivery(update: TgUpdate): Promise<boolean> {
    const id = update.update_id;
    if (typeof id !== "number" || !Number.isSafeInteger(id)) return false;
    return (await this.redis.set(`tg:update:${id}`, "1", "EX", 86_400, "NX")) === "OK";
  }

  async handle(update: TgUpdate): Promise<void> {
    const msg = update.message;
    if (!msg || typeof msg.text !== "string") return;
    const chatId = msg.chat?.id;
    const fromId = msg.from?.id;
    // Private chats only, with a real person: in a private chat the chat id
    // IS the user id, and anything else is not a conversation we hold.
    if (msg.chat?.type !== "private" || typeof fromId !== "number" || fromId !== chatId) return;
    if (msg.from?.is_bot === true) return;
    if (!(await this.withinReplyBudget(fromId))) return;

    const linked = await this.tgAuth.findLinkedUser(fromId);
    const usable = linked && linked.role === "user" ? linked : null;
    if (usable) {
      // They wrote to the bot, so the bot may write to them.
      await this.db
        .update(telegramChats)
        .set({ canMessage: true, blockedAt: null, updatedAt: sql`now()` })
        .where(eq(telegramChats.userId, usable.id));
    }
    const locale: Locale = usable
      ? usable.locale
      : localeFromTelegram(typeof msg.from?.language_code === "string" ? msg.from.language_code : null);
    const copy = BOT_COPY[locale] ?? BOT_COPY.en;

    const parsed = /^\/([a-z_]{1,32})(?:@([A-Za-z0-9_]{1,64}))?(?:\s+(\S{1,64}))?\s*$/i.exec(msg.text.trim());
    if (parsed?.[2] && parsed[2].toLowerCase() !== this.env.TELEGRAM_BOT_USERNAME.toLowerCase()) return;
    const command = parsed?.[1]?.toLowerCase() ?? "";
    const arg = parsed?.[3] ?? "";

    switch (command) {
      case "start": {
        const path = START_PATHS[arg] ?? "/";
        await this.reply(fromId, usable ? copy.welcomeLinked : copy.welcomeNew, copy.open, path);
        return;
      }
      case "price":
        await this.reply(fromId, await this.priceText(copy), copy.open, "/trade");
        return;
      case "unlink":
        if (!usable) {
          await this.reply(fromId, copy.notLinked);
          return;
        }
        await this.tgAuth.unlink(usable.id, "bot");
        await this.reply(fromId, copy.unlinked);
        return;
      default:
        await this.reply(fromId, copy.help, copy.open, "/");
    }
  }

  private async priceText(copy: (typeof BOT_COPY)["en"]): Promise<string> {
    try {
      const [xau, xpt] = await Promise.all([this.prices.latest("XAU"), this.prices.latest("XPT")]);
      const lines = [
        copy.priceHeader,
        copy.priceLine("gold", fmtEtb(xau.etbCentsPerGram)),
        copy.priceLine("platinum", fmtEtb(xpt.etbCentsPerGram)),
      ];
      if (xau.stale || xpt.stale) lines.push("", copy.priceStale);
      return lines.join("\n");
    } catch {
      return copy.priceUnavailable;
    }
  }

  private async reply(chatId: number, text: string, buttonLabel?: string, path?: string): Promise<void> {
    const keyboard =
      buttonLabel && this.env.TELEGRAM_WEBAPP_ORIGIN
        ? openAppKeyboard(buttonLabel, this.env.TELEGRAM_WEBAPP_ORIGIN, path)
        : undefined;
    const outcome = await this.api.sendMessage(chatId, text, keyboard);
    if (!outcome.ok) {
      this.log.warn(`reply not delivered (${outcome.kind}): ${outcome.description}`);
      if (outcome.kind === "blocked") {
        await this.db
          .update(telegramChats)
          .set({ canMessage: false, blockedAt: sql`now()`, updatedAt: sql`now()` })
          .where(eq(telegramChats.tgUserId, BigInt(chatId)));
      }
    }
  }

  private async withinReplyBudget(chatId: number): Promise<boolean> {
    const key = `tg:rl:${chatId}`;
    const n = await this.redis.incr(key);
    if (n === 1) await this.redis.expire(key, 60);
    return n <= CHAT_REPLY_LIMIT;
  }
}

function fmtEtb(cents: string): string {
  const v = BigInt(cents);
  const whole = (v / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${whole}.${(v % 100n).toString().padStart(2, "0")}`;
}
