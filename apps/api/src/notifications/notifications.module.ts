import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { NotificationsController } from "./notifications.controller.js";
import { NotificationsCoreModule } from "./notifications-core.module.js";
import { NotificationsStreamService } from "./notifications-stream.service.js";

@Module({
  imports: [AuthModule, NotificationsCoreModule],
  controllers: [NotificationsController],
  providers: [NotificationsStreamService],
  exports: [NotificationsCoreModule],
})
export class NotificationsModule {}
