import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { FeesModule } from "../fees/fees.module.js";
import { QuotesController } from "./quotes.controller.js";
import { QuotesService } from "./quotes.service.js";

@Module({
  imports: [AuthModule, FeesModule],
  controllers: [QuotesController],
  providers: [QuotesService],
  exports: [QuotesService],
})
export class QuotesModule {}
