import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { TreasuryController } from "./treasury.controller.js";
import { TreasuryService } from "./treasury.service.js";

@Module({
  imports: [AuthModule],
  controllers: [TreasuryController],
  providers: [TreasuryService],
  exports: [TreasuryService],
})
export class TreasuryModule {}
