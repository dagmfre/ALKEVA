import nodemailer, { type Transporter } from "nodemailer";
import { eq, inArray, sql } from "drizzle-orm";
import webpush from "web-push";
import { notifications, pushSubscriptions, users, type Db } from "@alkeva/db";
import {
  emailLocaleFor,
  renderNotification,
  type Env,
  type NotificationPayload,
  type NotificationTemplate,
} from "@alkeva/shared";

const BATCH = 20;
const MAX_ATTEMPTS = 5;
/** A claimed row is invisible to other passes for this long (crash safety). */
const LEASE_SECONDS = 120;

/**
 * The notification outbox dispatcher (Phase 10C). Every row the API or the
 * worker records is delivered from here: email through SMTP (with real
 * timeouts — a hung server used to stall the price tick), browser push
 * through Web Push (VAPID). Each channel keeps its own status; a failure is
 * retried with exponential backoff and given up after MAX_ATTEMPTS.
 *
 * Rows are claimed with FOR UPDATE SKIP LOCKED + a short lease, so a second
 * worker (or a restart mid-batch) never double-sends and never loses a row.
 */
export class NotificationDispatcher {
  private transport: Transporter | null = null;
  private readonly pushReady: boolean;

  constructor(
    private readonly db: Db,
    private readonly env: Env,
  ) {
    this.pushReady = env.WEB_PUSH_VAPID_PUBLIC_KEY.length > 0 && env.WEB_PUSH_VAPID_PRIVATE_KEY.length > 0;
    if (this.pushReady) {
      webpush.setVapidDetails(
        env.WEB_PUSH_SUBJECT,
        env.WEB_PUSH_VAPID_PUBLIC_KEY,
        env.WEB_PUSH_VAPID_PRIVATE_KEY,
      );
    }
  }

  /** One pass; returns how many rows it handled (the loop runs again at once if a full batch). */
  async runOnce(): Promise<number> {
    const claimed = await this.db.execute<{ id: string }>(sql`
      update notification set next_attempt_at = now() + make_interval(secs => ${LEASE_SECONDS})
      where id in (
        select id from notification
        where (status = 'queued' or push_status = 'queued') and next_attempt_at <= now()
        order by created_at
        limit ${BATCH}
        for update skip locked
      )
      returning id
    `);
    const ids = [...claimed].map((r) => r.id);
    if (ids.length === 0) return 0;

    const rows = await this.db
      .select({ n: notifications, email: users.email, locale: users.locale })
      .from(notifications)
      .innerJoin(users, eq(notifications.userId, users.id))
      .where(inArray(notifications.id, ids));

    for (const { n, email, locale } of rows) {
      const rendered = renderNotification(
        n.template as NotificationTemplate,
        emailLocaleFor(locale),
        (n.payload ?? {}) as NotificationPayload,
      );
      let emailStatus = n.status;
      let pushStatus = n.pushStatus;
      const errors: string[] = [];

      if (emailStatus === "queued") {
        if (!this.env.SMTP_HOST) {
          emailStatus = "skipped";
        } else {
          try {
            await this.mailer().sendMail({
              from: this.env.MAIL_FROM,
              to: email,
              subject: rendered.subject,
              html: rendered.html,
              text: rendered.text,
            });
            emailStatus = "sent";
          } catch (err) {
            errors.push(`email: ${(err as Error).message}`.slice(0, 300));
          }
        }
      }

      if (pushStatus === "queued") {
        if (!this.pushReady) {
          pushStatus = "skipped";
        } else {
          const result = await this.push(n.userId!, n.id, n.template, rendered.subject, rendered.text, n.payload);
          if (result === "sent" || result === "none") pushStatus = result === "sent" ? "sent" : "skipped";
          else errors.push(`push: ${result}`.slice(0, 300));
        }
      }

      const attempts = n.attempts + (errors.length > 0 ? 1 : 0);
      const giveUp = attempts >= MAX_ATTEMPTS;
      if (errors.length > 0 && giveUp) {
        if (emailStatus === "queued") emailStatus = "failed";
        if (pushStatus === "queued") pushStatus = "failed";
      }
      const backoffMin = 2 ** Math.min(attempts, 6); // 2, 4, 8 … 64 min
      await this.db
        .update(notifications)
        .set({
          status: emailStatus,
          pushStatus,
          attempts,
          lastError: errors.length > 0 ? errors.join(" | ") : null,
          sentAt: emailStatus === "sent" && n.status !== "sent" ? new Date() : n.sentAt,
          nextAttemptAt: errors.length > 0 && !giveUp ? sql`now() + make_interval(mins => ${backoffMin})` : sql`now()`,
        })
        .where(eq(notifications.id, n.id));
      if (errors.length > 0) console.warn(`[notify] ${n.template} → ${n.userId}: ${errors.join(" | ")}`);
    }
    return ids.length;
  }

  private mailer(): Transporter {
    this.transport ??= nodemailer.createTransport({
      host: this.env.SMTP_HOST,
      port: this.env.SMTP_PORT,
      secure: this.env.SMTP_PORT === 465,
      auth: this.env.SMTP_USER ? { user: this.env.SMTP_USER, pass: this.env.SMTP_PASS } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    return this.transport;
  }

  /** "sent" if at least one browser accepted, "none" if the user has none left, else the error. */
  private async push(
    userId: string,
    id: string,
    template: string,
    subject: string,
    text: string,
    payload: unknown,
  ): Promise<string> {
    const subs = await this.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
    if (subs.length === 0) return "none";
    const body = JSON.stringify({
      id,
      template,
      title: subject.replace(/\s+—\s+ALKEVA$/u, ""),
      body: text.split("\n")[0]?.slice(0, 180) ?? "",
      url: targetUrl(template, payload),
    });
    let delivered = 0;
    let lastError = "";
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 3600, urgency: template === "price_alert" ? "high" : "normal", timeout: 10_000 },
        );
        delivered++;
        await this.db
          .update(pushSubscriptions)
          .set({ lastSuccessAt: new Date() })
          .where(eq(pushSubscriptions.id, s.id));
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // The browser unsubscribed or the subscription expired: forget it.
          await this.db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
        } else {
          lastError = `${status ?? ""} ${(err as Error).message}`.trim();
        }
      }
    }
    if (delivered > 0) return "sent";
    return lastError || "none";
  }
}

/** Where a click on the notification should land. */
function targetUrl(template: string, payload: unknown): string {
  const p = (payload ?? {}) as Record<string, string>;
  if (p.url && p.url.startsWith("/")) return p.url;
  if (template === "order_receipt" && p.orderId) return `/receipt/${p.orderId}`;
  if (template.startsWith("payout_") || template.startsWith("deposit_")) return "/wallet";
  if (template.startsWith("delivery_")) return "/portfolio";
  if (template === "price_alert") return "/trade";
  if (template === "new_sign_in" || template === "passkey_added") return "/account";
  return "/notifications";
}
