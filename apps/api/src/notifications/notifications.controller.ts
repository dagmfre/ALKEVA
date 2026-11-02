import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  Req,
  Sse,
  UseGuards,
  type MessageEvent,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import type { Observable } from "rxjs";
import { z } from "zod";
import {
  markReadDto,
  notifyPrefsDto,
  pushSubscriptionDto,
  type MarkReadDto,
  type NotificationsResponse,
  type NotifyPrefs,
  type NotifyPrefsDto,
  type PushConfigResponse,
  type PushSubscriptionDto,
} from "@alkeva/shared";
import { Auth, AuthGuard } from "../auth/auth.guard.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { ZodPipe } from "../core/zod.pipe.js";
import { NotificationsStreamService } from "./notifications-stream.service.js";
import { NotificationsService } from "./notifications.service.js";

const unsubscribeDto = z.object({ endpoint: z.string().url().max(1000) });

@Controller("notifications")
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly stream: NotificationsStreamService,
  ) {}

  @Get()
  list(
    @Auth() auth: AccessPayload,
    @Query("before") before?: string,
  ): Promise<NotificationsResponse> {
    return this.notifications.listOwn(auth.sub, before);
  }

  /** Live "you have something new" for this user's open tabs (SSE). */
  @Sse("stream")
  live(@Auth() auth: AccessPayload): Observable<MessageEvent> {
    return this.stream.stream(auth.sub);
  }

  @Post("read")
  @HttpCode(200)
  markRead(
    @Auth() auth: AccessPayload,
    @Body(new ZodPipe(markReadDto)) dto: MarkReadDto,
  ): Promise<{ unreadCount: number }> {
    return this.notifications.markRead(auth.sub, dto);
  }

  @Get("prefs")
  prefs(@Auth() auth: AccessPayload): Promise<NotifyPrefs> {
    return this.notifications.getPrefs(auth.sub);
  }

  @Patch("prefs")
  setPrefs(
    @Auth() auth: AccessPayload,
    @Body(new ZodPipe(notifyPrefsDto)) dto: NotifyPrefsDto,
  ): Promise<NotifyPrefs> {
    return this.notifications.setPrefs(auth.sub, dto);
  }

  @Get("push/config")
  pushConfig(@Auth() auth: AccessPayload): Promise<PushConfigResponse> {
    return this.notifications.pushConfig(auth.sub);
  }

  @Post("push/subscriptions")
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async subscribe(
    @Auth() auth: AccessPayload,
    @Body(new ZodPipe(pushSubscriptionDto)) dto: PushSubscriptionDto,
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    const ua = req.headers["user-agent"];
    await this.notifications.subscribe(auth.sub, dto, typeof ua === "string" ? ua : null);
    return { ok: true };
  }

  @Delete("push/subscriptions")
  async unsubscribe(
    @Auth() auth: AccessPayload,
    @Body(new ZodPipe(unsubscribeDto)) dto: { endpoint: string },
  ): Promise<{ ok: true }> {
    await this.notifications.unsubscribe(auth.sub, dto.endpoint);
    return { ok: true };
  }
}
