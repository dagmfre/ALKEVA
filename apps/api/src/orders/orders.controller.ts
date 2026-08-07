import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { createOrderDto, type CreateOrderDto, type OrderResponse } from "@alkeva/shared";
import { Auth, AuthGuard } from "../auth/auth.guard.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { ZodPipe } from "../core/zod.pipe.js";
import { OrdersService } from "./orders.service.js";

@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @UseGuards(AuthGuard)
  create(
    @Auth() auth: AccessPayload,
    @Body(new ZodPipe(createOrderDto)) dto: CreateOrderDto,
  ): Promise<OrderResponse> {
    return this.orders.execute(auth.sub, dto);
  }

  @Get(":id")
  @UseGuards(AuthGuard)
  get(
    @Auth() auth: AccessPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<OrderResponse> {
    return this.orders.getOwn(auth.sub, id);
  }
}
