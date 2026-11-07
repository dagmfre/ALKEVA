import { and, eq, isNull, sql } from "drizzle-orm";
import type { Redis } from "ioredis";
import { notifications, priceAlerts, pushSubscriptions, telegramChats, users, type Db } from "@alkeva/db";
import type { MetalAsset } from "@alkeva/shared";

/**
 * The deterministic half of price alerts (F24): thresholds trigger here, in
 * the worker, on every tick — no model involved. One-shot per alert.
 *
 * Phase 10C: the claim (stamping triggered_at) and the notice row are ONE
 * transaction, so an alert can never be consumed without its notice — and no
 * email is sent from here any more. The dispatcher delivers email and browser
 * push from the outbox, so a slow mail server cannot stall the price tick.
 */
export async function checkAlerts(
  db: Db,
  redis: Redis,
  pushReady: boolean,
  asset: MetalAsset,
  priceCentsPerGram: bigint,
  telegramReady = false,
): Promise<void> {
  const due = await db
    .select({
      id: priceAlerts.id,
      userId: priceAlerts.userId,
      direction: priceAlerts.direction,
      threshold: priceAlerts.thresholdCentsPerGram,
      prefs: users.notifyPrefs,
    })
    .from(priceAlerts)
    .innerJoin(users, eq(priceAlerts.userId, users.id))
    .where(
      and(
        eq(priceAlerts.asset, asset),
        eq(priceAlerts.active, true),
        isNull(priceAlerts.triggeredAt),
        sql`(
          (${priceAlerts.direction} = 'above' and ${priceAlerts.thresholdCentsPerGram} <= ${priceCentsPerGram})
          or
          (${priceAlerts.direction} = 'below' and ${priceAlerts.thresholdCentsPerGram} >= ${priceCentsPerGram})
        )`,
      ),
    );

  for (const alert of due) {
    const prefs = (alert.prefs ?? {}) as {
      alerts?: { email?: boolean; push?: boolean; telegram?: boolean };
    };
    const emailOn = prefs.alerts?.email !== false;
    const pushOn = pushReady && prefs.alerts?.push !== false;
    const tgWanted = telegramReady && prefs.alerts?.telegram !== false;

    const id = await db.transaction(async (tx) => {
      // The one-shot mutex: only the updater that stamps triggered_at proceeds.
      const claimed = await tx
        .update(priceAlerts)
        .set({ triggeredAt: sql`now()` })
        .where(and(eq(priceAlerts.id, alert.id), isNull(priceAlerts.triggeredAt)))
        .returning({ id: priceAlerts.id });
      if (claimed.length === 0) return null;

      const subs = pushOn
        ? await tx
            .select({ id: pushSubscriptions.id })
            .from(pushSubscriptions)
            .where(eq(pushSubscriptions.userId, alert.userId))
            .limit(1)
        : [];
      // Telegram only to a linked chat that allowed the bot and has not blocked it.
      const chat = tgWanted
        ? await tx
            .select({ ok: sql<boolean>`${telegramChats.canMessage} AND ${telegramChats.blockedAt} IS NULL` })
            .from(telegramChats)
            .where(eq(telegramChats.userId, alert.userId))
            .limit(1)
        : [];
      const inserted = await tx
        .insert(notifications)
        .values({
          userId: alert.userId,
          channel: "email",
          template: "price_alert",
          payload: {
            asset,
            direction: alert.direction,
            thresholdCentsPerGram: alert.threshold.toString(),
            priceCentsPerGram: priceCentsPerGram.toString(),
          },
          status: emailOn ? "queued" : "skipped",
          pushStatus: subs.length > 0 ? "queued" : "skipped",
          tgStatus: chat[0]?.ok === true ? "queued" : "skipped",
        })
        .returning({ id: notifications.id });
      return inserted[0]?.id ?? null;
    });
    if (!id) continue;

    await redis
      .publish(`notify:${alert.userId}`, JSON.stringify({ id, template: "price_alert" }))
      .catch(() => undefined);
    console.log(`[alert] ${asset} ${alert.direction} ${alert.threshold} fired at ${priceCentsPerGram}`);
  }
}
