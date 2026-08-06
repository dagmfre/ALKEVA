import {
  CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import type { Env, Role } from "@alkeva/shared";
import { ENV } from "../core/core.module.js";
import type { AccessPayload } from "./auth.service.js";

export const ACCESS_COOKIE = "alkeva_access";
export const REFRESH_COOKIE = "alkeva_refresh";

export interface AuthedRequest extends Request {
  auth: AccessPayload;
}

/** Reads the access JWT from the httpOnly cookie or an Authorization header. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    const token = (req.cookies?.[ACCESS_COOKIE] as string | undefined) ?? bearer;
    if (!token) throw new UnauthorizedException("missing_token");

    try {
      const payload = await this.jwt.verifyAsync<AccessPayload>(token, {
        secret: this.env.JWT_SECRET,
      });
      if (payload.type !== "access") throw new Error("wrong type");
      req.auth = payload;
      return true;
    } catch {
      throw new UnauthorizedException("invalid_token");
    }
  }
}

export const ROLES_KEY = "roles";
/** Restrict a handler to specific staff roles. Used from Phase 5 onward. */
export const RequireRoles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!req.auth) throw new UnauthorizedException();
    if (!required.includes(req.auth.role)) throw new ForbiddenException("insufficient_role");
    return true;
  }
}

/** Injects the verified access payload into a handler parameter. */
export const Auth = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  return req.auth;
});
