import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { NotificationsCoreModule } from "../notifications/notifications-core.module.js";
import { PricesModule } from "../prices/prices.module.js";
import { TelegramAuthService } from "./telegram-auth.service.js";
import { TelegramBotService } from "./telegram-bot.service.js";
import {
  TelegramAuthController,
  TelegramHandoffController,
  TelegramWebhookController,
} from "./telegram.controller.js";
import { TelegramHandoffService } from "./telegram-handoff.service.js";

/**
 * Telegram Mini App + bot (Phase 11). Depends on auth (sessions, password
 * proof, Fayda) and on the read-only price service; it imports nothing that
 * can move money — the Mini App moves money through the ordinary endpoints,
 * under the ordinary gates, with a bearer session.
 */
@Module({
  imports: [AuthModule, NotificationsCoreModule, PricesModule],
  controllers: [TelegramAuthController, TelegramHandoffController, TelegramWebhookController],
  providers: [TelegramAuthService, TelegramHandoffService, TelegramBotService],
  exports: [TelegramAuthService],
})
export class TelegramModule {}
