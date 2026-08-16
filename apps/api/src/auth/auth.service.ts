import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { auditLogs, passwordResetTokens, users, type Db } from "@alkeva/db";
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
import { DB, ENV } from "../core/core.module.js";
import { MailService } from "../notifications/mail.service.js";

export interface AccessPayload {
  sub: string;
  role: Role;
  type: "access";
}
export interface RefreshPayload {
  sub: string;
  type: "refresh";
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
  ) {}

  async register(dto: RegisterDto): Promise<{ user: MeResponse; tokens: TokenPair }> {
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

    const tokens = await this.issueTokens(user.id, user.role);
    return { user: this.toMe(user), tokens };
  }

  async login(dto: LoginDto): Promise<{ user: MeResponse; tokens: TokenPair }> {
    const found = await this.db
      .select()
      .from(users)
      .where(eq(sql`lower(${users.email})`, dto.email.toLowerCase()))
      .limit(1);
    const user = found[0];
    // Uniform error for unknown email vs wrong password — no account
    // enumeration. A NULL hash (Google-only account, migration 0006) refuses
    // identically: such an account gains a password via the reset flow.
    if (
      !user ||
      user.passwordHash === null ||
      !(await argon2.verify(user.passwordHash, dto.password))
    ) {
      throw new UnauthorizedException("invalid_credentials");
    }

    const tokens = await this.issueTokens(user.id, user.role);
    return { user: this.toMe(user), tokens };
  }

  /** Rotating refresh: the presented token must match the stored hash, then it is replaced. */
  async refresh(refreshToken: string): Promise<{ user: MeResponse; tokens: TokenPair }> {
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: this.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException("invalid_refresh");
    }
    if (payload.type !== "refresh") throw new UnauthorizedException("invalid_refresh");

    const found = await this.db
      .select()
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);
    const user = found[0];
    if (
      !user ||
      !user.refreshTokenHash ||
      !(await argon2.verify(user.refreshTokenHash, refreshToken))
    ) {
      throw new UnauthorizedException("invalid_refresh");
    }

    const tokens = await this.issueTokens(user.id, user.role);
    return { user: this.toMe(user), tokens };
  }

  async logout(userId: string): Promise<void> {
    await this.db
      .update(users)
      .set({ refreshTokenHash: null })
      .where(eq(users.id, userId));
  }

  async me(userId: string): Promise<MeResponse> {
    const found = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!found[0]) throw new UnauthorizedException();
    return this.toMe(found[0]);
  }

  /**
   * Persist the language the user actually reads. The web app keeps the UI
   * locale in a cookie (no URL prefixes), but the AI assistant and every
   * transactional email read `user.locale` from the database — without this,
   * switching to Tigrinya changed the screens and left the mail in the
   * language chosen at registration.
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
   * a verified Google id_token or a WebAuthn assertion. The same cookie pair
   * password login produces; providers never get their own session shape.
   */
  async issueSessionFor(userId: string): Promise<{ user: MeResponse; tokens: TokenPair }> {
    const found = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = found[0];
    if (!user) throw new UnauthorizedException("invalid_credentials");
    const tokens = await this.issueTokens(user.id, user.role);
    return { user: this.toMe(user), tokens };
  }

  /**
   * Password recovery, step 1. Always resolves — the caller answers 202
   * whether or not the email exists (no account enumeration). Only the
   * sha256 of the raw token is stored; the raw token exists exactly once,
   * inside the emailed link. The reset email deliberately bypasses the
   * notifications table: its payload would persist the raw URL and defeat
   * the hash-only design.
   */
  async requestRecovery(email: string): Promise<void> {
    const found = await this.db
      .select({ id: users.id, email: users.email, locale: users.locale })
      .from(users)
      .where(eq(sql`lower(${users.email})`, email.toLowerCase()))
      .limit(1);
    const user = found[0];
    if (!user) return;

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

    const resetUrl = `${this.env.WEB_ORIGIN}/reset-password?token=${raw}`;
    const { subject, text, html } = renderNotification("password_reset", emailLocaleFor(user.locale), {
      resetUrl,
    });
    const outcome = await this.mail.send(user.email, subject, html, text);
    if (outcome !== "sent") {
      // Without SMTP the flow cannot complete — say so in the server log
      // (the HTTP answer stays a uniform 202).
      console.warn(`password reset mail ${outcome} for user ${user.id}`);
    }
  }

  /** Password recovery, step 2: consume the token, set the new hash, log out everywhere. */
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
    // Mark used first with a conditional UPDATE — the mutex against a raced
    // double-submit of the same link.
    const claimed = await this.db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.id, token.id), isNull(passwordResetTokens.usedAt)))
      .returning({ id: passwordResetTokens.id });
    if (claimed.length === 0) throw new UnprocessableEntityException("invalid_reset_token");

    // New password + refreshTokenHash NULL = every existing session is out.
    await this.db
      .update(users)
      .set({ passwordHash, refreshTokenHash: null })
      .where(eq(users.id, token.userId));

    await this.db.insert(auditLogs).values({
      actorId: token.userId,
      actorLabel: "user:password_reset",
      action: "password_reset",
      targetType: "user",
      targetId: token.userId,
    });
  }

  private async issueTokens(userId: string, role: Role): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, role, type: "access" } satisfies AccessPayload,
      { secret: this.env.JWT_SECRET, expiresIn: this.env.ACCESS_TOKEN_TTL_SEC },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, type: "refresh" } satisfies RefreshPayload,
      { secret: this.env.JWT_REFRESH_SECRET, expiresIn: this.env.REFRESH_TOKEN_TTL_SEC },
    );
    const refreshTokenHash = await argon2.hash(refreshToken, { type: argon2.argon2id });
    await this.db.update(users).set({ refreshTokenHash }).where(eq(users.id, userId));
    return { accessToken, refreshToken };
  }

  private toMe(user: typeof users.$inferSelect): MeResponse {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      locale: user.locale,
      role: user.role,
      status: user.status,
      kycTier: user.kycTier,
    };
  }
}
