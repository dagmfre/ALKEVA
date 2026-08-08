import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  createOrderDto,
  listOrdersDto,
  type CreateOrderDto,
  type ListOrdersDto,
  type OrderListResponse,
  type OrderResponse,
  type ReceiptResponse,
} from "@alkeva/shared";
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

  @Get()
  @UseGuards(AuthGuard)
  list(
    @Auth() auth: AccessPayload,
    @Query(new ZodPipe(listOrdersDto)) query: ListOrdersDto,
  ): Promise<OrderListResponse> {
    return this.orders.list(auth.sub, query);
  }

  @Get(":id")
  @UseGuards(AuthGuard)
  get(
    @Auth() auth: AccessPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<OrderResponse> {
    return this.orders.getOwn(auth.sub, id);
  }

  @Get(":id/receipt")
  @UseGuards(AuthGuard)
  receipt(
    @Auth() auth: AccessPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<ReceiptResponse> {
    return this.orders.receipt(auth.sub, id);
  }
}
