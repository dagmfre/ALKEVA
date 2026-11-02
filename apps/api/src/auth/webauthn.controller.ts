import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { z } from "zod";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { Env } from "@alkeva/shared";
import { ENV } from "../core/core.module.js";
import { ZodPipe } from "../core/zod.pipe.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { Auth, AuthGuard } from "./auth.guard.js";
import { AuthService, type AccessPayload } from "./auth.service.js";
import { clientContext, setSessionCookies } from "./cookies.js";
import { WebauthnService } from "./webauthn.service.js";

/** Adding a passkey needs a recent real sign-in, not a long-lived refreshed session. */
const STEP_UP_SEC = 10 * 60;

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
    private readonly notifications: NotificationsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * A stolen 15-minute session must not become permanent access by enrolling
   * the thief's passkey: enrolment requires a sign-in within the last 10
   * minutes, and the owner is emailed whenever a passkey is added.
   */
  private assertRecentSignIn(auth: AccessPayload): void {
    const age = Date.now() / 1000 - (auth.auth_time ?? 0);
    if (age > STEP_UP_SEC) throw new ForbiddenException("reauth_required");
  }

  @Post("register/options")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  registerOptions(@Auth() auth: AccessPayload) {
    this.assertRecentSignIn(auth);
    return this.webauthn.registrationOptions(auth.sub);
  }

  @Post("register/verify")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async registerVerify(
    @Auth() auth: AccessPayload,
    @Body(new ZodPipe(registerVerifyDto)) dto: { response: unknown; label?: string },
  ): Promise<{ ok: true }> {
    this.assertRecentSignIn(auth);
    await this.webauthn.registrationVerify(
      auth.sub,
      dto.response as RegistrationResponseJSON,
      dto.label,
    );
    void this.notifications.emit(auth.sub, "passkey_added", { label: dto.label ?? "" });
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
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = await this.webauthn.authenticationVerify(
      dto.sessionId,
      dto.response as AuthenticationResponseJSON,
    );
    const { user, tokens } = await this.auth.issueSessionFor(userId, ["webauthn"], clientContext(req));
    setSessionCookies(res, this.env, tokens);
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

}
