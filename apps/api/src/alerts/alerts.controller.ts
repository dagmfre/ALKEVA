import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  createAlertDto,
  type AlertsResponse,
  type CreateAlertDto,
} from "@alkeva/shared";
import { Auth, AuthGuard } from "../auth/auth.guard.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { ZodPipe } from "../core/zod.pipe.js";
import { AlertsService } from "./alerts.service.js";

@Controller("alerts")
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Post()
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  create(
    @Auth() auth: AccessPayload,
    @Body(new ZodPipe(createAlertDto)) dto: CreateAlertDto,
  ): Promise<AlertsResponse> {
    return this.alerts.create(auth.sub, dto);
  }

  @Get()
  @UseGuards(AuthGuard)
  list(@Auth() auth: AccessPayload): Promise<AlertsResponse> {
    return this.alerts.listOwn(auth.sub);
  }

  @Delete(":id")
  @UseGuards(AuthGuard)
  remove(
    @Auth() auth: AccessPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<AlertsResponse> {
    return this.alerts.remove(auth.sub, id);
  }
}
