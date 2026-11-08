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
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { z } from "zod";
import {
  telegramGoogleApproveDto,
  telegramGoogleFlowDto,
  telegramGoogleStartDto,
  telegramHandoffConsumeDto,
  telegramHandoffDto,
  telegramLinkClaimDto,
  telegramPasswordLinkDto,
  telegramRefreshDto,
  telegramSessionDto,
  telegramSignupDto,
  type Env,
  type TelegramGoogleApproveDto,
  type TelegramGoogleFlowDto,
  type TelegramGoogleStartDto,
  type TelegramGoogleStartResponse,
  type TelegramGoogleStatus,
  type TelegramHandoffStartResponse,
  type TelegramHandoffStatus,
  type TelegramLinkClaimDto,
  type TelegramLinkStartResponse,
  type TelegramLinkStatusResponse,
  type TelegramPasswordLinkDto,
  type TelegramSessionResponse,
  type TelegramSignupDto,
} from "@alkeva/shared";
import { ENV } from "../core/core.module.js";
import { ZodPipe } from "../core/zod.pipe.js";
import { Auth, AuthGuard } from "../auth/auth.guard.js";
import { FAYDA_BIND_COOKIE_NAME, FLOW_TTL_SEC, GOOGLE_BIND_COOKIE_NAME } from "../auth/auth.controller.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { clientContext, setFlowCookie } from "../auth/cookies.js";
import { TelegramAuthService } from "./telegram-auth.service.js";
import { TelegramBotService } from "./telegram-bot.service.js";
import { TelegramHandoffService } from "./telegram-handoff.service.js";

const claimStatusDto = z.object({ claimToken: z.string().regex(/^[A-Za-z0-9_-]{32,64}$/) });

/**
 * Telegram Mini App sign-in. Every response that opens a session returns the
 * tokens in the BODY and sets no cookie: the Mini App runs cookie-less (it is
 * framed by web.telegram.org, a third-party context), and a bearer header is
 * immune to CSRF by construction.
 */
