import { Controller, Get, UseGuards } from "@nestjs/common";
import type { NotificationsResponse } from "@alkeva/shared";
import { Auth, AuthGuard } from "../auth/auth.guard.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { NotificationsService } from "./notifications.service.js";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @UseGuards(AuthGuard)
  list(@Auth() auth: AccessPayload): Promise<NotificationsResponse> {
    return this.notifications.listOwn(auth.sub);
  }
}
