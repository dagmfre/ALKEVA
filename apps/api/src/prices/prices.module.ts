import { Module } from "@nestjs/common";
import { PriceFeedService } from "./price-feed.service.js";
import { PricesController } from "./prices.controller.js";
import { PricesService } from "./prices.service.js";

@Module({
  controllers: [PricesController],
  providers: [PricesService, PriceFeedService],
  exports: [PricesService],
})
export class PricesModule {}
