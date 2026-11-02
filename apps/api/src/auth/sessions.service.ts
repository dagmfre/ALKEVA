import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { Redis } from "ioredis";
import { auditLogs, authSessions, users, type Db } from "@alkeva/db";
import type { Env, Role, SessionItem } from "@alkeva/shared";
import { DB, ENV, REDIS } from "../core/core.module.js";
import type { AccessPayload } from "./auth.service.js";

/** How a session was established — the OIDC `amr` vocabulary, loosely. */
export type AuthMethodRef = "pwd" | "google" | "fayda" | "webauthn";

export interface ClientContext {
  userAgent: string | null;
  ip: string | null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** A second tab refreshing with the token another tab just rotated. */
const ROTATION_GRACE_MS = 60_000;

/**
 * Per-device sessions (migration 0012). Replaces the single
 * `user.refresh_token_hash`, which made a sign-in on one device silently log
 * every other device out — the phone's "blank Portfolio".
 *
 * The refresh token is opaque: `${sessionId}.${secret}`; only sha256(secret)
 * is stored (the secret is 32 random bytes, so a fast hash is enough). Each
 * refresh rotates the secret. Presenting a secret that was already rotated
 * away — outside the short grace for racing tabs — means the token was copied:
 * the session is revoked on the spot (refresh-token reuse detection).
 *
 * Revocation reaches live access tokens through Redis: a revoked session id is
 * remembered for one access-token lifetime and the guard refuses it.
 */
@Injectable()
export class SessionsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly jwt: JwtService,
  ) {}

  /** Opens a session for a user already proven by password / Google / Fayda / passkey. */
  async create(
    userId: string,
    role: Role,
    amr: AuthMethodRef[],
    ctx: ClientContext,
  ): Promise<{ tokens: TokenPair; newDevice: boolean }> {
    // "New device" = this browser has never held a session for this user.
    // The first session an account ever has is not news.
    const prior = await this.db
      .select({ ua: authSessions.userAgent })
      .from(authSessions)
      .where(eq(authSessions.userId, userId))
      .limit(200);
    const newDevice =
      prior.length > 0 && !prior.some((p) => (p.ua ?? "") === (ctx.userAgent ?? ""));

    const secret = randomBytes(32).toString("base64url");
    const inserted = await this.db
      .insert(authSessions)
      .values({
        userId,
        refreshHash: sha256(secret),
        amr,
        userAgent: ctx.userAgent?.slice(0, 400) ?? null,
        ip: ctx.ip,
        expiresAt: new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_SEC * 1000),
      })
      .returning();
    const session = inserted[0]!;
    const accessToken = await this.signAccess(userId, role, session.id, amr, session.authTime);
    return { tokens: { accessToken, refreshToken: `${session.id}.${secret}` }, newDevice };
  }

  /**
   * Rotates a refresh token. `grace` means another tab rotated this exact
   * token a moment ago: the browser already holds the new cookies, so the
   * caller answers OK without setting any.
   */
  async rotate(
    refreshToken: string,
    ctx: ClientContext,
  ): Promise<{ userId: string; tokens: TokenPair | null }> {
    const [sessionId, secret] = refreshToken.split(".");
    if (!sessionId || !secret || !/^[0-9a-f-]{36}$/.test(sessionId)) {
      throw new UnauthorizedException("invalid_refresh");
    }
    const rows = await this.db
      .select({ session: authSessions, role: users.role })
      .from(authSessions)
      .innerJoin(users, eq(authSessions.userId, users.id))
      .where(eq(authSessions.id, sessionId))
      .limit(1);
    const found = rows[0];
    if (!found || found.session.revokedAt || found.session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException("invalid_refresh");
    }
    const { session, role } = found;
    const presented = sha256(secret);

    if (safeEqual(presented, session.refreshHash)) {
      const next = randomBytes(32).toString("base64url");
      // Conditional on the hash we just matched: two concurrent rotations of
      // the same token cannot both win.
      const updated = await this.db
        .update(authSessions)
        .set({
          refreshHash: sha256(next),
          previousHash: session.refreshHash,
          rotatedAt: sql`now()`,
          lastUsedAt: sql`now()`,
          userAgent: ctx.userAgent?.slice(0, 400) ?? session.userAgent,
          ip: ctx.ip ?? session.ip,
        })
        .where(and(eq(authSessions.id, session.id), eq(authSessions.refreshHash, session.refreshHash)))
        .returning({ id: authSessions.id });
      if (updated.length === 0) return { userId: session.userId, tokens: null };
      const accessToken = await this.signAccess(
        session.userId,
        role,
        session.id,
        session.amr as AuthMethodRef[],
        session.authTime,
      );
      return { userId: session.userId, tokens: { accessToken, refreshToken: `${session.id}.${next}` } };
    }

    const inGrace =
      session.previousHash !== null &&
      safeEqual(presented, session.previousHash) &&
      session.rotatedAt !== null &&
      Date.now() - session.rotatedAt.getTime() < ROTATION_GRACE_MS;
    if (inGrace) return { userId: session.userId, tokens: null };

    // An old secret for a live session: the token was copied. Kill it.
    await this.revoke(session.id, "refresh_reuse");
    await this.db.insert(auditLogs).values({
      actorId: session.userId,
      actorLabel: "system:sessions",
      action: "refresh_token_reuse",
      targetType: "session",
      targetId: session.id,
      after: { ip: ctx.ip, userAgent: ctx.userAgent },
    });
    throw new UnauthorizedException("invalid_refresh");
  }

  async revoke(sessionId: string, reason: string): Promise<void> {
    await this.db
      .update(authSessions)
      .set({ revokedAt: sql`now()`, revokedReason: reason })
      .where(and(eq(authSessions.id, sessionId), isNull(authSessions.revokedAt)));
    await this.markRevoked([sessionId]);
  }

  /** Signs a user out everywhere (optionally keeping the current device). */
  async revokeAllForUser(userId: string, reason: string, exceptSessionId?: string): Promise<number> {
    const revoked = await this.db
      .update(authSessions)
      .set({ revokedAt: sql`now()`, revokedReason: reason })
      .where(
        and(
          eq(authSessions.userId, userId),
          isNull(authSessions.revokedAt),
          ...(exceptSessionId ? [ne(authSessions.id, exceptSessionId)] : []),
        ),
      )
      .returning({ id: authSessions.id });
    await this.markRevoked(revoked.map((r) => r.id));
    return revoked.length;
  }

  async listActive(userId: string, currentSessionId?: string): Promise<SessionItem[]> {
    const rows = await this.db
      .select()
      .from(authSessions)
      .where(
        and(
          eq(authSessions.userId, userId),
          isNull(authSessions.revokedAt),
          gt(authSessions.expiresAt, sql`now()`),
        ),
      )
      .orderBy(desc(authSessions.lastUsedAt))
      .limit(30);
    return rows.map((r) => ({
      id: r.id,
      userAgent: r.userAgent,
      ip: r.ip,
      amr: r.amr,
      createdAt: r.createdAt.toISOString(),
      lastUsedAt: r.lastUsedAt.toISOString(),
      current: r.id === currentSessionId,
    }));
  }

  async isRevoked(sessionId: string): Promise<boolean> {
    return (await this.redis.exists(`sess:revoked:${sessionId}`)) === 1;
  }

  private async markRevoked(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const pipeline = this.redis.pipeline();
    for (const id of ids) {
      pipeline.set(`sess:revoked:${id}`, "1", "EX", this.env.ACCESS_TOKEN_TTL_SEC + 60);
    }
    await pipeline.exec();
  }

  private signAccess(
    userId: string,
    role: Role,
    sid: string,
    amr: AuthMethodRef[],
    authTime: Date,
  ): Promise<string> {
    return this.jwt.signAsync(
      {
        sub: userId,
        role,
        sid,
        amr,
        auth_time: Math.floor(authTime.getTime() / 1000),
        type: "access",
      } satisfies AccessPayload,
      { secret: this.env.JWT_SECRET, expiresIn: this.env.ACCESS_TOKEN_TTL_SEC },
    );
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
