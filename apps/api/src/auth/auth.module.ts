import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
// The notification/mail services come from the controller-free core module:
// NotificationsModule itself imports AuthModule for its guards, so importing
// it here would be a cycle. Secret-bearing mail (reset links, codes) goes
// through MailService directly and never becomes a notification row.
import { NotificationsCoreModule } from "../notifications/notifications-core.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthGuard, RolesGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";
import { EmailCodesService } from "./email-codes.service.js";
import { FaydaService } from "./fayda.service.js";
import { GoogleAuthService } from "./google.service.js";
import { SessionsService } from "./sessions.service.js";
import { WebauthnController } from "./webauthn.controller.js";
import { WebauthnService } from "./webauthn.service.js";

@Module({
  imports: [JwtModule.register({}), NotificationsCoreModule],
  controllers: [AuthController, WebauthnController],
  providers: [
    AuthService,
    AuthGuard,
    RolesGuard,
    GoogleAuthService,
    WebauthnService,
    EmailCodesService,
    SessionsService,
    FaydaService,
  ],
  exports: [AuthService, AuthGuard, RolesGuard, JwtModule, EmailCodesService, SessionsService],
})
export class AuthModule {}
