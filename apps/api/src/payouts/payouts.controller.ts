import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  createPayoutDto,
  type BankDto,
  type CreatePayoutDto,
  type PayoutResponse,
} from "@alkeva/shared";
import { Auth, AuthGuard } from "../auth/auth.guard.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { ZodPipe } from "../core/zod.pipe.js";
import { PayoutsService } from "./payouts.service.js";

@Controller("payouts")
export class PayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get("banks")
  @UseGuards(AuthGuard)
  banks(): Promise<BankDto[]> {
    return this.payouts.banks();
  }

  @Post()
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  request(
    @Auth() auth: AccessPayload,
    @Body(new ZodPipe(createPayoutDto)) dto: CreatePayoutDto,
  ): Promise<PayoutResponse> {
    return this.payouts.request(auth.sub, dto);
  }

  @Get()
  @UseGuards(AuthGuard)
  list(@Auth() auth: AccessPayload): Promise<{ payouts: PayoutResponse[] }> {
    return this.payouts.listOwn(auth.sub);
  }
}
