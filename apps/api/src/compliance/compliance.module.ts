import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { ComplianceController } from "./compliance.controller.js";
import { ComplianceService } from "./compliance.service.js";

/**
 * The AML console. It imports AiModule for one thing — writing a case note in
 * the officer's language — and nothing that moves money. Freezing stays in
 * AdminModule, where a person's click is the only trigger.
 */
@Module({
  imports: [AuthModule, AiModule],
  controllers: [ComplianceController],
  providers: [ComplianceService],
})
export class ComplianceModule {}
