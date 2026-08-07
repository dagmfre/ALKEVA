import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { LedgerModule } from "../ledger/ledger.module.js";
import { FaucetController } from "./faucet.controller.js";
import { FaucetService } from "./faucet.service.js";

@Module({
  imports: [AuthModule, LedgerModule],
  controllers: [FaucetController],
  providers: [FaucetService],
})
export class FaucetModule {}
