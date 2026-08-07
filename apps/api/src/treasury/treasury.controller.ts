import { Controller, Get, UseGuards } from "@nestjs/common";
import type { TreasurySummaryResponse } from "@alkeva/shared";
import { AuthGuard } from "../auth/auth.guard.js";
import { TreasuryService } from "./treasury.service.js";

@Controller("treasury")
export class TreasuryController {
  constructor(private readonly treasury: TreasuryService) {}

  @Get("summary")
  @UseGuards(AuthGuard)
  summary(): Promise<TreasurySummaryResponse> {
    return this.treasury.summary();
  }
}
