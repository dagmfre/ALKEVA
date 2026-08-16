import nodemailer, { type Transporter } from "nodemailer";
import { and, eq, isNull, sql } from "drizzle-orm";
import { notifications, priceAlerts, users, type Db } from "@alkeva/db";
import { emailLocaleFor, renderNotification, type Env, type MetalAsset } from "@alkeva/shared";

/**
 * The deterministic half of price alerts (F24): thresholds trigger here, in
 * the worker, on every tick — no model involved. One-shot per alert: the
 * conditional UPDATE that stamps triggered_at is the mutex, so a tick that
 * races another worker fires each alert exactly once.
 *
 * The email copy comes from the shared template module — the identical
 * wording the API sends, non-advisory by construction (states the crossing,
 * suggests nothing). The worker only keeps its own nodemailer transport,
 * which buys not booting Nest here.
 */

let transport: Transporter | null = null;

export async function checkAlerts(
  db: Db,
  env: Env,
  asset: MetalAsset,
  priceCentsPerGram: bigint,
): Promise<void> {
  const due = await db
    .select({
      id: priceAlerts.id,
      userId: priceAlerts.userId,
      direction: priceAlerts.direction,
      threshold: priceAlerts.thresholdCentsPerGram,
      email: users.email,
      locale: users.locale,
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
    // The one-shot mutex: only the updater that stamps triggered_at proceeds.
    const claimed = await db
      .update(priceAlerts)
      .set({ triggeredAt: sql`now()` })
      .where(and(eq(priceAlerts.id, alert.id), isNull(priceAlerts.triggeredAt)))
      .returning({ id: priceAlerts.id });
    if (claimed.length === 0) continue;

    const payload = {
      asset,
      direction: alert.direction,
      thresholdCentsPerGram: alert.threshold.toString(),
      priceCentsPerGram: priceCentsPerGram.toString(),
    };
    const { subject, text, html } = renderNotification("price_alert", emailLocaleFor(alert.locale), payload);

    let status: "queued" | "sent" | "failed" = "queued";
    if (env.SMTP_HOST) {
      try {
        transport ??= nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_PORT === 465,
          auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
        });
        await transport.sendMail({
          from: env.MAIL_FROM,
          to: alert.email,
          subject,
          html,
          text,
        });
        status = "sent";
      } catch (err) {
        console.error(`alert mail failed (${alert.id}):`, err);
        status = "failed";
      }
    }

    await db.insert(notifications).values({
      userId: alert.userId,
      channel: "email",
      template: "price_alert",
      payload,
      status,
      sentAt: status === "sent" ? new Date() : null,
    });
    console.log(
      `[alert] ${asset} ${alert.direction} ${alert.threshold} fired at ${priceCentsPerGram} (${status})`,
    );
  }
}
