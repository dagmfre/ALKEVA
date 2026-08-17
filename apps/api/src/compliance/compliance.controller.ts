import {
  BadRequestException,
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
import { decisionNoteDto, type DecisionNoteDto, type RiskCaseStatus } from "@alkeva/shared";
import { Auth, AuthGuard, RequireRoles, RolesGuard } from "../auth/auth.guard.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { ZodPipe } from "../core/zod.pipe.js";
import { ComplianceService } from "./compliance.service.js";

/**
 * The AML case queue. Its own controller rather than more surface on
 * admin.controller.ts — the same shape admin/delivery already uses.
 *
 * Note what is absent: nothing here freezes an account. Freezing remains
 * AdminService.freeze, which refuses self-freeze and staff-freeze and writes
 * its own audit row. A rules engine that could freeze on its own would be the
 * thing C2 exists to forbid.
 */
@Controller("admin/compliance")
@UseGuards(AuthGuard, RolesGuard)
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Get("cases")
  @RequireRoles("administrator", "compliance")
  cases(@Query("status") status?: string) {
    if (status && status !== "open" && status !== "resolved") {
      throw new BadRequestException("invalid_status");
    }
    return this.compliance.listCases((status ?? "open") as RiskCaseStatus);
  }

  /** Run the deterministic pass now — the same engine the worker runs on a timer. */
  @Post("scan")
  @RequireRoles("administrator", "compliance")
  @HttpCode(200)
  scan(@Auth() auth: AccessPayload) {
    return this.compliance.scan(auth.sub);
  }

  @Post("cases/:id/resolve")
  @RequireRoles("administrator", "compliance")
  @HttpCode(200)
  resolve(
    @Auth() auth: AccessPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(decisionNoteDto)) dto: DecisionNoteDto,
  ) {
    return this.compliance.resolve(id, auth.sub, dto.note);
  }

  /** Assistant-written case note in the officer's own language. Display only. */
  @Post("cases/:id/narrative")
  @RequireRoles("administrator", "compliance")
  @HttpCode(200)
  narrative(@Auth() auth: AccessPayload, @Param("id", ParseUUIDPipe) id: string) {
    return this.compliance.narrate(id, auth.sub);
  }
}
