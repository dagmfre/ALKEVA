import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
// MailService is provided here directly (its only dependency is ENV) rather
// than importing NotificationsModule, which already imports AuthModule for
// its guards — a module cycle for one stateless class is not worth it. The
// reset email also must NOT create a notifications row: the payload would
// persist the raw reset URL and defeat the token-hash design.
import { MailService } from "../notifications/mail.service.js";
import { AuthController } from "./auth.controller.js";
import { AuthGuard, RolesGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";
import { GoogleAuthService } from "./google.service.js";
import { WebauthnController } from "./webauthn.controller.js";
import { WebauthnService } from "./webauthn.service.js";

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController, WebauthnController],
  providers: [AuthService, AuthGuard, RolesGuard, MailService, GoogleAuthService, WebauthnService],
  exports: [AuthService, AuthGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
