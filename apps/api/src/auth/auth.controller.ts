import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { z } from "zod";
import {
  DEFAULT_LOCALE,
  LOCALES,
  faydaCompleteDto,
  loginDto,
  registerDto,
  type Env,
  type FaydaCallbackResponse,
  type FaydaCompleteDto,
  type Locale,
  type LoginDto,
  type ProvidersResponse,
  type RegisterDto,
  type SessionItem,
} from "@alkeva/shared";
import { ENV } from "../core/core.module.js";
import { ZodPipe } from "../core/zod.pipe.js";
import { Auth, AuthGuard, REFRESH_COOKIE } from "./auth.guard.js";
import { AuthService, type AccessPayload } from "./auth.service.js";
import {
  clearFlowCookie,
  clearSessionCookies,
  clientContext,
  setFlowCookie,
  setSessionCookies,
} from "./cookies.js";
import { FaydaService } from "./fayda.service.js";
import { GoogleAuthService } from "./google.service.js";
import { SessionsService } from "./sessions.service.js";
import { WebauthnService } from "./webauthn.service.js";

const recoveryDto = z.object({ email: z.string().email() });
const localeDto = z.object({ locale: z.enum(LOCALES) });
const resetDto = z.object({ token: z.string().min(16), password: z.string().min(10).max(128) });
const googleStartDto = z.object({
  intent: z.enum(["login", "register"]).default("login"),
  locale: z.enum(LOCALES).default(DEFAULT_LOCALE),
});
const oauthCallbackDto = z.object({
  code: z.string().min(1).max(2048),
  state: z.string().min(1).max(2048),
});
const codeDto = z.object({ code: z.string().regex(/^[0-9]{6}$/) });

/** What the UI needs to offer Telegram; nothing secret. */
export function telegramProviderInfo(env: Env): ProvidersResponse["telegram"] {
  const enabled =
    env.AUTH_METHODS.includes("telegram") &&
    !!env.TELEGRAM_BOT_TOKEN &&
    !!env.TELEGRAM_BOT_USERNAME &&
    !!env.TELEGRAM_MINIAPP_SHORT_NAME &&
    !!env.TELEGRAM_WEBAPP_ORIGIN;
  return {
    enabled,
    botUsername: enabled ? env.TELEGRAM_BOT_USERNAME : null,
    appShortName: enabled ? env.TELEGRAM_MINIAPP_SHORT_NAME : null,
    origin: enabled ? env.TELEGRAM_WEBAPP_ORIGIN : null,
  };
}

export const FAYDA_BIND_COOKIE_NAME = "alkeva_fayda_tx";

