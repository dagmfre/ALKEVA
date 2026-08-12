import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { LedgerModule } from "../ledger/ledger.module.js";
import { PortfolioController } from "./portfolio.controller.js";
import { PortfolioService } from "./portfolio.service.js";

@Module({
  imports: [AuthModule, LedgerModule],
  controllers: [PortfolioController],
  providers: [PortfolioService],
  exports: [PortfolioService],
})
export class PortfolioModule {}
