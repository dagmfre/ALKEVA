import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { LedgerController } from "./ledger.controller.js";
import { LedgerService } from "./ledger.service.js";

@Module({
  imports: [AuthModule],
  controllers: [LedgerController],
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}
