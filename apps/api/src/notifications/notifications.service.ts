import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, count, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { Redis } from "ioredis";
import { notifications, pushSubscriptions, users, type Db } from "@alkeva/db";
import {
  notificationCategory,
  SECRET_TEMPLATES,
  type Env,
  type MarkReadDto,
  type NotificationPayload,
  type NotificationsResponse,
  type NotificationTemplate,
  type NotifyPrefs,
  type NotifyPrefsDto,
  type PushConfigResponse,
  type PushSubscriptionDto,
  type Role,
} from "@alkeva/shared";
import { DB, ENV, REDIS } from "../core/core.module.js";

/** Redis channel per user; the API's SSE stream and the worker both publish here. */
export const notifyChannel = (userId: string) => `notify:${userId}`;

const DEFAULT_PREFS: NotifyPrefs = {
  alerts: { email: true, push: true },
  money: { email: true, push: true },
  security: { push: true },
};

export function resolvePrefs(raw: unknown): NotifyPrefs {
  const p = (raw ?? {}) as Partial<NotifyPrefs>;
  return {
    alerts: { ...DEFAULT_PREFS.alerts, ...(p.alerts ?? {}) },
    money: { ...DEFAULT_PREFS.money, ...(p.money ?? {}) },
    security: { ...DEFAULT_PREFS.security, ...(p.security ?? {}) },
  };
}

/**
 * "The user was informed." Since Phase 10 this only RECORDS the notice — the
 * in-app row doubles as an outbox — and announces it on Redis so open tabs
 * update at once. Email and browser push are delivered by the worker's
 * dispatcher with timeouts and retries, so a slow or dead mail server can
 * never hold up a request (or the price tick, which used to send alert email
 * inline). Never throws: callers fire-and-forget after their money commits.
 */
@Injectable()
export class NotificationsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async emit(
    userId: string,
    template: NotificationTemplate,
    payload: NotificationPayload,
  ): Promise<void> {
    if (SECRET_TEMPLATES.includes(template)) {
      // A code or reset link in a stored row would defeat hashing them.
      console.error(`refusing to store secret-bearing template ${template}`);
      return;
    }
    try {
      const userRows = await this.db
        .select({ prefs: users.notifyPrefs })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const user = userRows[0];
      if (!user) return;

      const prefs = resolvePrefs(user.prefs);
      const category = notificationCategory(template);
      const emailOn = category === "security" ? true : prefs[category].email;
      const pushOn = prefs[category].push;
      const hasPush =
        pushOn &&
        this.pushEnabled &&
        (await this.db
          .select({ n: count() })
          .from(pushSubscriptions)
          .where(eq(pushSubscriptions.userId, userId)))[0]!.n > 0;

      const inserted = await this.db
        .insert(notifications)
        .values({
          userId,
          channel: "email",
          template,
          payload,
          status: emailOn ? "queued" : "skipped",
          pushStatus: hasPush ? "queued" : "skipped",
        })
        .returning({ id: notifications.id });
      await this.redis
        .publish(notifyChannel(userId), JSON.stringify({ id: inserted[0]?.id, template }))
        .catch(() => undefined);
    } catch (err) {
      console.error(`notification emit failed (${template} → ${userId}):`, err);
    }
  }

  /** The same notice to every active staff member holding one of `roles`. */
  async emitToStaff(
    roles: Role[],
    template: NotificationTemplate,
    payload: NotificationPayload,
  ): Promise<void> {
    try {
      const staff = await this.db
        .select({ id: users.id })
        .from(users)
        .where(and(inArray(users.role, roles), eq(users.status, "active")));
      for (const member of staff) await this.emit(member.id, template, payload);
    } catch (err) {
      console.error(`staff notification failed (${template}):`, err);
    }
  }

  async listOwn(userId: string, before?: string): Promise<NotificationsResponse> {
    const limit = 20;
    const cursor = before ? new Date(before) : null;
    const rows = await this.db
      .select({
        id: notifications.id,
        template: notifications.template,
        payload: notifications.payload,
        status: notifications.status,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          cursor && !Number.isNaN(cursor.getTime()) ? lt(notifications.createdAt, cursor) : undefined,
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(limit + 1);
    const unread = await this.db
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));

    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      notifications: page.map((r) => ({
        id: r.id,
        template: r.template,
        payload: (r.payload ?? null) as Record<string, string> | null,
        status: r.status,
        readAt: r.readAt ? r.readAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
      })),
      unreadCount: unread[0]?.n ?? 0,
      nextCursor: rows.length > limit && last ? last.createdAt.toISOString() : null,
    };
  }

  async markRead(userId: string, dto: MarkReadDto): Promise<{ unreadCount: number }> {
    await this.db
      .update(notifications)
      .set({ readAt: sql`now()` })
      .where(
        and(
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
          "ids" in dto ? inArray(notifications.id, dto.ids) : undefined,
        ),
      );
    const unread = await this.db
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return { unreadCount: unread[0]?.n ?? 0 };
  }

  // ── preferences ────────────────────────────────────────────────

  async getPrefs(userId: string): Promise<NotifyPrefs> {
    const rows = await this.db
      .select({ prefs: users.notifyPrefs })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!rows[0]) throw new NotFoundException("user_not_found");
    return resolvePrefs(rows[0].prefs);
  }

  async setPrefs(userId: string, dto: NotifyPrefsDto): Promise<NotifyPrefs> {
    const current = await this.getPrefs(userId);
    const next: NotifyPrefs = {
      alerts: dto.alerts ?? current.alerts,
      money: dto.money ?? current.money,
      security: dto.security ?? current.security,
    };
    await this.db.update(users).set({ notifyPrefs: next }).where(eq(users.id, userId));
    return next;
  }

  // ── browser push subscriptions ─────────────────────────────────

  get pushEnabled(): boolean {
    return (
      this.env.WEB_PUSH_VAPID_PUBLIC_KEY.length > 0 && this.env.WEB_PUSH_VAPID_PRIVATE_KEY.length > 0
    );
  }

  async pushConfig(userId: string): Promise<PushConfigResponse> {
    const subs = await this.db
      .select({ n: count() })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
    return {
      enabled: this.pushEnabled,
      publicKey: this.pushEnabled ? this.env.WEB_PUSH_VAPID_PUBLIC_KEY : null,
      subscriptions: subs[0]?.n ?? 0,
    };
  }

  async subscribe(userId: string, dto: PushSubscriptionDto, userAgent: string | null): Promise<void> {
    // One row per browser endpoint; re-subscribing (or a shared device
    // changing hands) moves it to the current user.
    await this.db
      .insert(pushSubscriptions)
      .values({
        userId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent: userAgent?.slice(0, 400) ?? null,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId, p256dh: dto.keys.p256dh, auth: dto.keys.auth },
      });
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
  }
}
