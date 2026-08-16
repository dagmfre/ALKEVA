import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { z } from "zod";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { Env } from "@alkeva/shared";
import { ENV } from "../core/core.module.js";
import { ZodPipe } from "../core/zod.pipe.js";
import { ACCESS_COOKIE, Auth, AuthGuard, REFRESH_COOKIE } from "./auth.guard.js";
import { AuthService, type AccessPayload, type TokenPair } from "./auth.service.js";
import { WebauthnService } from "./webauthn.service.js";

// The WebAuthn response JSON is validated cryptographically by
// SimpleWebAuthn — zod only shapes the envelope.
const registerVerifyDto = z.object({
  response: z.unknown(),
  label: z.string().max(60).optional(),
});
const loginVerifyDto = z.object({
  sessionId: z.string().uuid(),
  response: z.unknown(),
});

@Controller("auth/webauthn")
export class WebauthnController {
  constructor(
    private readonly webauthn: WebauthnService,
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post("register/options")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  registerOptions(@Auth() auth: AccessPayload) {
    return this.webauthn.registrationOptions(auth.sub);
  }

  @Post("register/verify")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async registerVerify(
    @Auth() auth: AccessPayload,
    @Body(new ZodPipe(registerVerifyDto)) dto: { response: unknown; label?: string },
  ): Promise<{ ok: true }> {
    await this.webauthn.registrationVerify(
      auth.sub,
      dto.response as RegistrationResponseJSON,
      dto.label,
    );
    return { ok: true };
  }

  @Post("login/options")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  loginOptions() {
    return this.webauthn.authenticationOptions();
  }

  @Post("login/verify")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async loginVerify(
    @Body(new ZodPipe(loginVerifyDto)) dto: { sessionId: string; response: unknown },
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = await this.webauthn.authenticationVerify(
      dto.sessionId,
      dto.response as AuthenticationResponseJSON,
    );
    const { user, tokens } = await this.auth.issueSessionFor(userId);
    this.setAuthCookies(res, tokens);
    return user;
  }

  @Get("credentials")
  @UseGuards(AuthGuard)
  list(@Auth() auth: AccessPayload) {
    return this.webauthn.listOwn(auth.sub);
  }

  @Delete("credentials/:id")
  @UseGuards(AuthGuard)
  async remove(
    @Auth() auth: AccessPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    await this.webauthn.remove(auth.sub, id);
    return { ok: true };
  }

  // Same cookie mechanics as AuthController — the passkey session is the
  // ordinary session, not a special one.
  private setAuthCookies(res: Response, tokens: TokenPair) {
    res.cookie(ACCESS_COOKIE, tokens.accessToken, {
      ...this.cookieOpts(),
      maxAge: this.env.ACCESS_TOKEN_TTL_SEC * 1000,
    });
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
