import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ChapaModule } from "../chapa/chapa.module.js";
import { LedgerModule } from "../ledger/ledger.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { PayoutsController } from "./payouts.controller.js";
import { PayoutsService } from "./payouts.service.js";

@Module({
  imports: [AuthModule, ChapaModule, LedgerModule, NotificationsModule],
  controllers: [PayoutsController],
  providers: [PayoutsService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
