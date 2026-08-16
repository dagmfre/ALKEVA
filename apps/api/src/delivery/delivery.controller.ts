import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  createDeliveryDto,
  decisionNoteDto,
  deliveryScheduleDto,
  type CreateDeliveryDto,
  type DecisionNoteDto,
  type DeliveryScheduleDto,
} from "@alkeva/shared";
import { Auth, AuthGuard, RequireRoles, RolesGuard } from "../auth/auth.guard.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { ZodPipe } from "../core/zod.pipe.js";
import { DeliveryService } from "./delivery.service.js";

/** User side: request + own list. Eligibility is the service's gate. */
@Controller("delivery")
@UseGuards(AuthGuard)
export class DeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  @Post()
  @HttpCode(201)
  create(
    @Auth() auth: AccessPayload,
    @Body(new ZodPipe(createDeliveryDto)) dto: CreateDeliveryDto,
  ) {
    return this.delivery.create(auth.sub, dto);
  }

  @Get()
  list(@Auth() auth: AccessPayload) {
    return this.delivery.listOwn(auth.sub);
  }
}

/** Staff side — administrator + compliance, like the KYC queue. */
@Controller("admin/delivery")
@UseGuards(AuthGuard, RolesGuard)
export class AdminDeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  @Get()
  @RequireRoles("administrator", "compliance")
  list(@Query("status") status?: string) {
    return this.delivery.listAdmin(status);
  }

  @Post(":id/approve")
  @RequireRoles("administrator", "compliance")
  async approve(
    @Auth() auth: AccessPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(decisionNoteDto)) dto: DecisionNoteDto,
  ): Promise<{ ok: true }> {
    await this.delivery.approve(id, auth.sub, dto.note);
    return { ok: true };
  }

  @Post(":id/schedule")
  @RequireRoles("administrator", "compliance")
  async schedule(
    @Auth() auth: AccessPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(deliveryScheduleDto)) dto: DeliveryScheduleDto,
  ): Promise<{ ok: true }> {
    await this.delivery.schedule(id, auth.sub, dto.scheduledFor);
    return { ok: true };
  }

  @Post(":id/reject")
  @RequireRoles("administrator", "compliance")
  async reject(
    @Auth() auth: AccessPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(decisionNoteDto)) dto: DecisionNoteDto,
  ): Promise<{ ok: true }> {
    await this.delivery.reject(id, auth.sub, dto.note);
    return { ok: true };
  }
}