@Controller("auth/telegram")
export class TelegramAuthController {
  constructor(
    private readonly tg: TelegramAuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** initData → a session (linked) or a pending token (not linked yet). */
  @Post("session")
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  session(
    @Body(new ZodPipe(telegramSessionDto)) dto: { initData: string },
    @Req() req: Request,
  ): Promise<TelegramSessionResponse> {
    return this.tg.session(dto.initData, clientContext(req));
  }

  @Post("signup")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  signup(
    @Body(new ZodPipe(telegramSignupDto)) dto: TelegramSignupDto,
    @Req() req: Request,
  ): Promise<TelegramSessionResponse> {
    return this.tg.signup(dto, clientContext(req));
  }

  /** Link path (a): password typed inside the Mini App. */
  @Post("link/password")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  linkPassword(
    @Body(new ZodPipe(telegramPasswordLinkDto)) dto: TelegramPasswordLinkDto,
    @Req() req: Request,
  ): Promise<TelegramSessionResponse> {
    return this.tg.linkWithPassword(dto, clientContext(req));
  }

  /** Google, step 1 (Mini App): a single-use ticket for the phone's browser. */
  @Post("google/start")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  googleStart(
    @Body(new ZodPipe(telegramGoogleStartDto)) dto: TelegramGoogleStartDto,
  ): Promise<TelegramGoogleStartResponse> {
    return this.tg.googleStart(dto);
  }

  /**
   * Google, step 2: the phone's browser (allkeva.com/handoff#g=...). Public by
   * design: the ticket is the authorisation, and it can only start a Google
   * sign-in whose result the Mini App must confirm. Sets Google's
   * browser-binding cookie for THIS browser; no session.
   */
  @Post("google/consume")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async googleConsume(
    @Body(new ZodPipe(telegramHandoffConsumeDto)) dto: { ticket: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ url: string }> {
    const { url, binding } = await this.tg.googleConsume(dto.ticket, clientContext(req));
    setFlowCookie(res, this.env, GOOGLE_BIND_COOKIE_NAME, binding, FLOW_TTL_SEC);
    return { url };
  }

  /**
   * Google, step 3 (the phone's browser, after Google): the account owner
   * approves or refuses the Telegram account that asked. Public: the one-time
   * token from the Google callback is the authorisation.
   */
  @Post("google/approve")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  googleApprove(
    @Body(new ZodPipe(telegramGoogleApproveDto)) dto: TelegramGoogleApproveDto,
    @Req() req: Request,
  ): Promise<{ status: "approved" | "declined" }> {
    return this.tg.googleApprove(dto, clientContext(req));
  }

  /** Google, step 4 (Mini App): poll until the browser has approved. */
  @Post("google/status")
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  googleStatus(
    @Body(new ZodPipe(telegramGoogleFlowDto)) dto: TelegramGoogleFlowDto,
  ): Promise<TelegramGoogleStatus> {
    return this.tg.googleStatus(dto);
  }

  /** Google, step 5 (Mini App): sign in once the browser approved. */
  @Post("google/confirm")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  googleConfirm(
    @Body(new ZodPipe(telegramGoogleFlowDto)) dto: TelegramGoogleFlowDto,
    @Req() req: Request,
  ): Promise<TelegramSessionResponse> {
    return this.tg.googleConfirm(dto, clientContext(req));
  }

  @Post("google/cancel")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  googleCancel(@Body(new ZodPipe(telegramGoogleFlowDto)) dto: TelegramGoogleFlowDto): Promise<{ ok: true }> {
    return this.tg.googleCancel(dto);
  }

  /** Link path (b), step 1 — website: a one-time t.me link. */
  @Post("link/start")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  linkStart(@Auth() auth: AccessPayload): Promise<TelegramLinkStartResponse> {
    return this.tg.startWebLink(auth);
  }

  /** Link path (b), step 2 — Mini App: park this Telegram account for the owner. */
  @Post("link/claim")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  linkClaim(
    @Body(new ZodPipe(telegramLinkClaimDto)) dto: TelegramLinkClaimDto,
    @Req() req: Request,
  ): Promise<{ claimToken: string; account: string }> {
    return this.tg.claimWebLink(dto.initData, dto.linkToken, clientContext(req));
  }

  /** Link path (b), Mini App polling until the owner decides on the website. */
  @Post("link/claim-status")
  @HttpCode(200)
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  claimStatus(
    @Body(new ZodPipe(claimStatusDto)) dto: { claimToken: string },
    @Req() req: Request,
  ) {
    return this.tg.claimStatus(dto.claimToken, clientContext(req));
  }

  /** Website or Mini App: what is linked, and anything waiting for confirmation. */
  @Get("link")
  @UseGuards(AuthGuard)
  linkStatus(@Auth() auth: AccessPayload): Promise<TelegramLinkStatusResponse> {
    return this.tg.status(auth.sub);
  }

  /** Link path (b), step 3 — website, fresh sign-in: the decisive step. */
  @Post("link/confirm")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  linkConfirm(@Auth() auth: AccessPayload, @Req() req: Request): Promise<TelegramLinkStatusResponse> {
    return this.tg.decideWebLink(auth, "confirm", clientContext(req));
  }

  @Post("link/reject")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  linkReject(@Auth() auth: AccessPayload, @Req() req: Request): Promise<TelegramLinkStatusResponse> {
    return this.tg.decideWebLink(auth, "reject", clientContext(req));
  }

  /** Mini App: the bot may now message this person (after requestWriteAccess). */
  @Post("messages")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  enableMessages(@Auth() auth: AccessPayload): Promise<TelegramLinkStatusResponse> {
    return this.tg.enableMessages(auth);
  }

  /** Disconnect Telegram (from the website or from inside the Mini App). */
  @Delete("link")
  @UseGuards(AuthGuard)
  unlink(@Auth() auth: AccessPayload): Promise<{ unlinked: boolean }> {
    const fromTelegram = (auth.amr ?? []).includes("telegram");
    return this.tg.unlink(auth.sub, fromTelegram ? "miniapp" : "web");
  }

  /** Rotating refresh for Mini App sessions only; tokens in the body. */
  @Post("refresh")
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  refresh(
    @Body(new ZodPipe(telegramRefreshDto)) dto: { refreshToken: string },
    @Req() req: Request,
  ) {
    return this.tg.refresh(dto.refreshToken, clientContext(req));
  }
}

/** Mini App → external browser handoffs (Fayda identity check). */
@Controller("telegram/handoff")
export class TelegramHandoffController {
  constructor(
    private readonly handoffs: TelegramHandoffService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post()
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(
    @Auth() auth: AccessPayload,
    @Body(new ZodPipe(telegramHandoffDto)) dto: { purpose: "fayda_link" },
  ): Promise<TelegramHandoffStartResponse> {
    return this.handoffs.create(auth, dto.purpose);
  }

  /**
   * The browser leg — public by design: the ticket IS the authorisation, and
   * it can only start a Fayda flow whose result nobody but the owner can
   * commit. The Fayda binding cookie is set for THIS browser; no session is.
   */
  @Post("consume")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async consume(
    @Body(new ZodPipe(telegramHandoffConsumeDto)) dto: { ticket: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ url: string }> {
    const { url, binding } = await this.handoffs.consume(dto.ticket, clientContext(req));
    setFlowCookie(res, this.env, FAYDA_BIND_COOKIE_NAME, binding, FLOW_TTL_SEC);
    return { url };
  }

  @Get(":id")
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  status(
    @Auth() auth: AccessPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<TelegramHandoffStatus> {
    return this.handoffs.status(auth, id);
  }

  @Post(":id/confirm")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  confirm(
    @Auth() auth: AccessPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<TelegramHandoffStatus> {
    return this.handoffs.confirm(auth, id);
  }

  @Post(":id/discard")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  discard(
    @Auth() auth: AccessPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<TelegramHandoffStatus> {
    return this.handoffs.discard(auth, id);
  }
}

/**
 * Telegram's update webhook. Public by necessity; authenticated by the secret
 * token header (and by Telegram's IP ranges at the Caddy edge). Answers 200
 * at once and handles the update after, so a slow reply never makes Telegram
 * redeliver; a redelivery is dropped by the update_id check anyway.
 */
@Controller("webhooks")
export class TelegramWebhookController {
  constructor(private readonly bot: TelegramBotService) {}

  @Post("telegram")
  @HttpCode(200)
  @SkipThrottle()
  async update(@Req() req: Request): Promise<{ ok: true }> {
    if (!this.bot.verifySecret(req.headers["x-telegram-bot-api-secret-token"])) {
      throw new UnauthorizedException("invalid_secret");
    }
    const update = (req.body ?? {}) as Record<string, unknown>;
    if (await this.bot.firstDelivery(update)) {
      setImmediate(() => {
        this.bot.handle(update).catch((err) => console.error("telegram update failed:", err));
      });
    }
    return { ok: true };
  }
}
