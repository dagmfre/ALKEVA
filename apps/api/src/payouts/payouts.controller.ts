import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  confirmPayoutDto,
  payoutIntentDto,
  type BankDto,
  type ConfirmPayoutDto,
  type PayoutIntentDto,
  type PayoutIntentResponse,
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

  /** Step 1 — checks the request and emails a confirmation code. */
  @Post("intent")
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  intent(
    @Auth() auth: AccessPayload,
    @Body(new ZodPipe(payoutIntentDto)) dto: PayoutIntentDto,
  ): Promise<PayoutIntentResponse> {
    return this.payouts.createIntent(auth.sub, dto);
  }

  /** Step 2 — the emailed code creates the held payout. */
  @Post()
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  confirm(
    @Auth() auth: AccessPayload,
    @Body(new ZodPipe(confirmPayoutDto)) dto: ConfirmPayoutDto,
  ): Promise<PayoutResponse> {
    return this.payouts.confirm(auth.sub, dto);
  }

  @Get()
  @UseGuards(AuthGuard)
  list(@Auth() auth: AccessPayload): Promise<{ payouts: PayoutResponse[] }> {
    return this.payouts.listOwn(auth.sub);
  }
}
