import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { createQuoteDto, type CreateQuoteDto, type QuoteResponse } from "@alkeva/shared";
import { Auth, AuthGuard } from "../auth/auth.guard.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { ZodPipe } from "../core/zod.pipe.js";
import { QuotesService } from "./quotes.service.js";

@Controller("quotes")
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Post()
  @UseGuards(AuthGuard)
  create(
    @Auth() auth: AccessPayload,
    @Body(new ZodPipe(createQuoteDto)) dto: CreateQuoteDto,
  ): Promise<QuoteResponse> {
    return this.quotes.create(auth.sub, dto);
  }
}
