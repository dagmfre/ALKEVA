import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { LedgerModule } from "../ledger/ledger.module.js";
import { TreasuryEntriesService } from "./treasury-entries.service.js";
import { TreasuryController } from "./treasury.controller.js";
import { TreasuryService } from "./treasury.service.js";

@Module({
  imports: [AuthModule, LedgerModule],
  controllers: [TreasuryController],
  providers: [TreasuryService, TreasuryEntriesService],
  exports: [TreasuryService, TreasuryEntriesService],
})
export class TreasuryModule {}
