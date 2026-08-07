import { Inject, Injectable, InternalServerErrorException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { feeConfig, type Db } from "@alkeva/db";
import { DB } from "../core/core.module.js";

export type FeeConfigRow = typeof feeConfig.$inferSelect;

export interface FeeBreakdown {
  feeCents: bigint;
  taxCents: bigint;
  reforestCents: bigint;
}

/**
 * Config-driven fee engine (Decision A1) — rates live in fee_config (seeded
 * from env), never in code. Fee math is part of the quote engine's single
 * rounding point: floor division on bigints, applied once per quote.
 */
@Injectable()
export class FeesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Single-row config read per call — no cache to go stale mid-demo. */
  async getConfig(): Promise<FeeConfigRow> {
    const rows = await this.db.select().from(feeConfig).where(eq(feeConfig.id, 1)).limit(1);
    const row = rows[0];
    if (!row) throw new InternalServerErrorException("fee_config_missing");
    return row;
  }

  /** pctMilli: 2.0% = 2000 → divide by 100_000. Floor division (bigint). */
  computeFees(subtotalCents: bigint, cfg: FeeConfigRow): FeeBreakdown {
    const commission = (subtotalCents * BigInt(cfg.commissionPctMilli)) / 100_000n;
    return {
      feeCents: commission + cfg.serviceFeeCents,
      taxCents: (subtotalCents * BigInt(cfg.taxPctMilli)) / 100_000n,
      reforestCents: (subtotalCents * BigInt(cfg.reforestPctMilli)) / 100_000n,
    };
  }
}
