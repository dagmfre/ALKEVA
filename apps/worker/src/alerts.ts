import nodemailer, { type Transporter } from "nodemailer";
import { and, eq, isNull, sql } from "drizzle-orm";
import { notifications, priceAlerts, users, type Db } from "@alkeva/db";
import type { Env, MetalAsset } from "@alkeva/shared";

/**
 * The deterministic half of price alerts (F24): thresholds trigger here, in
 * the worker, on every tick — no model involved. One-shot per alert: the
 * conditional UPDATE that stamps triggered_at is the mutex, so a tick that
 * races another worker fires each alert exactly once.
 *
 * The email copy is deliberately non-advisory: it states the crossing and
 * nothing else. (Mirrors the API's notification templates; the worker is a
 * plain script, so the small duplication buys not booting Nest here.)
 */

let transport: Transporter | null = null;

function fmtEtb(cents: bigint): string {
  const whole = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${whole}.${(cents % 100n).toString().padStart(2, "0")}`;
}

const METAL_AM: Record<string, string> = { XAU: "ወርቅ", XPT: "ፕላቲነም" };
const METAL_EN: Record<string, string> = { XAU: "gold", XPT: "platinum" };

function renderAlert(
  locale: "am" | "en",
  asset: string,
  direction: "above" | "below",
  thresholdCents: bigint,
  priceCents: bigint,
): { subject: string; body: string } {
  const am = locale === "am";
  const metal = am ? (METAL_AM[asset] ?? asset) : (METAL_EN[asset] ?? asset);
  const dir = direction === "above" ? (am ? "በላይ" : "above") : (am ? "በታች" : "below");
  return {
    subject: am ? `የዋጋ ማንቂያ፦ ${metal} — ALKEVA` : `Price alert: ${metal} — ALKEVA`,
    body: am
      ? `የ${metal} ዋጋ ከብር ${fmtEtb(thresholdCents)}/ግ ${dir} ደርሷል። አሁን፦ ብር ${fmtEtb(priceCents)}/ግ።`
      : `The ${metal} price crossed ${dir} ETB ${fmtEtb(thresholdCents)}/g. Now: ETB ${fmtEtb(priceCents)}/g.`,
  };
}

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
    const { subject, body } = renderAlert(
      alert.locale,
      asset,
      alert.direction,
      alert.threshold,
      priceCentsPerGram,
    );

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
          html: `<p style="font-family:sans-serif;font-size:15px">${body}</p>`,
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
