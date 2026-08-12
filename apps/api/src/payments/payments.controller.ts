import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  createPaymentDto,
  type CreatePaymentDto,
  type DepositChannelsResponse,
  type PaymentResponse,
} from "@alkeva/shared";
import { Auth, AuthGuard } from "../auth/auth.guard.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { ZodPipe } from "../core/zod.pipe.js";
import { PaymentsService } from "./payments.service.js";

@Controller("payments")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Static route before ":id" so "channels" never parses as a UUID. */
  @Get("channels")
  @UseGuards(AuthGuard)
  channels(): DepositChannelsResponse {
    return this.payments.channels();
  }

  @Post()
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  create(
    @Auth() auth: AccessPayload,
    @Body(new ZodPipe(createPaymentDto)) dto: CreatePaymentDto,
  ): Promise<PaymentResponse> {
    return this.payments.create(auth.sub, dto);
  }

  @Get(":id")
  @UseGuards(AuthGuard)
  get(
    @Auth() auth: AccessPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<PaymentResponse> {
    return this.payments.getOwn(auth.sub, id);
  }

  /** Server-side verify + settle — the webhook-free path. Never trusts the client. */
  @Post(":id/reconcile")
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  reconcile(
    @Auth() auth: AccessPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<PaymentResponse> {
    return this.payments.reconcileOwn(auth.sub, id);
  }
}
