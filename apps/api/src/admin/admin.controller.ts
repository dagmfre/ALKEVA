import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import {
  adminSearchDto,
  decisionNoteDto,
  freezeDto,
  type AdminAnalyticsResponse,
  type AdminOverviewResponse,
  type AdminSearchDto,
  type AdminTreasuryResponse,
  type AdminUserDetailResponse,
  type DecisionNoteDto,
  type FreezeDto,
  type OrderResponse,
  type PayoutStatus,
} from "@alkeva/shared";
import { Auth, AuthGuard, RequireRoles, RolesGuard } from "../auth/auth.guard.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { ZodPipe } from "../core/zod.pipe.js";
import { KycService } from "../kyc/kyc.service.js";
import { OrdersService } from "../orders/orders.service.js";
import { PayoutsService } from "../payouts/payouts.service.js";
import { AdminService } from "./admin.service.js";

/**
 * The staff console (Design §9). RolesGuard runs on every route. The
 * administrator is the superuser — every queue visible and actionable
 * (decided 13 Aug 2026); compliance and finance stay scoped to identity/
 * freezes/reviews and outbound money respectively. The payout self-approval
 * ban binds administrators too. There is no balance-adjust route —
 * deliberately, verifiably, permanently.
 */
@Controller("admin")
@UseGuards(AuthGuard, RolesGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly kyc: KycService,
    private readonly payouts: PayoutsService,
    private readonly orders: OrdersService,
  ) {}

  @Get("overview")
  @RequireRoles("administrator", "compliance", "finance")
  overview(): Promise<AdminOverviewResponse> {
    return this.admin.overview();
  }

  @Get("analytics")
  @RequireRoles("administrator", "compliance", "finance")
  analytics(@Query("days") days?: string): Promise<AdminAnalyticsResponse> {
    const parsed = Number(days);
    return this.admin.analytics(Number.isFinite(parsed) && parsed > 0 ? parsed : 30);
  }

  // ── users ───────────────────────────────────────────────────────

  @Get("users")
  @RequireRoles("administrator", "compliance")
  listUsers(@Query(new ZodPipe(adminSearchDto)) dto: AdminSearchDto) {
    return this.admin.listUsers(dto);
  }

  @Get("users/:id")
  @RequireRoles("administrator", "compliance")
  userDetail(@Param("id", ParseUUIDPipe) id: string): Promise<AdminUserDetailResponse> {
    return this.admin.userDetail(id);
  }

  @Post("users/:id/freeze")
  @RequireRoles("administrator", "compliance")
  async freeze(
    @Auth() auth: AccessPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(freezeDto)) dto: FreezeDto,
  ): Promise<{ ok: true }> {
    await this.admin.freeze(id, auth.sub, dto.reason);
    return { ok: true };
  }

  @Post("users/:id/unfreeze")
  @RequireRoles("administrator", "compliance")
  async unfreeze(
    @Auth() auth: AccessPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    await this.admin.unfreeze(id, auth.sub);
    return { ok: true };
  }

  // ── KYC queue ───────────────────────────────────────────────────

  @Get("kyc")
  @RequireRoles("administrator", "compliance")
  listKyc(@Query("status") status?: string) {
    return this.admin.listKyc(status);
  }

  @Get("kyc/:id/file")
  @RequireRoles("administrator", "compliance")
  async kycFile(@Param("id", ParseUUIDPipe) id: string, @Res() res: Response): Promise<void> {
    const { data, mime } = await this.kyc.file(id);
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", "inline");
    res.send(data);
  }

  @Post("kyc/:id/approve")
  @RequireRoles("administrator", "compliance")
  async approveKyc(
    @Auth() auth: AccessPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(decisionNoteDto)) dto: DecisionNoteDto,
  ): Promise<{ ok: true }> {
    await this.kyc.review(id, auth.sub, "approved", dto.note);
    return { ok: true };
  }

  @Post("kyc/:id/reject")
  @RequireRoles("administrator", "compliance")
  async rejectKyc(
    @Auth() auth: AccessPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(decisionNoteDto)) dto: DecisionNoteDto,
  ): Promise<{ ok: true }> {
    await this.kyc.review(id, auth.sub, "rejected", dto.note);
    return { ok: true };
  }

  // ── payout queue (finance) ──────────────────────────────────────

  @Get("payouts")
  @RequireRoles("administrator", "finance")
  listPayouts(@Query("status") status?: string) {
    const valid = ["requested", "approved", "processing", "settled", "rejected"];
    return this.payouts.listByStatus(
      valid.includes(status ?? "") ? (status as PayoutStatus) : undefined,
    );
  }

  @Post("payouts/:id/approve")
  @RequireRoles("administrator", "finance")
  approvePayout(@Auth() auth: AccessPayload, @Param("id", ParseUUIDPipe) id: string) {
    return this.payouts.approve(id, auth.sub);
  }

  @Post("payouts/:id/reject")
  @RequireRoles("administrator", "finance")
  rejectPayout(
    @Auth() auth: AccessPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(decisionNoteDto)) dto: DecisionNoteDto,
  ) {
    return this.payouts.reject(id, auth.sub, dto.note);
  }

  // ── review queue (compliance) ───────────────────────────────────

  @Get("reviews")
  @RequireRoles("administrator", "compliance")
  listReviews() {
    return this.admin.listReviews();
  }

  @Post("orders/:id/approve-review")
  @RequireRoles("administrator", "compliance")
  approveReview(
    @Auth() auth: AccessPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(decisionNoteDto)) dto: DecisionNoteDto,
  ): Promise<OrderResponse> {
    return this.orders.resolveReview(id, auth.sub, "approve", dto.note);
  }

  @Post("orders/:id/reject-review")
  @RequireRoles("administrator", "compliance")
  rejectReview(
    @Auth() auth: AccessPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(decisionNoteDto)) dto: DecisionNoteDto,
  ): Promise<OrderResponse> {
    return this.orders.resolveReview(id, auth.sub, "reject", dto.note);
  }

  // ── transaction search / treasury / audit / export ──────────────

  @Get("orders")
  @RequireRoles("administrator", "compliance", "finance")
  searchOrders(@Query(new ZodPipe(adminSearchDto)) dto: AdminSearchDto) {
    return this.admin.searchOrders(dto);
  }

  @Get("treasury")
  @RequireRoles("administrator", "finance")
  treasury(): Promise<AdminTreasuryResponse> {
    return this.admin.treasuryDetail();
  }

  @Get("audit")
  @RequireRoles("administrator", "compliance")
  audit(@Query("before") before?: string) {
    return this.admin.listAudit(before);
  }

  @Get("compliance/export.csv")
  @RequireRoles("administrator", "compliance")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="alkeva-compliance-events.csv"')
  exportCsv(): Promise<string> {
    return this.admin.complianceCsv();
  }
}
