import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { z } from "zod";
import { loginDto, registerDto, type Env, type LoginDto, type RegisterDto } from "@alkeva/shared";
import { ENV } from "../core/core.module.js";
import { ZodPipe } from "../core/zod.pipe.js";
import {
  ACCESS_COOKIE,
  Auth,
  AuthGuard,
  REFRESH_COOKIE,
} from "./auth.guard.js";
import { AuthService, type AccessPayload, type TokenPair } from "./auth.service.js";

const recoveryDto = z.object({ email: z.string().email() });

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

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

  @Post("recover")
  @HttpCode(202)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async recover(@Body(new ZodPipe(recoveryDto)) dto: { email: string }) {
    await this.auth.requestRecovery(dto.email);
    // Always 202 — whether or not the email exists (no account enumeration).
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
