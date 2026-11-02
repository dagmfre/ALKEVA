import {
  CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { eq } from "drizzle-orm";
import type { Request } from "express";
import { Redis } from "ioredis";
import { users, type Db } from "@alkeva/db";
import type { Env, Role } from "@alkeva/shared";
import { DB, ENV, REDIS } from "../core/core.module.js";
import type { AccessPayload } from "./auth.service.js";

export const ACCESS_COOKIE = "alkeva_access";
export const REFRESH_COOKIE = "alkeva_refresh";

export interface AuthedRequest extends Request {
  auth: AccessPayload;
}

/**
 * Reads the access JWT from the httpOnly cookie (or an Authorization header)
 * and refuses tokens whose session was revoked — sign-out-everywhere, a
 * password reset or detected refresh-token reuse take effect immediately, not
 * when the 15-minute token happens to expire. Depends only on global
 * providers so any module's controller can use it.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    const token = (req.cookies?.[ACCESS_COOKIE] as string | undefined) ?? bearer;
    if (!token) throw new UnauthorizedException("missing_token");

    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(token, {
        secret: this.env.JWT_SECRET,
      });
      if (payload.type !== "access") throw new Error("wrong type");
    } catch {
      throw new UnauthorizedException("invalid_token");
    }
    if (payload.sid && (await this.redis.exists(`sess:revoked:${payload.sid}`)) === 1) {
      throw new UnauthorizedException("session_revoked");
    }
    req.auth = payload;
    return true;
  }
}

export const ROLES_KEY = "roles";
/** Restrict a handler (or a whole controller) to specific staff roles. */
export const RequireRoles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Staff gate. The role is re-read from the database on every staff request —
 * a demotion or a freeze must not ride out the access token's lifetime on the
 * role baked into the JWT. With STAFF_REQUIRE_PASSKEY, the session must also
 * have been opened with a passkey.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!req.auth) throw new UnauthorizedException();

    const rows = await this.db
      .select({ role: users.role, status: users.status })
      .from(users)
      .where(eq(users.id, req.auth.sub))
      .limit(1);
    const current = rows[0];
    if (!current || current.status !== "active") throw new ForbiddenException("insufficient_role");
    if (!required.includes(current.role)) throw new ForbiddenException("insufficient_role");
    if (this.env.STAFF_REQUIRE_PASSKEY && !(req.auth.amr ?? []).includes("webauthn")) {
      throw new ForbiddenException("passkey_required");
    }
    req.auth = { ...req.auth, role: current.role };
    return true;
  }
}

/** Injects the verified access payload into a handler parameter. */
export const Auth = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  return req.auth;
});
