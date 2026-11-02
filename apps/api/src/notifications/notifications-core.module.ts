import { Module } from "@nestjs/common";
import { MailService } from "./mail.service.js";
import { NotificationsService } from "./notifications.service.js";

/**
 * The notification + mail services without any controller, so AuthModule can
 * use them (sign-in alerts, codes) without the cycle the HTTP module would
 * create — NotificationsModule imports AuthModule for its guards.
 */
@Module({
  providers: [NotificationsService, MailService],
  exports: [NotificationsService, MailService],
})
export class NotificationsCoreModule {}
