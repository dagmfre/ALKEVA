import { BadRequestException, Controller, Get, Query, Sse } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { METAL_ASSETS, PRICE_RANGES, type MetalAsset, type PriceRange } from "@alkeva/shared";
import { PriceFeedService } from "./price-feed.service.js";
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
  constructor(
    private readonly prices: PricesService,
    private readonly feed: PriceFeedService,
  ) {}

  @Get("latest")
  latest(@Query("asset") asset?: string) {
    return this.prices.latest(parseAsset(asset));
  }

  /** Poll fallback: both metals + canonical 24h change in one request. */
  @Get("snapshot")
  snapshot() {
    return this.prices.snapshot();
  }

  /** Live push: a snapshot the moment the worker lands a tick. Long-lived GET — throttling would 429 reconnects. */
  @SkipThrottle()
  @Sse("stream")
  stream() {
    return this.feed.stream();
  }

  @Get("history")
  history(@Query("asset") asset?: string, @Query("range") range?: string) {
    const r = (range ?? "24h") as PriceRange;
    if (!PRICE_RANGES.includes(r)) throw new BadRequestException("invalid_range");
    return this.prices.history(parseAsset(asset), r);
  }
}
