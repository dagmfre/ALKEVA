import { Controller, Get, UseGuards } from "@nestjs/common";
import type { BalancesResponse } from "@alkeva/shared";
import { Auth, AuthGuard } from "../auth/auth.guard.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { LedgerService } from "./ledger.service.js";

@Controller("ledger")
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get("balances")
  @UseGuards(AuthGuard)
  balances(@Auth() auth: AccessPayload): Promise<BalancesResponse> {
    return this.ledger.balancesForUser(auth.sub);
  }
}
