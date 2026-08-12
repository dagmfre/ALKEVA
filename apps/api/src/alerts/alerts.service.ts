import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { priceAlerts, type Db } from "@alkeva/db";
import type { AlertItem, AlertsResponse, CreateAlertDto, MetalAsset } from "@alkeva/shared";
import { DB } from "../core/core.module.js";

const MAX_ACTIVE_ALERTS = 10;

/**
 * Price alerts (F24): the user sets a threshold; the PRICE WORKER checks it
 * on every tick and fires the notification. Deterministic end to end —
 * "the LLM phrases; thresholds trigger" — and one-shot: a fired alert stays
 * as a record, re-arming means creating a new one.
 */
@Injectable()
export class AlertsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async create(userId: string, dto: CreateAlertDto): Promise<AlertsResponse> {
    const active = await this.db
      .select({ id: priceAlerts.id })
      .from(priceAlerts)
      .where(and(eq(priceAlerts.userId, userId), eq(priceAlerts.active, true)));
    if (active.length >= MAX_ACTIVE_ALERTS) {
      // Quietly cap: deactivate the oldest instead of erroring — an alert
      // hoarder is a UX problem, not a security one.
      const oldest = active[0];
      if (oldest) {
        await this.db
          .update(priceAlerts)
          .set({ active: false })
          .where(eq(priceAlerts.id, oldest.id));
      }
    }

    await this.db.insert(priceAlerts).values({
      userId,
      asset: dto.asset,
      direction: dto.direction,
      thresholdCentsPerGram: dto.thresholdCentsPerGram,
    });
    return this.listOwn(userId);
  }

  async listOwn(userId: string): Promise<AlertsResponse> {
    const rows = await this.db
      .select()
      .from(priceAlerts)
      .where(eq(priceAlerts.userId, userId))
      .orderBy(desc(priceAlerts.createdAt))
      .limit(20);
    return {
      alerts: rows.map(
        (r): AlertItem => ({
          id: r.id,
          asset: r.asset as MetalAsset,
          direction: r.direction,
          thresholdCentsPerGram: r.thresholdCentsPerGram.toString(),
          active: r.active,
          triggeredAt: r.triggeredAt ? r.triggeredAt.toISOString() : null,
          createdAt: r.createdAt.toISOString(),
        }),
      ),
    };
  }

  async remove(userId: string, alertId: string): Promise<AlertsResponse> {
    const deleted = await this.db
      .update(priceAlerts)
      .set({ active: false })
      .where(and(eq(priceAlerts.id, alertId), eq(priceAlerts.userId, userId)))
      .returning({ id: priceAlerts.id });
    if (deleted.length === 0) throw new NotFoundException("alert_not_found");
    return this.listOwn(userId);
  }
}
