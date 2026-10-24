import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { PortfolioModule } from "../portfolio/portfolio.module.js";
import { PricesModule } from "../prices/prices.module.js";
import { AiController } from "./ai.controller.js";
import { AiService } from "./ai.service.js";

/**
 * Note what is NOT imported: LedgerModule, PaymentsModule, PayoutsModule.
 * The assistant's module graph physically cannot reach a money-writing path.
 */
@Module({
  imports: [AuthModule, OrdersModule, PortfolioModule, PricesModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
