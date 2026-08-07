import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import { priceTicks, quotes, type Db } from "@alkeva/db";
import {
  MAX_TICK_AGE_SECONDS,
  QUOTE_TTL_SECONDS,
  UNITS,
  type CreateQuoteDto,
  type MetalAsset,
  type OrderSide,
  type QuoteResponse,
} from "@alkeva/shared";
import { DB } from "../core/core.module.js";
import { FeesService } from "../fees/fees.service.js";

export type QuoteRow = typeof quotes.$inferSelect;

/**
 * The quote engine — THE single rounding point of the platform (non-negotiable
 * #4 / fact-check §1.3). Every division below floors bigints; orders execute
 * the stored integers verbatim and never recompute.
 */
@Injectable()
export class QuotesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly fees: FeesService,
  ) {}

  async create(userId: string, dto: CreateQuoteDto): Promise<QuoteResponse> {
    const tickRows = await this.db
      .select()
      .from(priceTicks)
      .where(eq(priceTicks.asset, dto.asset))
      .orderBy(desc(priceTicks.at))
      .limit(1);
    const tick = tickRows[0];
    if (!tick) throw new NotFoundException("no_price_data");
    // Refuse-on-stale: quoting an old price is the same bug as an unexpiring
    // quote. The worker ticks every ~30s; 180s of silence means it's down.
    if ((Date.now() - tick.at.getTime()) / 1000 > MAX_TICK_AGE_SECONDS) {
      throw new UnprocessableEntityException("stale_price");
    }

    const unit = tick.etbCentsPerGram; // integer ETB cents per gram
    // Amount normalization. ETB-direction derives grams first (floor), then
    // subtotal is recomputed FROM grams — the user pays for exactly the mg
    // they receive, charged ≤ the amount they asked to spend.
    let gramsMg: bigint;
    if (dto.gramsMg !== undefined) {
      gramsMg = dto.gramsMg;
    } else if (dto.etbCents !== undefined) {
      gramsMg = (dto.etbCents * UNITS.MG_PER_GRAM) / unit;
    } else {
      throw new UnprocessableEntityException("amount_too_small"); // unreachable: zod refine
    }
    if (gramsMg <= 0n) throw new UnprocessableEntityException("amount_too_small");

    // User-verifiable: displayed unit price × grams, floored once.
    const subtotalCents = (unit * gramsMg) / UNITS.MG_PER_GRAM;
    if (subtotalCents <= 0n) throw new UnprocessableEntityException("amount_too_small");

    const cfg = await this.fees.getConfig();
    const { feeCents, taxCents, reforestCents } = this.fees.computeFees(subtotalCents, cfg);
    const totalCents =
      dto.side === "buy"
        ? subtotalCents + feeCents + taxCents + reforestCents
        : subtotalCents - feeCents - taxCents - reforestCents;
    if (dto.side === "sell" && totalCents <= 0n) {
      throw new UnprocessableEntityException("amount_too_small");
    }

    const inserted = await this.db
      .insert(quotes)
      .values({
        userId,
        side: dto.side,
        asset: dto.asset,
        gramsMg,
        priceTickId: tick.id,
        unitEtbCentsPerGram: unit,
        subtotalCents,
        feeCents,
        taxCents,
        reforestCents,
        totalCents,
        expiresAt: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000),
      })
      .returning();
    const row = inserted[0];
    if (!row) throw new UnprocessableEntityException("quote_create_failed");
    return this.serialize(row, tick.at);
  }

  serialize(row: QuoteRow, priceAt: Date): QuoteResponse {
    return {
      id: row.id,
      side: row.side as OrderSide,
      asset: row.asset as MetalAsset,
      gramsMg: row.gramsMg.toString(),
      unitEtbCentsPerGram: row.unitEtbCentsPerGram.toString(),
      subtotalCents: row.subtotalCents.toString(),
      feeCents: row.feeCents.toString(),
      taxCents: row.taxCents.toString(),
      reforestCents: row.reforestCents.toString(),
      totalCents: row.totalCents.toString(),
      status: row.status,
      expiresAt: row.expiresAt.toISOString(),
      priceAt: priceAt.toISOString(),
    };
  }
}
