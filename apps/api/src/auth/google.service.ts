import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { OAuth2Client } from "google-auth-library";
import { eq, sql } from "drizzle-orm";
import { auditLogs, authIdentities, users, type Db } from "@alkeva/db";
import type { Env } from "@alkeva/shared";
import { DB, ENV } from "../core/core.module.js";

/**
 * Google Sign-In — the standard OAuth code flow, integrated INTO the existing
 * auth stack rather than replacing it (decision 2026-08-15): Google only
 * proves the email; the session is still our own JWT/refresh cookie pair
 * issued by AuthService, so every guard, the cookie proxy, and middleware are
 * untouched.
 *
 * `state` is a short-lived signed JWT (nonce + intent + locale) — the CSRF
 * binding between /start and /callback. Endpoints are Google's stable,
 * documented pair: accounts.google.com/o/oauth2/v2/auth (via
 * generateAuthUrl) and the token exchange + JWKS-verified id_token
 * (google-auth-library v11 handles both).
 */
@Injectable()
export class GoogleAuthService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly jwt: JwtService,
  ) {}

  get configured(): boolean {
    return this.env.GOOGLE_CLIENT_ID.length > 0 && this.env.GOOGLE_CLIENT_SECRET.length > 0;
  }

  private guard(): void {
    if (!this.configured) throw new ServiceUnavailableException("auth_google_unconfigured");
  }

  private client(): OAuth2Client {
    return new OAuth2Client({
      clientId: this.env.GOOGLE_CLIENT_ID,
      clientSecret: this.env.GOOGLE_CLIENT_SECRET,
      redirectUri: `${this.env.WEB_ORIGIN}/auth/google/callback`,
    });
  }

  /** 302 target for GET /auth/google/start. */
  async startUrl(intent: "login" | "register", locale: "am" | "en"): Promise<string> {
    this.guard();
    const state = await this.jwt.signAsync(
      { nonce: crypto.randomUUID(), intent, locale, type: "google_state" },
      { secret: this.env.JWT_SECRET, expiresIn: 600 },
    );
    return this.client().generateAuthUrl({
      access_type: "online",
      scope: ["openid", "email", "profile"],
      prompt: "select_account",
      state,
    });
  }

  /**
   * Code exchange + id_token verification → the user this session belongs to.
   * Returns the userId; the controller issues cookies via AuthService.
   */
  async handleCallback(code: string, state: string): Promise<string> {
    this.guard();

    let parsed: { intent?: string; locale?: string; type?: string };
    try {
      parsed = await this.jwt.verifyAsync(state, { secret: this.env.JWT_SECRET });
    } catch {
      throw new UnauthorizedException("google_state_invalid");
    }
    if (parsed.type !== "google_state") throw new UnauthorizedException("google_state_invalid");
    const locale = parsed.locale === "en" ? "en" : "am";

    const client = this.client();
    let idToken: string | undefined;
    try {
      const { tokens } = await client.getToken(code);
      idToken = tokens.id_token ?? undefined;
    } catch {
      throw new UnauthorizedException("google_code_invalid");
    }
    if (!idToken) throw new UnauthorizedException("google_code_invalid");

    const ticket = await client.verifyIdToken({
      idToken,
      audience: this.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    // email_verified required: linking by an unverified address would let
    // anyone claim an existing account with a lookalike Google profile.
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      throw new UnauthorizedException("google_email_unverified");
    }

    const sub = payload.sub;
    const email = payload.email.toLowerCase();

    // 1. Known identity → straight in.
    const identity = await this.db
      .select({ userId: authIdentities.userId })
      .from(authIdentities)
      .where(sql`${authIdentities.provider} = 'google' and ${authIdentities.providerUserId} = ${sub}`)
      .limit(1);
    if (identity[0]) return identity[0].userId;

    // 2. Existing account with this (verified) email → link.
    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(sql`lower(${users.email})`, email))
      .limit(1);
    if (existing[0]) {
      await this.db.insert(authIdentities).values({
        userId: existing[0].id,
        provider: "google",
        providerUserId: sub,
        email,
      });
      await this.db.insert(auditLogs).values({
        actorId: existing[0].id,
        actorLabel: "user:google",
        action: "google_linked",
        targetType: "user",
        targetId: existing[0].id,
      });
      return existing[0].id;
    }

    // 3. New account. passwordHash NULL — the reset flow doubles as "add a
    // password". Consent: the web register button sits behind the terms
    // checkbox, so a register-intent arrival has consented; termsAcceptedAt
    // records it.
    const inserted = await this.db
      .insert(users)
      .values({
        email,
        passwordHash: null,
        fullName: payload.name?.trim() || email.split("@")[0]!,
        locale,
        termsAcceptedAt: new Date(),
      })
      .returning({ id: users.id });
    const userId = inserted[0]!.id;

    await this.db.insert(authIdentities).values({
      userId,
      provider: "google",
      providerUserId: sub,
      email,
    });
    await this.db.insert(auditLogs).values({
      actorId: userId,
      actorLabel: "user:google",
      action: "google_registered",
      targetType: "user",
      targetId: userId,
    });
    return userId;
  }
}
