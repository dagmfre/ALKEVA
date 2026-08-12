import {
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { GoogleGenAI } from "@google/genai";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { aiConversations, aiMessages, freezes, users, type Db } from "@alkeva/db";
import type {
  AiChatResponse,
  AiConversationResponse,
  Env,
  MetalAsset,
  PriceRange,
} from "@alkeva/shared";
import { DB, ENV } from "../core/core.module.js";
import { OrdersService } from "../orders/orders.service.js";
import { PortfolioService } from "../portfolio/portfolio.service.js";
import { PricesService } from "../prices/prices.service.js";
import { AI_TOOLS, systemInstruction } from "./ai.tools.js";

/** Interactions API step shapes we touch (SDK ≥2.x, stateless mode). */
interface FunctionCallStep {
  type: "function_call";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}
type HistoryStep = Record<string, unknown>;

const MAX_TOOL_ROUNDS = 4;
const MAX_CONTEXT_MESSAGES = 30;

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
    const history = await this.rebuildHistory(conversation.id);
    history.push({ type: "user_input", content: [{ type: "text", text: message }] });

    // Everything this turn appends (model steps + tool results) is persisted
    // verbatim so the next turn can replay it exactly, thought steps included.
    const turnSteps: HistoryStep[] = [];
    let reply = "";
    let tokensIn = 0;
    let tokensOut = 0;
    const toolCallLog: { name: string; arguments: unknown }[] = [];

    try {
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        const interaction = await this.client.interactions.create({
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

        const usage = (interaction as { usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } }).usage;
        tokensIn += usage?.input_tokens ?? 0;
        tokensOut += usage?.output_tokens ?? 0;

        const steps = (interaction.steps ?? []) as HistoryStep[];
        history.push(...steps);
        turnSteps.push(...steps);

        const calls = steps.filter(
          (s): s is FunctionCallStep & HistoryStep => s.type === "function_call",
        );
        if (calls.length === 0) {
          reply =
            (interaction as { output_text?: string | null }).output_text ??
            "";
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
    } catch (err) {
      // Quota/network failures must degrade to a friendly, retryable state —
      // never a stack trace on stage.
      console.error("gemini interaction failed:", err);
      throw new ServiceUnavailableException("ai_unavailable");
    }

    if (!reply) {
      reply =
        user.locale === "am"
          ? "ይቅርታ፣ ለዚህ ጥያቄ መልስ ማዘጋጀት አልቻልኩም። እባክዎ እንደገና ይሞክሩ።"
          : "Sorry — I could not put together an answer for that. Please try again.";
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

    const rows = await this.db
      .select({
        id: aiMessages.id,
        role: aiMessages.role,
        content: aiMessages.content,
        createdAt: aiMessages.createdAt,
      })
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, conversation.id))
      .orderBy(asc(aiMessages.createdAt));

    return {
      conversationId: conversation.id,
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

  /** Replay our persisted rows back into Interactions-API step shape. */
  private async rebuildHistory(conversationId: string): Promise<HistoryStep[]> {
    const rows = await this.db
      .select()
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, conversationId))
      .orderBy(desc(aiMessages.createdAt))
      .limit(MAX_CONTEXT_MESSAGES);
    rows.reverse();

    const history: HistoryStep[] = [];
    for (const row of rows) {
      if (row.role === "user") {
        history.push({ type: "user_input", content: [{ type: "text", text: row.content }] });
      } else if (row.role === "assistant") {
        const stored = row.toolCalls as { steps?: HistoryStep[] } | null;
        if (stored?.steps && Array.isArray(stored.steps)) {
          history.push(...stored.steps);
        } else {
          history.push({ type: "model_output", content: [{ type: "text", text: row.content }] });
        }
      }
    }
    return history;
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
            range,
            changeOverRangePct: changePct,
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
