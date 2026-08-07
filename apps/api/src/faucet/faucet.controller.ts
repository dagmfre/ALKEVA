import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { faucetDto, type BalancesResponse, type FaucetDto } from "@alkeva/shared";
import { Auth, AuthGuard } from "../auth/auth.guard.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { ZodPipe } from "../core/zod.pipe.js";
import { FaucetService } from "./faucet.service.js";

@Controller("faucet")
export class FaucetController {
  constructor(private readonly faucet: FaucetService) {}

  @Post()
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  credit(
    @Auth() auth: AccessPayload,
    @Body(new ZodPipe(faucetDto)) dto: FaucetDto,
  ): Promise<BalancesResponse> {
    return this.faucet.credit(auth.sub, dto);
  }
}
