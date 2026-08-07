import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { LedgerModule } from "../ledger/ledger.module.js";
import { OrdersController } from "./orders.controller.js";
import { OrdersService } from "./orders.service.js";

@Module({
  imports: [AuthModule, LedgerModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
