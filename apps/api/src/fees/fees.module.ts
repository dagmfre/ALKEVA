import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { FeesController } from "./fees.controller.js";
import { FeesService } from "./fees.service.js";

@Module({
  imports: [AuthModule],
  controllers: [FeesController],
  providers: [FeesService],
  exports: [FeesService],
})
export class FeesModule {}
