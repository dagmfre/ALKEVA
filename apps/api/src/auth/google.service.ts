import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { Redis } from "ioredis";
import { JwtService } from "@nestjs/jwt";
import { OAuth2Client } from "google-auth-library";
import { eq, sql } from "drizzle-orm";
import { auditLogs, authIdentities, users, type Db } from "@alkeva/db";
import { toLocale, type Env, type Locale } from "@alkeva/shared";
import { DB, ENV, REDIS } from "../core/core.module.js";

/**
 * Google Sign-In — the standard OAuth code flow, integrated INTO the existing
 * auth stack rather than replacing it (decision 2026-08-15): Google only
 * proves the email; the session is still our own JWT/refresh cookie pair
 * issued by AuthService, so every guard, the cookie proxy, and middleware are
 * untouched.
 *
 * `state` is a short-lived signed JWT (intent + locale + the sha256 of a
 * random value held in an httpOnly cookie). The callback only proceeds in the
 * browser that started the flow — otherwise an attacker could hand a victim a
 * callback URL carrying the attacker's own code and sign the victim into the
 * attacker's account (login CSRF), where the victim's deposits would land. Endpoints are Google's stable,
 * documented pair: accounts.google.com/o/oauth2/v2/auth (via
 * generateAuthUrl) and the token exchange + JWKS-verified id_token
 * (google-auth-library v11 handles both).
 */
/**
 * A Google sign-in started from the Telegram Mini App (TelegramAuthService
 * owns the rest of it). Google refuses embedded webviews, so the round trip
 * runs in the phone's browser and the browser gets no session.
 *
 * The DECISIVE click is on the Google side: after Google, the browser that
 * proved the account is shown which Telegram account asked to connect, and
 * only its "Connect" turns the parked result into a link. A confirm on the
 * Telegram side would let anyone who sends a victim the handoff link take
 * over the victim's account with one click in Google's account chooser.
 */
export interface TelegramGoogleFlow {
  /** sha256 of the Mini App's pending token: only that Mini App may read or finish it. */
  pendingSha: string;
  /** The Telegram account that asked, as its owner sees it (@username or first name). */
  telegram: string;
  state: "waiting" | "started" | "verified" | "done" | "failed";
  userId?: string;
  /** sha256 of the one-time approval token handed to the browser that completed Google. */
  approveSha?: string;
  code?: string;
}

export interface TelegramGoogleApproval {
  flowId: string;
  token: string;
  telegram: string;
  account: string;
}

export const telegramGoogleFlowKey = (flowId: string) => `tg:google:flow:${flowId}`;

