import {
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { GoogleGenAI } from "@google/genai";
import { and, asc, count, desc, eq, inArray, isNull, max } from "drizzle-orm";
import { aiConversations, aiMessages, freezes, users, type Db } from "@alkeva/db";
import type {
  AiChatResponse,
  AiConversationResponse,
  AiConversationsResponse,
  Env,
  MetalAsset,
  PriceRange,
  Locale,
} from "@alkeva/shared";
import { LOCALE_META } from "@alkeva/shared";
import { DB, ENV } from "../core/core.module.js";
import { OrdersService } from "../orders/orders.service.js";
import { PortfolioService } from "../portfolio/portfolio.service.js";
import { PricesService } from "../prices/prices.service.js";
import { AI_TOOLS, FALLBACK_REPLY, systemInstruction } from "./ai.tools.js";
import { classifyGeminiError, retryAfterSecondsFrom, toApiError } from "./gemini-errors.js";

/** Interactions API step shapes we touch (SDK ≥2.x, stateless mode). */
interface FunctionCallStep {
  type: "function_call";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}
type HistoryStep = Record<string, unknown>;

/** "steps" replays persisted tool/thought steps verbatim; "text-only" is the recovery mode. */
type ReplayMode = "steps" | "text-only";

interface TurnOutcome {
  reply: string;
  turnSteps: HistoryStep[];
  tokensIn: number;
  tokensOut: number;
  toolCallLog: { name: string; arguments: unknown }[];
}

const MAX_TOOL_ROUNDS = 4;
const MAX_CONTEXT_MESSAGES = 60;
/** Replay full tool/thought steps only for this many newest assistant rows — older rows replay as text. */
const STEPS_WINDOW = 6;
/** Token-aware guard: rows beyond this many characters (newest first) are dropped from replay. */
const MAX_CONTEXT_CHARS = 50_000;
/** One in-request retry for transient network/5xx failures. */
const TRANSIENT_RETRY_DELAY_MS = 1_500;

/**
 * Shape-check stored steps before replaying them. Returns null when the row is
 * unsafe to replay whole — a half-valid step list (a function_call whose
 * result was dropped, say) is worse than the row's plain text.
 */
function sanitizeSteps(steps: HistoryStep[]): HistoryStep[] | null {
  for (const s of steps) {
    if (typeof s !== "object" || s === null || typeof s.type !== "string") return null;
    if (s.type === "function_call" && (typeof s.id !== "string" || typeof s.name !== "string")) {
      return null;
    }
    if (
      s.type === "function_result" &&
      (typeof s.call_id !== "string" || typeof s.name !== "string")
    ) {
      return null;
    }
  }
  return steps;
}

function fmtEtb(cents: bigint | string): string {
  const v = typeof cents === "bigint" ? cents : BigInt(cents || "0");
  const sign = v < 0n ? "-" : "";
  const abs = v < 0n ? -v : v;
  return `${sign}${(abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${(abs % 100n)
    .toString()
    .padStart(2, "0")} ETB`;
}

function fmtGrams(mg: bigint | string): string {
  const v = typeof mg === "bigint" ? mg : BigInt(mg || "0");
  return `${v / 1000n}.${(v % 1000n).toString().padStart(3, "0")} g`;
}

/** Milli-percent → a signed display string the model quotes verbatim. */
function fmtPct(milli: string | null): string | null {
  if (milli === null) return null;
  const v = Number(milli) / 1000;
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

/**
 * The chat endpoint (design doc §8). Stateless Interactions API calls with
 * store:false — the conversation lives in OUR database, replayed each turn,
 * so nothing about a user's finances depends on Google-side retention (and
 * free-tier retention is 1 day, far too short to lean on).
 *
 * The user id is bound server-side from the JWT; the model never chooses
 * whose data a tool reads.
 */
@Injectable()
export class AiService {
  private client: GoogleGenAI | null = null;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly portfolio: PortfolioService,
    private readonly prices: PricesService,
    private readonly orders: OrdersService,
  ) {}

  async chat(userId: string, message: string, conversationId?: string): Promise<AiChatResponse> {
    if (!this.env.GEMINI_API_KEY) throw new ServiceUnavailableException("ai_unconfigured");
    this.client ??= new GoogleGenAI({ apiKey: this.env.GEMINI_API_KEY });

    const userRows = await this.db
      .select({ fullName: users.fullName, locale: users.locale, status: users.status })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const user = userRows[0];
    if (!user) throw new NotFoundException("user_not_found");

    // Freeze context: the chat is where "why can't I trade?" gets answered.
    let frozen: { reason: string; since: string } | null = null;
    const freezeRows = await this.db
      .select({ reason: freezes.reason, createdAt: freezes.createdAt })
      .from(freezes)
      .where(and(eq(freezes.userId, userId), isNull(freezes.liftedAt)))
      .orderBy(desc(freezes.createdAt))
      .limit(1);
    if (freezeRows[0] || user.status === "frozen") {
      frozen = {
        reason: freezeRows[0]?.reason ?? "compliance review",
        since: freezeRows[0]?.createdAt.toISOString() ?? "recently",
      };
    }

    const conversation = await this.resolveConversation(userId, conversationId);

    // The turn state machine. Tools are read-only, so re-running the loop is
    // side-effect-free:
    //  - quota          → 429 ai_rate_limited (the UI says "try in a moment")
    //  - poisoned reply → retry ONCE with text-only replay, so a bad stored
    //                     step can never permanently brick a conversation
    //  - transient      → retry ONCE after a short pause (Render cold start)
    //  - anything else  → 503 ai_unavailable
    let mode: ReplayMode = "steps";
    let transientRetried = false;
    let degraded = false;
    let outcome: TurnOutcome;

    for (;;) {
      const history = await this.rebuildHistory(conversation.id, mode);
      history.push({ type: "user_input", content: [{ type: "text", text: message }] });
      try {
        outcome = await this.runTurn(userId, history, user, frozen);
        break;
      } catch (err) {
        const kind = classifyGeminiError(err);
        if (kind === "rate_limited") {
          throw new HttpException(
            { message: "ai_rate_limited", retryAfterSeconds: retryAfterSecondsFrom(err) },
            429,
          );
        }
        if (kind === "invalid_history" && !degraded) {
          degraded = true;
          mode = "text-only";
          console.error(
            `ai: replay rejected for conversation ${conversation.id}, degrading to text-only:`,
            err,
          );
          continue;
        }
        if (kind === "transient" && !transientRetried) {
          transientRetried = true;
          await new Promise((resolve) => setTimeout(resolve, TRANSIENT_RETRY_DELAY_MS));
          continue;
        }
        // Quota/network failures must degrade to a friendly, retryable state —
        // never a stack trace on stage.
        console.error(`gemini interaction failed (${kind}):`, err);
        throw new ServiceUnavailableException("ai_unavailable");
      }
    }

    let { reply } = outcome;
    const { turnSteps, tokensIn, tokensOut, toolCallLog } = outcome;

    if (!reply) {
      reply = FALLBACK_REPLY[user.locale] ?? FALLBACK_REPLY.en;
    }

    await this.db.insert(aiMessages).values([
      { conversationId: conversation.id, role: "user", content: message },
      {
        conversationId: conversation.id,
        role: "assistant",
        content: reply,
        toolCalls: turnSteps.length > 0 ? { steps: turnSteps, calls: toolCallLog } : null,
        tokensIn,
        tokensOut,
      },
    ]);

    return { conversationId: conversation.id, reply };
  }

  async latestConversation(userId: string): Promise<AiConversationResponse> {
    const convRows = await this.db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.userId, userId))
      .orderBy(desc(aiConversations.createdAt))
      .limit(1);
    const conversation = convRows[0];
    if (!conversation) return { conversationId: null, messages: [] };
    return this.messagesFor(conversation.id);
  }

  /**
   * The thread list. Threads live in OUR database with no retention window —
   * this is the long-term memory surface. Titles are derived on read from the
   * first user message (no title column to migrate or keep in sync), and
   * message-less rows are hidden: resolveConversation inserts the row before
   * the model turn, so a failed first turn leaves an empty shell behind.
   */
  async listConversations(userId: string): Promise<AiConversationsResponse> {
    const convs = await this.db
      .select({ id: aiConversations.id, createdAt: aiConversations.createdAt })
      .from(aiConversations)
      .where(eq(aiConversations.userId, userId))
      .orderBy(desc(aiConversations.createdAt))
      .limit(100);
    if (convs.length === 0) return { conversations: [] };
    const ids = convs.map((c) => c.id);

    const stats = await this.db
      .select({
        conversationId: aiMessages.conversationId,
        n: count(),
        lastAt: max(aiMessages.createdAt),
      })
      .from(aiMessages)
      .where(inArray(aiMessages.conversationId, ids))
      .groupBy(aiMessages.conversationId);

    const firsts = await this.db
      .selectDistinctOn([aiMessages.conversationId], {
        conversationId: aiMessages.conversationId,
        content: aiMessages.content,
      })
      .from(aiMessages)
      .where(and(inArray(aiMessages.conversationId, ids), eq(aiMessages.role, "user")))
      .orderBy(aiMessages.conversationId, asc(aiMessages.createdAt));

    const statBy = new Map(stats.map((s) => [s.conversationId, s]));
    const titleBy = new Map(firsts.map((f) => [f.conversationId, f.content]));

    const conversations = convs
      .map((c) => {
        const stat = statBy.get(c.id);
        if (!stat || stat.n === 0) return null;
        const raw = (titleBy.get(c.id) ?? "").replace(/\s+/g, " ").trim();
        return {
          id: c.id,
          title: raw.length > 80 ? `${raw.slice(0, 80)}…` : raw,
          lastAt: (stat.lastAt ?? c.createdAt).toISOString(),
          messageCount: stat.n,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));

    return { conversations };
  }

  /** One thread's messages — own threads only; anyone else's id is a 404, never a 403. */
  async conversationById(userId: string, id: string): Promise<AiConversationResponse> {
    const rows = await this.db
      .select({ id: aiConversations.id })
      .from(aiConversations)
      .where(and(eq(aiConversations.id, id), eq(aiConversations.userId, userId)))
      .limit(1);
    if (!rows[0]) throw new NotFoundException("conversation_not_found");
    return this.messagesFor(id);
  }

  /**
   * Deleting a thread is the user erasing their own chat history — the AI
   * tables are theirs, unlike the ledger. Messages first (FK), then the row.
   */
  async deleteConversation(userId: string, id: string): Promise<{ ok: true }> {
    const rows = await this.db
      .select({ id: aiConversations.id })
      .from(aiConversations)
      .where(and(eq(aiConversations.id, id), eq(aiConversations.userId, userId)))
      .limit(1);
    if (!rows[0]) throw new NotFoundException("conversation_not_found");
    await this.db.delete(aiMessages).where(eq(aiMessages.conversationId, id));
    await this.db.delete(aiConversations).where(eq(aiConversations.id, id));
    return { ok: true };
  }

  private async messagesFor(conversationId: string): Promise<AiConversationResponse> {
    const rows = await this.db
      .select({
        id: aiMessages.id,
        role: aiMessages.role,
        content: aiMessages.content,
        createdAt: aiMessages.createdAt,
      })
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, conversationId))
      .orderBy(asc(aiMessages.createdAt));

    return {
      conversationId,
      messages: rows
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          createdAt: m.createdAt.toISOString(),
        })),
    };
  }

  // ── internals ───────────────────────────────────────────────────

  /**
   * One full Gemini turn: interaction → tool loop → final text. Throws raw SDK
   * errors — chat()'s state machine decides what each failure means.
   * Everything the turn appends (model steps + tool results) is returned so it
   * can be persisted verbatim and replayed next turn, thought steps included.
   */
  private async runTurn(
    userId: string,
    history: HistoryStep[],
    user: { fullName: string; locale: Locale },
    frozen: { reason: string; since: string } | null,
  ): Promise<TurnOutcome> {
    const turnSteps: HistoryStep[] = [];
    const toolCallLog: { name: string; arguments: unknown }[] = [];
    let reply = "";
    let tokensIn = 0;
    let tokensOut = 0;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const interaction = await this.client!.interactions.create({
        model: this.env.GEMINI_MODEL,
        store: false,
        input: history as never,
        tools: AI_TOOLS as never,
        system_instruction: systemInstruction({
          locale: user.locale,
          fullName: user.fullName,
          frozen,
        }),
      } as never);

      const usage = (
        interaction as {
          usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
        }
      ).usage;
      tokensIn += usage?.input_tokens ?? 0;
      tokensOut += usage?.output_tokens ?? 0;

      const steps = (interaction.steps ?? []) as HistoryStep[];
      history.push(...steps);
      turnSteps.push(...steps);

      const calls = steps.filter(
        (s): s is FunctionCallStep & HistoryStep => s.type === "function_call",
      );
      if (calls.length === 0) {
        reply = (interaction as { output_text?: string | null }).output_text ?? "";
        break;
      }
      if (round === MAX_TOOL_ROUNDS) {
        reply = "";
        break;
      }
      for (const call of calls) {
        toolCallLog.push({ name: call.name, arguments: call.arguments });
        const result = await this.runTool(userId, call.name, call.arguments);
        const resultStep: HistoryStep = {
          type: "function_result",
          name: call.name,
          call_id: call.id,
          result: [{ type: "text", text: JSON.stringify(result) }],
        };
        history.push(resultStep);
        turnSteps.push(resultStep);
      }
    }

    return { reply, turnSteps, tokensIn, tokensOut, toolCallLog };
  }

  private async resolveConversation(userId: string, conversationId?: string) {
    if (conversationId) {
      const rows = await this.db
        .select()
        .from(aiConversations)
        .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)))
        .limit(1);
      if (rows[0]) return rows[0];
    }
    const inserted = await this.db.insert(aiConversations).values({ userId }).returning();
    const row = inserted[0];
    if (!row) throw new ServiceUnavailableException("ai_unavailable");
    return row;
  }

  /**
   * Replay our persisted rows back into Interactions-API step shape.
   *
   * Hardened against its own history: full tool/thought steps are replayed
   * only for the newest STEPS_WINDOW assistant rows (older ones replay as
   * plain text — fewer tokens, smaller signature-replay surface), a row whose
   * stored steps fail shape checks degrades to its text instead of being sent
   * raw, and "text-only" mode drops steps entirely — the recovery path when
   * Gemini rejects a replay, so a poisoned row can never brick a conversation.
   */
  private async rebuildHistory(
    conversationId: string,
    mode: ReplayMode,
  ): Promise<HistoryStep[]> {
    const rows = await this.db
      .select()
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, conversationId))
      .orderBy(desc(aiMessages.createdAt))
      .limit(MAX_CONTEXT_MESSAGES);

    // Token-aware cap: walk newest→oldest, stop before the budget blows.
    let budget = MAX_CONTEXT_CHARS;
    const kept: typeof rows = [];
    for (const row of rows) {
      const cost =
        row.content.length + (row.toolCalls ? JSON.stringify(row.toolCalls).length : 0);
      if (kept.length > 0 && budget - cost < 0) break;
      budget -= cost;
      kept.push(row);
    }
    kept.reverse();
    // Replay must open with the user speaking — drop a leading assistant row
    // left behind by the cut.
    while (kept.length > 0 && kept[0]!.role !== "user") kept.shift();

    let assistantSeen = 0;
    const assistantTotal = kept.filter((r) => r.role === "assistant").length;

    const history: HistoryStep[] = [];
    for (const row of kept) {
      if (row.role === "user") {
        history.push({ type: "user_input", content: [{ type: "text", text: row.content }] });
      } else if (row.role === "assistant") {
        assistantSeen++;
        const inWindow = assistantTotal - assistantSeen < STEPS_WINDOW;
        const stored = row.toolCalls as { steps?: HistoryStep[] } | null;
        const steps =
          mode === "steps" && inWindow && stored?.steps && Array.isArray(stored.steps)
            ? sanitizeSteps(stored.steps)
            : null;
        if (steps) {
          history.push(...steps);
        } else {
          history.push({ type: "model_output", content: [{ type: "text", text: row.content }] });
        }
      }
    }
    return history;
  }

  /**
   * Write a compliance officer's case summary in their own language.
   *
   * Deliberately unlike chat(): no tools are passed, no conversation is stored,
   * and no user data is fetched. The model receives only the evidence a
   * deterministic rule already produced, and its job is to put it in a
   * sentence. It is never asked whether the finding is real — that question was
   * answered by the rule, and the decision that follows belongs to the officer,
   * whose action is separately audited.
   */
  async narrateCase(input: {
    locale: Locale;
    ruleKey: string;
    severity: string | null;
    score: number | null;
    openedAt: string;
    windowStart: string | null;
    evidence: Record<string, unknown>;
  }): Promise<string> {
    if (!this.env.GEMINI_API_KEY) throw new ServiceUnavailableException("ai_unconfigured");
    this.client ??= new GoogleGenAI({ apiKey: this.env.GEMINI_API_KEY });

    const system = [
      "You write case notes for an anti-money-laundering officer at ALKEVA, a gold and platinum custody platform in Ethiopia. Money is Ethiopian birr (ETB); metal amounts are in grams.",
      "",
      `Write in ${LOCALE_META[input.locale].aiName}. Copy every figure exactly as given, in Western digits — never restate a number in another numeral system and never re-round one.`,
      "",
      "Write 2-4 short sentences, in this order: what the rule detected, the specific figures that triggered it, and what a reviewer should check next.",
      "",
      "Hard rules:",
      "- Use ONLY the evidence given. Never invent a figure, a date, a name, or a motive.",
      "- Never state or imply that the account holder is guilty, is laundering money, or has committed a crime. The finding is a pattern worth review, nothing more.",
      "- Never recommend freezing, blocking, or any action on the account. You are describing evidence for a person who decides.",
      "- No greeting, no sign-off, no headings. Plain sentences.",
    ].join("\n");

    const facts = JSON.stringify(
      {
        rule: input.ruleKey,
        severity: input.severity,
        score: input.score,
        openedAt: input.openedAt,
        coversPeriodFrom: input.windowStart,
        evidence: input.evidence,
      },
      null,
      1,
    );

    let interaction: unknown;
    try {
      interaction = await this.client.interactions.create({
        model: this.env.GEMINI_MODEL,
        store: false,
        input: [{ type: "user_input", content: [{ type: "text", text: facts }] }],
        system_instruction: system,
      } as never);
    } catch (err) {
      // Google's quota wording carries billing URLs and project ids — logged,
      // never handed to the officer, who just needs to know to try later.
      throw toApiError(err, "compliance case narrative");
    }

    const text = (interaction as { output_text?: string | null }).output_text ?? "";
    if (!text.trim()) throw new ServiceUnavailableException("ai_unavailable");
    return text.trim();
  }

  /**
   * Tool dispatch. userId comes from the JWT, full stop. Results carry
   * pre-formatted display strings so the model quotes, never computes.
   */
  private async runTool(
    userId: string,
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    try {
      switch (name) {
        case "get_my_portfolio": {
          const p = await this.portfolio.forUser(userId);
          return {
            cash: fmtEtb(p.etbCents),
            holdings: p.holdings.map((h) => ({
              metal: h.asset === "XAU" ? "gold" : "platinum",
              amount: fmtGrams(h.gramsMg),
              currentValue: fmtEtb(h.valueCents),
              costBasis: fmtEtb(h.costBasisCents),
              gainLoss: fmtEtb(h.gainLossCents),
            })),
            totalValue: fmtEtb(p.totalValueCents),
            tier: p.tier.name,
            asOf: p.asOf,
          };
        }
        case "get_price": {
          const asset = args.asset === "XPT" ? "XPT" : "XAU";
          const range = (["24h", "7d", "30d", "1y"] as const).includes(
            args.range as PriceRange,
          )
            ? (args.range as PriceRange)
            : "24h";
          const latest = await this.prices.latest(asset as MetalAsset);
          const hist = await this.prices.history(asset as MetalAsset, range);
          const first = hist.points[0];
          const changePct =
            first && BigInt(first.etbCentsPerGram) > 0n
              ? (
                  (Number(
                    BigInt(latest.etbCentsPerGram) - BigInt(first.etbCentsPerGram),
                  ) /
                    Number(BigInt(first.etbCentsPerGram))) *
                  100
                ).toFixed(2)
              : null;
          return {
            metal: asset === "XAU" ? "gold" : "platinum",
            pricePerGram: fmtEtb(latest.etbCentsPerGram),
            source: latest.source,
            at: latest.at,
            stale: latest.stale,
            // The platform's canonical 24h change — the same number the ticker
            // and price cards render, so the assistant never disagrees with
            // the screen it sits beside.
            change24hPct:
              latest.change24hPctMilli !== null
                ? (Number(latest.change24hPctMilli) / 1000).toFixed(2)
                : null,
            range,
            // For 24h the canonical figure above IS the range change — sending
            // a second, bucket-derived number made the model quote both.
            changeOverRangePct: range === "24h" ? undefined : changePct,
          };
        }
        case "explain_price_move": {
          const asset = args.asset === "XPT" ? "XPT" : "XAU";
          const range = (["24h", "7d", "30d", "1y"] as const).includes(args.range as PriceRange)
            ? (args.range as PriceRange)
            : "24h";
          const a = await this.prices.attribution(asset as MetalAsset, range);
          if (a.totalPctMilli === null) {
            return {
              metal: asset === "XAU" ? "gold" : "platinum",
              range,
              error: "not_enough_history",
              note: "There is not enough price history yet to split this move.",
            };
          }
          return {
            metal: asset === "XAU" ? "gold" : "platinum",
            range,
            priceNow: fmtEtb(a.to.etbCentsPerGram),
            priceThen: fmtEtb(a.from.etbCentsPerGram),
            // The whole move, then the two halves it is made of. They
            // reconcile exactly: total = metal + currency + interaction.
            totalChangePct: fmtPct(a.totalPctMilli),
            metalPriceChangePct: fmtPct(a.metalPctMilli),
            birrRateChangePct: fmtPct(a.fxPctMilli),
            interactionAndRoundingPct: fmtPct(a.crossPctMilli),
            biggerCause: a.dominant,
            birrDirection:
              a.fxPctMilli === null
                ? null
                : BigInt(a.fxPctMilli) > 0n
                  ? "the birr weakened against the dollar"
                  : BigInt(a.fxPctMilli) < 0n
                    ? "the birr strengthened against the dollar"
                    : "the birr rate was unchanged",
            from: a.from.at,
            to: a.to.at,
            source: a.source,
            fxSource: a.fxSource,
          };
        }
        case "get_transaction_proof": {
          const serial = typeof args.serial === "string" ? args.serial.trim() : "";
          const orderId = serial
            ? await this.orders.findBySerial(userId, serial)
            : await this.orders.latestSettledId(userId);
          if (!orderId) {
            return {
              error: serial ? "receipt_not_found" : "no_settled_orders",
              note: serial
                ? "No settled transaction of theirs carries that receipt number."
                : "They have no settled transactions yet.",
            };
          }
          const p = await this.orders.proof(userId, orderId);
          return {
            receiptSerial: p.serial,
            what: `${p.side} ${p.asset === "XAU" ? "gold" : "platinum"}`,
            amount: fmtGrams(p.gramsMg),
            settledAt: p.settledAt,
            total: fmtEtb(p.quote.totalCents),
            fee: fmtEtb(p.quote.feeCents),
            priceLockedAt: fmtEtb(p.quote.unitEtbCentsPerGram),
            quoteIssuedAt: p.quote.createdAt,
            quoteExpiredAt: p.quote.expiresAt,
            // Every entry, both sides. The user's own account reads "you".
            ledgerEntries: p.legs.map((l) => ({
              account: l.account,
              amount: l.asset === "ETB" ? fmtEtb(l.amount) : fmtGrams(l.amount),
            })),
            // The check, stated as a result rather than left to be computed.
            zeroSumCheck: p.checks.map((c) => ({
              asset: c.asset,
              total: c.asset === "ETB" ? fmtEtb(c.sum) : fmtGrams(c.sum),
              balanced: c.balanced,
            })),
            allEntriesBalance: p.balanced,
            priceSource: p.price.source,
            fxSource: p.price.fxSource,
            priceTakenAt: p.price.at,
            ledgerTransactionId: p.ledgerTransactionId,
          };
        }
        case "get_my_history": {
          const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 20);
          const list = await this.orders.list(userId, { limit });
          return list.orders.map((o) => ({
            side: o.side,
            metal: o.asset === "XAU" ? "gold" : "platinum",
            amount: fmtGrams(o.gramsMg),
            total: fmtEtb(o.totalCents),
            status: o.status,
            refusalReason: o.failureReason,
            receiptSerial: o.receiptSerial,
            at: o.createdAt,
          }));
        }
        default:
          return { error: `unknown tool: ${name}` };
      }
    } catch (err) {
      console.error(`ai tool ${name} failed:`, err);
      return { error: "data_unavailable" };
    }
  }
}
