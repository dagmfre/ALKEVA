import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { Redis } from "ioredis";
import { and, eq } from "drizzle-orm";
import { auditLogs, users, webauthnCredentials, type Db } from "@alkeva/db";
import type { Env } from "@alkeva/shared";
import { DB, ENV, REDIS } from "../core/core.module.js";

const CHALLENGE_TTL_SEC = 300;

/**
 * Passkeys (WebAuthn) — the "biometric" login (spec 4.4, formerly cut-list
 * #6). SimpleWebAuthn v13 does the cryptography; this service owns the
 * challenge lifecycle (Redis, 5-min TTL, single use) and the credential rows.
 *
 * Login is usernameless: discoverable credentials, so the options carry no
 * allowCredentials and the browser offers whatever passkeys it holds for
 * this rpID. The signature counter is checked and advanced on every
 * assertion — a cloned authenticator replaying an old counter is refused by
 * the library.
 */
@Injectable()
export class WebauthnService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  get configured(): boolean {
    return this.env.WEBAUTHN_RP_ID.length > 0 && this.env.WEBAUTHN_ORIGIN.length > 0;
  }

  private guard(): void {
    if (!this.configured) throw new ServiceUnavailableException("webauthn_unconfigured");
  }

  async registrationOptions(userId: string): Promise<PublicKeyCredentialCreationOptionsJSON> {
    this.guard();
    const found = await this.db
      .select({ email: users.email, fullName: users.fullName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const user = found[0];
    if (!user) throw new UnauthorizedException();

    const existing = await this.db
      .select({ credentialId: webauthnCredentials.credentialId, transports: webauthnCredentials.transports })
      .from(webauthnCredentials)
      .where(eq(webauthnCredentials.userId, userId));

    const options = await generateRegistrationOptions({
      rpName: "ALKEVA",
      rpID: this.env.WEBAUTHN_RP_ID,
      userName: user.email,
      userDisplayName: user.fullName,
      attestationType: "none",
      excludeCredentials: existing.map((c) => ({
        id: c.credentialId,
        transports: c.transports ? (JSON.parse(c.transports) as never) : undefined,
      })),
      // Discoverable REQUIRED so the passkey works usernameless at login.
      authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
    });

    await this.redis.set(`webauthn:reg:${userId}`, options.challenge, "EX", CHALLENGE_TTL_SEC);
    return options;
  }

  async registrationVerify(
    userId: string,
    response: RegistrationResponseJSON,
    label?: string,
  ): Promise<void> {
    this.guard();
    const key = `webauthn:reg:${userId}`;
    const expectedChallenge = await this.redis.get(key);
    await this.redis.del(key);
    if (!expectedChallenge) throw new BadRequestException("webauthn_challenge_expired");

    let verified = false;
    let info: Awaited<ReturnType<typeof verifyRegistrationResponse>>["registrationInfo"];
    try {
      const result = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.env.WEBAUTHN_ORIGIN,
        expectedRPID: this.env.WEBAUTHN_RP_ID,
        requireUserVerification: false,
      });
      verified = result.verified;
      info = result.registrationInfo;
    } catch {
      throw new BadRequestException("webauthn_verify_failed");
    }
    if (!verified || !info) throw new BadRequestException("webauthn_verify_failed");

    await this.db.insert(webauthnCredentials).values({
      userId,
      credentialId: info.credential.id,
      publicKey: Buffer.from(info.credential.publicKey),
      counter: BigInt(info.credential.counter),
      transports: info.credential.transports ? JSON.stringify(info.credential.transports) : null,
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp,
      label: label?.trim() || null,
    });
    await this.db.insert(auditLogs).values({
      actorId: userId,
      actorLabel: "user:webauthn",
      action: "passkey_enrolled",
      targetType: "user",
      targetId: userId,
    });
  }

  async authenticationOptions(): Promise<{
    sessionId: string;
    options: PublicKeyCredentialRequestOptionsJSON;
  }> {
    this.guard();
    const options = await generateAuthenticationOptions({
      rpID: this.env.WEBAUTHN_RP_ID,
      userVerification: "preferred",
      // No allowCredentials: discoverable/usernameless flow.
    });
    const sessionId = crypto.randomUUID();
    await this.redis.set(`webauthn:login:${sessionId}`, options.challenge, "EX", CHALLENGE_TTL_SEC);
    return { sessionId, options };
  }

  /** Verifies the assertion and returns the owning userId. */
  async authenticationVerify(
    sessionId: string,
    response: AuthenticationResponseJSON,
  ): Promise<string> {
    this.guard();
    const key = `webauthn:login:${sessionId}`;
    const expectedChallenge = await this.redis.get(key);
    await this.redis.del(key);
    if (!expectedChallenge) throw new UnauthorizedException("webauthn_challenge_expired");

    const rows = await this.db
      .select()
      .from(webauthnCredentials)
      .where(eq(webauthnCredentials.credentialId, response.id))
      .limit(1);
    const cred = rows[0];
    if (!cred) throw new UnauthorizedException("invalid_credentials");

    let verified = false;
    let newCounter = 0;
    try {
      const result = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.env.WEBAUTHN_ORIGIN,
        expectedRPID: this.env.WEBAUTHN_RP_ID,
        credential: {
          id: cred.credentialId,
          publicKey: new Uint8Array(cred.publicKey),
          counter: Number(cred.counter),
          transports: cred.transports ? (JSON.parse(cred.transports) as never) : undefined,
        },
      });
      verified = result.verified;
      newCounter = result.authenticationInfo.newCounter;
    } catch {
      throw new UnauthorizedException("invalid_credentials");
    }
    if (!verified) throw new UnauthorizedException("invalid_credentials");

    await this.db
      .update(webauthnCredentials)
      .set({ counter: BigInt(newCounter), lastUsedAt: new Date() })
      .where(eq(webauthnCredentials.id, cred.id));
    await this.db.insert(auditLogs).values({
      actorId: cred.userId,
      actorLabel: "user:webauthn",
      action: "passkey_login",
      targetType: "user",
      targetId: cred.userId,
    });
    return cred.userId;
  }

  async listOwn(userId: string) {
    const rows = await this.db
      .select({
        id: webauthnCredentials.id,
        label: webauthnCredentials.label,
        deviceType: webauthnCredentials.deviceType,
        backedUp: webauthnCredentials.backedUp,
        createdAt: webauthnCredentials.createdAt,
        lastUsedAt: webauthnCredentials.lastUsedAt,
      })
      .from(webauthnCredentials)
      .where(eq(webauthnCredentials.userId, userId));
    // Never returns publicKey — the browser has no business holding it.
    return {
      credentials: rows.map((r) => ({
        id: r.id,
        label: r.label,
        deviceType: r.deviceType,
        backedUp: r.backedUp,
        createdAt: r.createdAt.toISOString(),
        lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
      })),
    };
  }

  async remove(userId: string, id: string): Promise<void> {
    const deleted = await this.db
      .delete(webauthnCredentials)
      .where(and(eq(webauthnCredentials.id, id), eq(webauthnCredentials.userId, userId)))
      .returning({ id: webauthnCredentials.id });
    if (deleted.length === 0) throw new NotFoundException("not_found");
    await this.db.insert(auditLogs).values({
      actorId: userId,
      actorLabel: "user:webauthn",
      action: "passkey_removed",
      targetType: "webauthn_credential",
      targetId: id,
    });
  }
}
