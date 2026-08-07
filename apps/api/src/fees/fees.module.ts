import { Module } from "@nestjs/common";
import { FeesService } from "./fees.service.js";

@Module({
  providers: [FeesService],
  exports: [FeesService],
})
export class FeesModule {}
