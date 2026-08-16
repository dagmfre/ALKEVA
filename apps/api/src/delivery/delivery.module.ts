import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { LedgerModule } from "../ledger/ledger.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { PortfolioModule } from "../portfolio/portfolio.module.js";
import { AdminDeliveryController, DeliveryController } from "./delivery.controller.js";
import { DeliveryService } from "./delivery.service.js";

/**
 * Delivery requests (spec F18). Import graph on purpose: ledger (read-only
 * balance projections + freeze check), portfolio (tier eligibility),
 * notifications (emails). No access to anything that can post a transaction —
 * a delivery request is a workflow record, never a ledger event.
 */
@Module({
  imports: [AuthModule, LedgerModule, PortfolioModule, NotificationsModule],
  controllers: [DeliveryController, AdminDeliveryController],
  providers: [DeliveryService],
})
export class DeliveryModule {}