const GOOGLE_BIND_COOKIE = "alkeva_google_tx";
const FAYDA_BIND_COOKIE = FAYDA_BIND_COOKIE_NAME;
export const FLOW_TTL_SEC = 900;

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly google: GoogleAuthService,
    private readonly fayda: FaydaService,
    private readonly webauthn: WebauthnService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Which sign-in and verification methods are live — drives the UI. */
  @Get("providers")
  providers(): ProvidersResponse {
    return {
      fayda: this.fayda.signInEnabled,
      password: this.auth.passwordEnabled,
      google: this.google.configured,
      passkey: this.webauthn.configured,
      webauthn: this.webauthn.configured,
      kyc: {
        fayda: this.fayda.verificationEnabled,
        document: this.env.KYC_METHODS.includes("document"),
      },
      telegram: telegramProviderInfo(this.env),
    };
  }

  // ── password ────────────────────────────────────────────────────

  @Post("register")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(
    @Body(new ZodPipe(registerDto)) dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, tokens } = await this.auth.register(dto, clientContext(req));
    setSessionCookies(res, this.env, tokens);
    return user;
  }

  @Post("login")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body(new ZodPipe(loginDto)) dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, tokens } = await this.auth.login(dto, clientContext(req));
    setSessionCookies(res, this.env, tokens);
    return user;
  }

  // ── session ─────────────────────────────────────────────────────

  @Post("refresh")
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) throw new UnauthorizedException("missing_refresh");
    const { user, tokens } = await this.auth.refresh(token, clientContext(req));
    // null = another tab rotated this token a moment ago; the browser already
    // holds the new cookies, so overwriting them would undo that rotation.
    if (tokens) setSessionCookies(res, this.env, tokens);
    return user;
  }

  @Post("logout")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async logout(@Auth() auth: AccessPayload, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(auth);
    clearSessionCookies(res, this.env);
    return { ok: true };
  }

  @Get("sessions")
  @UseGuards(AuthGuard)
  async listSessions(@Auth() auth: AccessPayload): Promise<{ sessions: SessionItem[] }> {
    return { sessions: await this.sessions.listActive(auth.sub, auth.sid) };
  }

  /** Sign out one device. */
  @Delete("sessions/:id")
  @UseGuards(AuthGuard)
  async revokeSession(
    @Auth() auth: AccessPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    const mine = await this.sessions.listActive(auth.sub, auth.sid);
    if (mine.some((s) => s.id === id)) await this.sessions.revoke(id, "user_revoked");
    return { ok: true };
  }

  /** Sign out everywhere except this device. */
  @Post("sessions/revoke-others")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async revokeOthers(@Auth() auth: AccessPayload): Promise<{ revoked: number }> {
    const revoked = await this.sessions.revokeAllForUser(auth.sub, "user_revoked_all", auth.sid);
    return { revoked };
  }

  @Get("me")
  @UseGuards(AuthGuard)
  async me(@Auth() auth: AccessPayload) {
    return this.auth.me(auth.sub);
  }

  @Patch("me/locale")
  @UseGuards(AuthGuard)
  async setLocale(
    @Auth() auth: AccessPayload,
    @Body(new ZodPipe(localeDto)) dto: { locale: Locale },
  ) {
    return this.auth.setLocale(auth.sub, dto.locale);
  }

  // ── email verification ──────────────────────────────────────────

  @Post("email/code")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  sendEmailCode(@Auth() auth: AccessPayload) {
    return this.auth.sendEmailCode(auth.sub);
  }

  @Post("email/verify")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyEmail(@Auth() auth: AccessPayload, @Body(new ZodPipe(codeDto)) dto: { code: string }) {
    return this.auth.verifyEmail(auth.sub, dto.code);
  }

  // ── recovery ────────────────────────────────────────────────────

  @Post("recover")
  @HttpCode(202)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async recover(@Body(new ZodPipe(recoveryDto)) dto: { email: string }) {
    await this.auth.requestRecovery(dto.email);
    // Always 202 — whether or not the email exists (no account enumeration).
    return { ok: true };
  }

  @Post("reset")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async reset(@Body(new ZodPipe(resetDto)) dto: { token: string; password: string }) {
    await this.auth.resetPassword(dto.token, dto.password);
    return { ok: true };
  }

  // ── Google ──────────────────────────────────────────────────────

  /** 302 to Google's consent screen. A navigation, not an XHR. */
  @Get("google/start")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async googleStart(@Req() req: Request, @Res() res: Response): Promise<void> {
    const attempt = googleStartDto.safeParse({ intent: req.query.intent, locale: req.query.locale });
    const parsed = attempt.success
      ? attempt.data
      : { intent: "login" as const, locale: DEFAULT_LOCALE };
    const { url, binding } = await this.google.startUrl(parsed.intent, parsed.locale);
    setFlowCookie(res, this.env, GOOGLE_BIND_COOKIE, binding, FLOW_TTL_SEC);
    res.redirect(url);
  }

  /** The web callback page POSTs ?code&state here through the /api proxy. */
  @Post("google/callback")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async googleCallback(
    @Body(new ZodPipe(oauthCallbackDto)) dto: { code: string; state: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const binding = req.cookies?.[GOOGLE_BIND_COOKIE] as string | undefined;
    clearFlowCookie(res, this.env, GOOGLE_BIND_COOKIE);
    const userId = await this.google.handleCallback(dto.code, dto.state, binding);
    const { user, tokens } = await this.auth.issueSessionFor(userId, ["google"], clientContext(req));
    setSessionCookies(res, this.env, tokens);
    return user;
  }

  // ── Fayda (VeriFayda 2.0 / eSignet) ─────────────────────────────

  /** Sign in / create an account with Fayda. Returns the authorize URL. */
  @Post("fayda/start")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async faydaStart(@Res({ passthrough: true }) res: Response): Promise<{ url: string }> {
    const { url, binding } = await this.fayda.start("signin", null);
    setFlowCookie(res, this.env, FAYDA_BIND_COOKIE, binding, FLOW_TTL_SEC);
    return { url };
  }

  /** Verify an existing, signed-in account with Fayda (the identity check). */
  @Post("fayda/link")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async faydaLink(
    @Auth() auth: AccessPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ url: string }> {
    const { url, binding } = await this.fayda.start("link", auth.sub);
    setFlowCookie(res, this.env, FAYDA_BIND_COOKIE, binding, FLOW_TTL_SEC);
    return { url };
  }

  @Post("fayda/callback")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async faydaCallback(
    @Body(new ZodPipe(oauthCallbackDto)) dto: { code: string; state: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<FaydaCallbackResponse> {
    const binding = req.cookies?.[FAYDA_BIND_COOKIE] as string | undefined;
    const outcome = await this.fayda.callback(dto.code, dto.state, binding);
    if (outcome.kind === "needs_profile") {
      // Keep the binding cookie: /complete checks it again.
      return { status: "needs_profile", token: outcome.token, profile: outcome.profile };
    }
    clearFlowCookie(res, this.env, FAYDA_BIND_COOKIE);
    if (outcome.kind === "handoff_parked") {
      // This browser holds no session and gets none: it only says "go back
      // to Telegram", where the owner confirms what Fayda verified.
      const info = telegramProviderInfo(this.env);
      const returnUrl =
        info.botUsername && info.appShortName
          ? `https://t.me/${info.botUsername}/${info.appShortName}?startapp=kyc`
          : null;
      return { status: "handoff_parked", returnUrl };
    }
    if (outcome.kind === "linked") {
      return { status: "linked", user: await this.auth.me(outcome.userId) };
    }
    const { user, tokens } = await this.auth.issueSessionFor(outcome.userId, ["fayda"], clientContext(req));
    setSessionCookies(res, this.env, tokens);
    return { status: "signed_in", user };
  }

  /** New Fayda user: confirm an email and accept the terms → account + session. */
  @Post("fayda/complete")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async faydaComplete(
    @Body(new ZodPipe(faydaCompleteDto)) dto: FaydaCompleteDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<FaydaCallbackResponse> {
    const binding = req.cookies?.[FAYDA_BIND_COOKIE] as string | undefined;
    const userId = await this.fayda.complete(dto.token, binding, dto.email, dto.locale);
    clearFlowCookie(res, this.env, FAYDA_BIND_COOKIE);
    const { user, tokens } = await this.auth.issueSessionFor(userId, ["fayda"], clientContext(req));
    setSessionCookies(res, this.env, tokens);
    return { status: "signed_in", user };
  }
}
