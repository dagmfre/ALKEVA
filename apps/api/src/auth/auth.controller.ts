import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
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
  loginDto,
  registerDto,
  type Env,
  type Locale,
  type LoginDto,
  type RegisterDto,
} from "@alkeva/shared";
import { ENV } from "../core/core.module.js";
import { ZodPipe } from "../core/zod.pipe.js";
import {
  ACCESS_COOKIE,
  Auth,
  AuthGuard,
  REFRESH_COOKIE,
} from "./auth.guard.js";
import { AuthService, type AccessPayload, type TokenPair } from "./auth.service.js";
import { GoogleAuthService } from "./google.service.js";

const recoveryDto = z.object({ email: z.string().email() });
const localeDto = z.object({ locale: z.enum(LOCALES) });
const resetDto = z.object({ token: z.string().min(16), password: z.string().min(8) });
const googleStartDto = z.object({
  intent: z.enum(["login", "register"]).default("login"),
  locale: z.enum(LOCALES).default(DEFAULT_LOCALE),
});
const googleCallbackDto = z.object({ code: z.string().min(1), state: z.string().min(1) });

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly google: GoogleAuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Which sign-in providers are configured — drives button visibility. */
  @Get("providers")
  providers() {
    return {
      google: this.google.configured,
      webauthn: this.env.WEBAUTHN_RP_ID.length > 0 && this.env.WEBAUTHN_ORIGIN.length > 0,
    };
  }

  /** 302 to Google's consent screen. A navigation, not an XHR. */
  @Get("google/start")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async googleStart(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const attempt = googleStartDto.safeParse({
      intent: req.query.intent,
      locale: req.query.locale,
    });
    const parsed = attempt.success
      ? attempt.data
      : { intent: "login" as const, locale: DEFAULT_LOCALE };
    const url = await this.google.startUrl(parsed.intent, parsed.locale);
    res.redirect(url);
  }

  /**
   * The web callback page POSTs ?code&state here through the /api proxy so
   * the session cookies land first-party — the same reason the proxy exists.
   */
  @Post("google/callback")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async googleCallback(
    @Body(new ZodPipe(googleCallbackDto)) dto: { code: string; state: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = await this.google.handleCallback(dto.code, dto.state);
    const { user, tokens } = await this.auth.issueSessionFor(userId);
    this.setAuthCookies(res, tokens);
    return user;
  }

  @Post("register")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(
    @Body(new ZodPipe(registerDto)) dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, tokens } = await this.auth.register(dto);
    this.setAuthCookies(res, tokens);
    return user;
  }

  @Post("login")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body(new ZodPipe(loginDto)) dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, tokens } = await this.auth.login(dto);
    this.setAuthCookies(res, tokens);
    return user;
  }

  @Post("refresh")
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) throw new UnauthorizedException("missing_refresh");
    const { user, tokens } = await this.auth.refresh(token);
    this.setAuthCookies(res, tokens);
    return user;
  }

  @Post("logout")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async logout(@Auth() auth: AccessPayload, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(auth.sub);
    res.clearCookie(ACCESS_COOKIE, this.cookieOpts());
    res.clearCookie(REFRESH_COOKIE, this.cookieOpts());
    return { ok: true };
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

  private setAuthCookies(res: Response, tokens: TokenPair) {
    res.cookie(ACCESS_COOKIE, tokens.accessToken, {
      ...this.cookieOpts(),
      maxAge: this.env.ACCESS_TOKEN_TTL_SEC * 1000,
    });
    // Path stays "/" — the browser reaches the API through the Next.js
    // rewrite proxy (/api/...), so a narrower path would strand the cookie.
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...this.cookieOpts(),
      maxAge: this.env.REFRESH_TOKEN_TTL_SEC * 1000,
    });
  }

  private cookieOpts() {
    const secure = this.env.WEB_ORIGIN.startsWith("https://");
    return { httpOnly: true, sameSite: "lax" as const, secure };
  }
}
