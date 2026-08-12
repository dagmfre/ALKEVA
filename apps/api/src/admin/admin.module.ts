import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ChapaModule } from "../chapa/chapa.module.js";
import { KycModule } from "../kyc/kyc.module.js";
import { LedgerModule } from "../ledger/ledger.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { PayoutsModule } from "../payouts/payouts.module.js";
import { TreasuryModule } from "../treasury/treasury.module.js";
import { AdminController } from "./admin.controller.js";
import { AdminService } from "./admin.service.js";

@Module({
  imports: [
    AuthModule,
    ChapaModule,
    KycModule,
    LedgerModule,
    NotificationsModule,
    OrdersModule,
    PayoutsModule,
    TreasuryModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
