import { Controller, Get, UseGuards } from "@nestjs/common";
import type { FeeRatesResponse } from "@alkeva/shared";
import { AuthGuard } from "../auth/auth.guard.js";
import { FeesService } from "./fees.service.js";

/**
 * The rates in force, so a client can show what a trade would cost before
 * asking for a quote.
 *
 * This exists because the alternative is worse: a what-if calculator that
 * hardcodes a commission would print a number the quote engine disagrees with
 * the moment a rate changes. The quote remains the only binding figure — this
 * is the rate card, not a price.
 */
@Controller("fees")
export class FeesController {
  constructor(private readonly fees: FeesService) {}

  @Get()
  @UseGuards(AuthGuard)
  async rates(): Promise<FeeRatesResponse> {
    const cfg = await this.fees.getConfig();
    return {
      commissionPctMilli: cfg.commissionPctMilli,
      serviceFeeCents: cfg.serviceFeeCents.toString(),
      taxPctMilli: cfg.taxPctMilli,
      reforestPctMilli: cfg.reforestPctMilli,
    };
  }
}