@Injectable()
export class GoogleAuthService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly jwt: JwtService,
  ) {}

  get configured(): boolean {
    return (
      this.env.AUTH_METHODS.includes("google") &&
      this.env.GOOGLE_CLIENT_ID.length > 0 &&
      this.env.GOOGLE_CLIENT_SECRET.length > 0
    );
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

  /** 302 target for GET /auth/google/start, plus the browser-binding cookie value. */
  async startUrl(
    intent: "login" | "register",
    locale: Locale,
    telegramFlow?: string,
  ): Promise<{ url: string; binding: string }> {
    this.guard();
    const binding = randomBytes(24).toString("base64url");
    const state = await this.jwt.signAsync(
      {
        bh: sha256(binding),
        intent,
        locale,
        type: "google_state",
        ...(telegramFlow ? { tgf: telegramFlow } : {}),
      },
      { secret: this.env.JWT_SECRET, expiresIn: 600 },
    );
    const url = this.client().generateAuthUrl({
      access_type: "online",
      scope: ["openid", "email", "profile"],
      prompt: "select_account",
      state,
    });
    return { url, binding };
  }

  /**
   * Code exchange + id_token verification → the user this session belongs to.
   * Returns the userId; the controller issues cookies via AuthService.
   */
  async handleCallback(
    code: string,
    state: string,
    binding: string | undefined,
  ): Promise<{ userId: string; telegramFlow: string | null; approval?: TelegramGoogleApproval }> {
    this.guard();

    let parsed: { intent?: string; locale?: string; type?: string; bh?: string; tgf?: string };
    try {
      parsed = await this.jwt.verifyAsync(state, { secret: this.env.JWT_SECRET });
    } catch {
      throw new UnauthorizedException("google_state_invalid");
    }
    if (parsed.type !== "google_state") throw new UnauthorizedException("google_state_invalid");
    if (!binding || !parsed.bh || !safeEqual(sha256(binding), parsed.bh)) {
      throw new UnauthorizedException("google_state_invalid");
    }
    const locale = toLocale(parsed.locale);
    const intent = parsed.intent === "register" ? "register" : "login";

    const telegramFlow = typeof parsed.tgf === "string" ? parsed.tgf : null;
    if (!telegramFlow) {
      return { userId: await this.resolve(code, intent, locale), telegramFlow: null };
    }

    // Started from the Mini App: the result is parked for it, never a session here.
    const key = telegramGoogleFlowKey(telegramFlow);
    const raw = await this.redis.get(key);
    const flow = raw ? (JSON.parse(raw) as TelegramGoogleFlow) : null;
    if (!flow || flow.state !== "started") throw new UnauthorizedException("telegram_google_expired");
    let userId: string;
    try {
      userId = await this.resolve(code, intent, locale);
    } catch (err) {
      const message = err instanceof HttpException ? (err.getResponse() as { message?: unknown }).message : null;
      const failure = typeof message === "string" ? message : "google_failed";
      await this.redis.set(key, JSON.stringify({ ...flow, state: "failed", code: failure }), "KEEPTTL");
      throw err;
    }
    // Verified, not yet approved: this browser must now say yes to THIS Telegram account.
    const token = randomBytes(32).toString("base64url");
    const next: TelegramGoogleFlow = { ...flow, state: "verified", userId, approveSha: sha256(token) };
    await this.redis.set(key, JSON.stringify(next), "KEEPTTL");
    const rows = await this.db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    return {
      userId,
      telegramFlow,
      approval: { flowId: telegramFlow, token, telegram: flow.telegram, account: maskEmail(rows[0]?.email ?? "") },
    };
  }

  /** https://t.me/<bot>/<app> — where the phone's browser sends the person back. */
  telegramReturnUrl(): string | null {
    const { TELEGRAM_BOT_USERNAME: bot, TELEGRAM_MINIAPP_SHORT_NAME: app } = this.env;
    return bot && app ? `https://t.me/${bot}/${app}` : null;
  }

  /** Code exchange + verified id_token → the ALKEVA user it belongs to (created only on register). */
  private async resolve(code: string, intent: "login" | "register", locale: Locale): Promise<string> {
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

    // 2. Existing account with this email → link, but ONLY when that account
    // has itself proven the address. Linking to an unproven address would let
    // whoever pre-registered it share the account with its real owner.
    const existing = await this.db
      .select({ id: users.id, verified: users.emailVerifiedAt })
      .from(users)
      .where(eq(sql`lower(${users.email})`, email))
      .limit(1);
    if (existing[0] && !existing[0].verified) {
      throw new ConflictException("email_taken_link_instead");
    }
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

    // 3. New account — only from the register page, where the button sits
    // behind the terms checkbox. A sign-in attempt for an account that does
    // not exist must not silently create one without consent.
    if (intent !== "register") throw new NotFoundException("google_account_not_found");
    const inserted = await this.db
      .insert(users)
      .values({
        email,
        passwordHash: null,
        fullName: payload.name?.trim() || email.split("@")[0]!,
        locale,
        termsAcceptedAt: new Date(),
        // Google asserted email_verified above.
        emailVerifiedAt: new Date(),
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

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** d***@gmail.com: enough for the owner to recognise. */
function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
