import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import argon2 from "argon2";
import { eq, sql } from "drizzle-orm";
import { users, type Db } from "@alkeva/db";
import type { Env, LoginDto, MeResponse, RegisterDto, Role } from "@alkeva/shared";
import { DB, ENV } from "../core/core.module.js";

export interface AccessPayload {
  sub: string;
  role: Role;
  type: "access";
}
export interface RefreshPayload {
  sub: string;
  type: "refresh";
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<{ user: MeResponse; tokens: TokenPair }> {
    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(sql`lower(${users.email})`, dto.email.toLowerCase()))
      .limit(1);
    if (existing.length > 0) {
      throw new ConflictException("email_taken");
    }

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    const inserted = await this.db
      .insert(users)
      .values({
        email: dto.email.toLowerCase(),
        passwordHash,
        fullName: dto.fullName,
        locale: dto.locale,
      })
      .returning();
    const user = inserted[0]!;

    const tokens = await this.issueTokens(user.id, user.role);
    return { user: this.toMe(user), tokens };
  }

  async login(dto: LoginDto): Promise<{ user: MeResponse; tokens: TokenPair }> {
    const found = await this.db
      .select()
      .from(users)
      .where(eq(sql`lower(${users.email})`, dto.email.toLowerCase()))
      .limit(1);
    const user = found[0];
    // Uniform error for unknown email vs wrong password — no account enumeration.
    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException("invalid_credentials");
    }

    const tokens = await this.issueTokens(user.id, user.role);
    return { user: this.toMe(user), tokens };
  }

  /** Rotating refresh: the presented token must match the stored hash, then it is replaced. */
  async refresh(refreshToken: string): Promise<{ user: MeResponse; tokens: TokenPair }> {
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: this.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException("invalid_refresh");
    }
    if (payload.type !== "refresh") throw new UnauthorizedException("invalid_refresh");

    const found = await this.db
      .select()
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);
    const user = found[0];
    if (
      !user ||
      !user.refreshTokenHash ||
      !(await argon2.verify(user.refreshTokenHash, refreshToken))
    ) {
      throw new UnauthorizedException("invalid_refresh");
    }

    const tokens = await this.issueTokens(user.id, user.role);
    return { user: this.toMe(user), tokens };
  }

  async logout(userId: string): Promise<void> {
    await this.db
      .update(users)
      .set({ refreshTokenHash: null })
      .where(eq(users.id, userId));
  }

  async me(userId: string): Promise<MeResponse> {
    const found = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!found[0]) throw new UnauthorizedException();
    return this.toMe(found[0]);
  }

  /** Recovery stub — records intent only; the email flow arrives with notifications. */
  async requestRecovery(email: string): Promise<void> {
    console.log(`[recovery-stub] password recovery requested for ${email}`);
  }

  private async issueTokens(userId: string, role: Role): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, role, type: "access" } satisfies AccessPayload,
      { secret: this.env.JWT_SECRET, expiresIn: this.env.ACCESS_TOKEN_TTL_SEC },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, type: "refresh" } satisfies RefreshPayload,
      { secret: this.env.JWT_REFRESH_SECRET, expiresIn: this.env.REFRESH_TOKEN_TTL_SEC },
    );
    const refreshTokenHash = await argon2.hash(refreshToken, { type: argon2.argon2id });
    await this.db.update(users).set({ refreshTokenHash }).where(eq(users.id, userId));
    return { accessToken, refreshToken };
  }

  private toMe(user: typeof users.$inferSelect): MeResponse {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      locale: user.locale,
      role: user.role,
      status: user.status,
      kycTier: user.kycTier,
    };
  }
}
