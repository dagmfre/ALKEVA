import { Controller, Get, UseGuards } from "@nestjs/common";
import type { PortfolioResponse } from "@alkeva/shared";
import { Auth, AuthGuard } from "../auth/auth.guard.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { PortfolioService } from "./portfolio.service.js";

@Controller("portfolio")
export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}

  @Get()
  @UseGuards(AuthGuard)
  get(@Auth() auth: AccessPayload): Promise<PortfolioResponse> {
    return this.portfolio.forUser(auth.sub);
  }
}
