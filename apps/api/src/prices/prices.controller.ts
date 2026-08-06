import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { METAL_ASSETS, PRICE_RANGES, type MetalAsset, type PriceRange } from "@alkeva/shared";
import { PricesService } from "./prices.service.js";

function parseAsset(value: string | undefined): MetalAsset {
  const asset = (value ?? "XAU").toUpperCase();
  if (!METAL_ASSETS.includes(asset as MetalAsset)) {
    throw new BadRequestException("invalid_asset");
  }
  return asset as MetalAsset;
}

@Controller("prices")
export class PricesController {
  constructor(private readonly prices: PricesService) {}

  @Get("latest")
  latest(@Query("asset") asset?: string) {
    return this.prices.latest(parseAsset(asset));
  }

  @Get("history")
  history(@Query("asset") asset?: string, @Query("range") range?: string) {
    const r = (range ?? "24h") as PriceRange;
    if (!PRICE_RANGES.includes(r)) throw new BadRequestException("invalid_range");
    return this.prices.history(parseAsset(asset), r);
  }
}
