import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { Redis } from "ioredis";
import {
  auditLogs,
  identityVerifications,
  passwordResetTokens,
  users,
  type Db,
} from "@alkeva/db";
import {
  emailLocaleFor,
  renderNotification,
  type Env,
  type Locale,
  type LoginDto,
  type MeResponse,
  type RegisterDto,
  type Role,
} from "@alkeva/shared";
import { DB, ENV, REDIS } from "../core/core.module.js";
import { MailService } from "../notifications/mail.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { EmailCodesService } from "./email-codes.service.js";
import {
  SessionsService,
  type AuthMethodRef,
  type ClientContext,
  type TokenPair,
} from "./sessions.service.js";

export interface AccessPayload {
  sub: string;
  role: Role;
  type: "access";
  /** Session id (migration 0012). Absent only on tokens minted before it. */
  sid?: string;
  /** How the session was established. */
  amr?: AuthMethodRef[];
  /** Seconds since epoch of the actual sign-in (not of the last refresh). */
  auth_time?: number;
}

export type { TokenPair } from "./sessions.service.js";

export type UserRow = typeof users.$inferSelect;

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly sessions: SessionsService,
    private readonly mail: MailService,
    private readonly codes: EmailCodesService,
    private readonly notifications: NotificationsService,
  ) {}

  get passwordEnabled(): boolean {
    return this.env.AUTH_METHODS.includes("password");
  }

  async register(
    dto: RegisterDto,
    ctx: ClientContext,
  ): Promise<{ user: MeResponse; tokens: TokenPair }> {
    if (!this.passwordEnabled) throw new ForbiddenException("method_disabled");
    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(sql`lower(${users.email})`, dto.email.toLowerCase()))
      .limit(1);
    if (existing.length > 0) {
      throw new ConflictException("email_taken");
    }

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    const inserted = await this.db
      .insert(users)
      .values({
        email: dto.email.toLowerCase(),
        passwordHash,
        fullName: dto.fullName,
        locale: dto.locale,
        // The DTO's z.literal(true) already refused an unchecked box.
        termsAcceptedAt: new Date(),
      })
      .returning();
    const user = inserted[0]!;

    // The address is unproven until the emailed code comes back. A send
    // failure must not fail the registration — the user can ask again.
    await this.codes.issue(user.id, "verify_email").catch((err) => {
      console.error(`verification code send failed for ${user.id}:`, err);
    });

    const { tokens } = await this.sessions.create(user.id, user.role, ["pwd"], ctx);
    return { user: await this.toMe(user), tokens };
  }

  async login(dto: LoginDto, ctx: ClientContext): Promise<{ user: MeResponse; tokens: TokenPair }> {
    const user = await this.verifyPassword(dto);
    return this.openSession(user, ["pwd"], ctx);
  }

  /**
   * The password proof on its own — lockout, uniform errors and the
   * method-disabled rule included — for callers that open a session
   * themselves (login, and linking a Telegram account by password).
   */
  async verifyPassword(dto: LoginDto): Promise<UserRow> {
    const email = dto.email.toLowerCase();
    const lockKey = `login:fail:${email}`;
    const failures = Number((await this.redis.get(lockKey)) ?? "0");
    if (failures >= this.env.LOGIN_MAX_FAILURES) {
      // Same answer for every address, known or not — no enumeration.
      throw new HttpException(
        { message: "login_locked", retryAfterSeconds: this.env.LOGIN_LOCK_MINUTES * 60 },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const found = await this.db
      .select()
      .from(users)
      .where(eq(sql`lower(${users.email})`, email))
      .limit(1);
    const user = found[0];
    // Uniform error for unknown email vs wrong password — no account
    // enumeration. A NULL hash (provider-only account) refuses identically.
    if (
      !user ||
      user.passwordHash === null ||
      !(await argon2.verify(user.passwordHash, dto.password))
    ) {
      await this.redis
        .multi()
        .incr(lockKey)
        .expire(lockKey, this.env.LOGIN_LOCK_MINUTES * 60)
        .exec();
      throw new UnauthorizedException("invalid_credentials");
    }
    await this.redis.del(lockKey);

    // Password sign-in can be switched off for customers. Staff keep it —
    // their accounts are seeded with passwords and have no other way in.
    // Checked only after the password matched, so it reveals nothing.
    if (!this.passwordEnabled && user.role === "user") {
      throw new ForbiddenException("method_disabled");
    }
    return user;
  }

  /** Rotating refresh, per device. `tokens: null` = a racing tab; send no cookies. */
  async refresh(
    refreshToken: string,
    ctx: ClientContext,
  ): Promise<{ user: MeResponse; tokens: TokenPair | null }> {
    const { userId, tokens } = await this.sessions.rotate(refreshToken, ctx);
    return { user: await this.me(userId), tokens };
  }

  async logout(auth: AccessPayload): Promise<void> {
    if (auth.sid) await this.sessions.revoke(auth.sid, "logout");
  }

  async me(userId: string): Promise<MeResponse> {
    const found = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!found[0]) throw new UnauthorizedException();
    return this.toMe(found[0]);
  }

  /**
   * Persist the language the user actually reads. The web app keeps the UI
   * locale in a cookie, but the assistant and every email read `user.locale`.
   */
  async setLocale(userId: string, locale: Locale): Promise<MeResponse> {
    const updated = await this.db
      .update(users)
      .set({ locale })
      .where(eq(users.id, userId))
      .returning();
    if (!updated[0]) throw new UnauthorizedException();
    return this.toMe(updated[0]);
  }

  /**
   * Issue a session for a user already authenticated by another proof —
   * Google, Fayda, or a passkey. Providers never get their own session shape.
   */
  async issueSessionFor(
    userId: string,
    amr: AuthMethodRef[],
    ctx: ClientContext,
    opts: { ttlSec?: number } = {},
  ): Promise<{ user: MeResponse; tokens: TokenPair }> {
    const found = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = found[0];
    if (!user) throw new UnauthorizedException("invalid_credentials");
    return this.openSession(user, amr, ctx, opts);
  }

  // ── email verification ──────────────────────────────────────────

  async sendEmailCode(userId: string): Promise<{ expiresAt: string; sentTo: string }> {
    const user = await this.mustGetUser(userId);
    if (user.emailVerifiedAt) throw new ConflictException("email_already_verified");
    const issued = await this.codes.issue(userId, "verify_email");
    return { expiresAt: issued.expiresAt, sentTo: issued.sentTo };
  }

  async verifyEmail(userId: string, code: string): Promise<MeResponse> {
    const user = await this.mustGetUser(userId);
    if (user.emailVerifiedAt) return this.toMe(user);
    const payload = await this.codes.consume(userId, "verify_email", code);
    // The code proves the address it was SENT to; if the account's address
    // changed since, it proves nothing about the current one.
    if (payload.email && payload.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new UnprocessableEntityException("code_invalid");
    }
    const updated = await this.db
      .update(users)
      .set({ emailVerifiedAt: sql`now()` })
      .where(eq(users.id, userId))
      .returning();
    await this.db.insert(auditLogs).values({
      actorId: userId,
      actorLabel: `user:${userId}`,
      action: "email_verified",
      targetType: "user",
      targetId: userId,
    });
    return this.toMe(updated[0] ?? user);
  }

  // ── password recovery ───────────────────────────────────────────

  /**
   * Password recovery, step 1. Always resolves — the caller answers 202
   * whether or not the email exists. Only the sha256 of the raw token is
   * stored. The link carries the token in the URL FRAGMENT (#token=…), which
   * browsers never send to a server, so it cannot land in an access log.
   * Unverified addresses get nothing: a reset link to an address nobody has
   * proven would let whoever owns that mailbox take the account.
   */
  async requestRecovery(email: string): Promise<void> {
    const found = await this.db
      .select({
        id: users.id,
        email: users.email,
        locale: users.locale,
        verified: users.emailVerifiedAt,
      })
      .from(users)
      .where(eq(sql`lower(${users.email})`, email.toLowerCase()))
      .limit(1);
    const user = found[0];
    if (!user || !user.verified) return;

    // One live token at a time: issuing a new link retires prior unused ones.
    await this.db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));

    const raw = randomBytes(32).toString("base64url");
    await this.db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: createHash("sha256").update(raw).digest("hex"),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    const resetUrl = `${this.env.WEB_ORIGIN}/reset-password#token=${raw}`;
    const { subject, text, html } = renderNotification("password_reset", emailLocaleFor(user.locale), {
      resetUrl,
    });
    const outcome = await this.mail.send(user.email, subject, html, text);
    if (outcome !== "sent") {
      console.warn(`password reset mail ${outcome} for user ${user.id}`);
    }
  }

  /** Password recovery, step 2: consume the token, set the new hash, sign out everywhere. */
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const found = await this.db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1);
    const token = found[0];
    if (!token || token.usedAt !== null || token.expiresAt.getTime() < Date.now()) {
      throw new UnprocessableEntityException("invalid_reset_token");
    }

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    // Conditional UPDATE — the mutex against a raced double-submit.
    const claimed = await this.db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.id, token.id), isNull(passwordResetTokens.usedAt)))
      .returning({ id: passwordResetTokens.id });
    if (claimed.length === 0) throw new UnprocessableEntityException("invalid_reset_token");

    await this.db.update(users).set({ passwordHash }).where(eq(users.id, token.userId));
    await this.sessions.revokeAllForUser(token.userId, "password_reset");

    await this.db.insert(auditLogs).values({
      actorId: token.userId,
      actorLabel: "user:password_reset",
      action: "password_reset",
      targetType: "user",
      targetId: token.userId,
    });
  }

  // ── internals ───────────────────────────────────────────────────

  private async openSession(
    user: UserRow,
    amr: AuthMethodRef[],
    ctx: ClientContext,
    opts: { ttlSec?: number } = {},
  ): Promise<{ user: MeResponse; tokens: TokenPair }> {
    const { tokens, newDevice } = await this.sessions.create(user.id, user.role, amr, ctx, opts);
    if (newDevice) {
      void this.notifications.emit(user.id, "new_sign_in", {
        device: describeUserAgent(ctx.userAgent),
        ip: ctx.ip ?? "",
      });
    }
    return { user: await this.toMe(user), tokens };
  }

  private async mustGetUser(userId: string): Promise<UserRow> {
    const found = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!found[0]) throw new UnauthorizedException();
    return found[0];
  }

  async toMe(user: UserRow): Promise<MeResponse> {
    const idv = await this.db
      .select({ legalName: identityVerifications.legalName })
      .from(identityVerifications)
      .where(eq(identityVerifications.userId, user.id))
      .limit(1);
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      locale: user.locale,
      role: user.role,
      status: user.status,
      kycTier: user.kycTier,
      emailVerified: user.emailVerifiedAt !== null,
      identityVerified: idv.length > 0,
      hasPassword: user.passwordHash !== null,
    };
  }
}

/** "Mozilla/5.0 (Linux; Android 14…) … Chrome/131…" → "Chrome on Android". */
export function describeUserAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Telegram/i.test(ua)
    ? "Telegram"
    : /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "unknown OS";
  return `${browser} on ${os}`;
}
