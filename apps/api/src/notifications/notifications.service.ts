import { Inject, Injectable } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import { notifications, users, type Db } from "@alkeva/db";
import type { NotificationsResponse } from "@alkeva/shared";
import { DB } from "../core/core.module.js";
import { MailService } from "./mail.service.js";
import {
  renderNotification,
  type NotificationPayload,
  type NotificationTemplate,
} from "./templates.js";

/**
 * One entry point for "the user was informed": inserts the in-app record,
 * then best-effort email in the user's locale. Deliberately never throws —
 * a notification failure must not roll back or fail a money path, so every
 * caller can fire-and-forget (`void notifications.emit(...)` after commit).
 */
@Injectable()
export class NotificationsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly mail: MailService,
  ) {}

  async emit(
    userId: string,
    template: NotificationTemplate,
    payload: NotificationPayload,
  ): Promise<void> {
    try {
      const userRows = await this.db
        .select({ email: users.email, locale: users.locale })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const user = userRows[0];
      if (!user) return;

      const inserted = await this.db
        .insert(notifications)
        .values({ userId, channel: "email", template, payload, status: "queued" })
        .returning({ id: notifications.id });
      const row = inserted[0];

      const { subject, body } = renderNotification(template, user.locale, payload);
      const outcome = await this.mail.send(
        user.email,
        subject,
        `<p style="font-family:sans-serif;font-size:15px">${body}</p>`,
      );

      // "skipped" (no SMTP configured) keeps status=queued: recorded, undelivered.
      if (row && outcome !== "skipped") {
        await this.db
          .update(notifications)
          .set({ status: outcome, sentAt: outcome === "sent" ? new Date() : null })
          .where(eq(notifications.id, row.id));
      }
    } catch (err) {
      console.error(`notification emit failed (${template} → ${userId}):`, err);
    }
  }

  async listOwn(userId: string): Promise<NotificationsResponse> {
    const rows = await this.db
      .select({
        id: notifications.id,
        template: notifications.template,
        payload: notifications.payload,
        status: notifications.status,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(20);

    return {
      notifications: rows.map((r) => ({
        id: r.id,
        template: r.template,
        payload: (r.payload ?? null) as Record<string, string> | null,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }
}
