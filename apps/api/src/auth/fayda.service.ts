import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { Redis } from "ioredis";
import {
  compactDecrypt,
  createRemoteJWKSet,
  decodeJwt,
  decodeProtectedHeader,
  importJWK,
  jwtVerify,
  SignJWT,
  type JWK,
  type JWTPayload,
} from "jose";
import { auditLogs, authIdentities, identityVerifications, users, type Db } from "@alkeva/db";
import type { Env, FaydaProfileSummary, Locale } from "@alkeva/shared";
import { DB, ENV, REDIS } from "../core/core.module.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { EmailCodesService } from "./email-codes.service.js";

const PROVIDER = "fayda";
const TX_TTL_SEC = 600;
const PENDING_TTL_SEC = 900;
const DISCOVERY_TTL_MS = 3_600_000;
const MAX_PICTURE_BYTES = 1_500_000;
const CLIENT_ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
}

interface FaydaTx {
  nonce: string;
  verifier: string;
  intent: "signin" | "link";
  userId: string | null;
  /** sha256 of the browser-binding cookie. */
  bh: string;
}

/** What a verified Fayda sign-in told us about the person. */
export interface FaydaProfile {
  sub: string;
  legalName: string;
  birthdate: string | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  address: unknown;
  nationality: string | null;
  picture: string | null;
  pictureMime: string | null;
}

export type FaydaOutcome =
  | { kind: "signed_in"; userId: string }
  | { kind: "linked"; userId: string }
  | { kind: "needs_profile"; token: string; profile: FaydaProfileSummary };

/**
 * VeriFayda 2.0 (eSignet) — Ethiopia's national ID as an OpenID Provider.
 * Implemented from the RP integration guide (docs/fayda/) and the live
 * discovery document, never from the reference app (which hardcodes its
 * verifier/state/nonce and verifies nothing):
 *
 *  - Authorization Code + PKCE (S256 only), `state` + `nonce` per attempt,
 *    kept server-side in Redis (single use) and bound to the starting
 *    browser with an httpOnly cookie — a callback URL pasted into another
 *    browser goes nowhere (login CSRF).
 *  - Token endpoint authenticated with private_key_jwt: an RS256 client
 *    assertion (iss = sub = client_id, aud = token endpoint, ≤5 min, a fresh
 *    `jti` every time — VeriFayda 2 v1.8 rejects a reused one).
 *  - id_token verified against the discovery JWKS (RS256, iss, aud, exp) and
 *    its `nonce` checked; userinfo is a signed JWT, decrypted first when the
 *    client is registered for JWE, and its `sub` must equal the id_token's.
 *  - Tokens and claims are never logged. `sub` is pairwise (per client), so it
 *    is the stable key; the FIN itself is not stored.
 *
 * A verified Fayda identity is the platform's identity check (KYC_METHODS):
 * it raises kyc_tier to 1 and records the legal name, birthdate and photo.
 */
@Injectable()
export class FaydaService {
  private discovery: { at: number; doc: Discovery } | null = null;
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
  private signingKey: Awaited<ReturnType<typeof importJWK>> | null = null;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly notifications: NotificationsService,
    private readonly codes: EmailCodesService,
  ) {}

  private get credentialsSet(): boolean {
    return this.env.FAYDA_CLIENT_ID.length > 0 && this.env.FAYDA_PRIVATE_KEY.length > 0;
  }

  /** Fayda offered as a way to sign in / create an account. */
  get signInEnabled(): boolean {
    return this.credentialsSet && this.env.AUTH_METHODS.includes("fayda");
  }

  /** Fayda offered as the identity check for an existing account. */
  get verificationEnabled(): boolean {
    return this.credentialsSet && this.env.KYC_METHODS.includes("fayda");
  }

  get redirectUri(): string {
    return this.env.FAYDA_REDIRECT_URI || `${this.env.WEB_ORIGIN}/callback`;
  }

  /** Builds the authorize URL; the caller sets the binding cookie. */
  async start(
    intent: "signin" | "link",
    userId: string | null,
  ): Promise<{ url: string; binding: string }> {
    if (intent === "signin" && !this.signInEnabled) {
      throw new ServiceUnavailableException("fayda_unconfigured");
    }
    if (intent === "link" && !this.verificationEnabled && !this.signInEnabled) {
      throw new ServiceUnavailableException("fayda_unconfigured");
    }
    if (intent === "link" && userId) {
      const linked = await this.db
        .select({ id: identityVerifications.id })
        .from(identityVerifications)
        .where(eq(identityVerifications.userId, userId))
        .limit(1);
      if (linked.length > 0) throw new ConflictException("fayda_already_verified");
    }

    const discovery = await this.getDiscovery();
    const state = randomBytes(24).toString("base64url");
    const nonce = randomBytes(24).toString("base64url");
    const verifier = randomBytes(48).toString("base64url"); // 64 chars, within 43–128
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const binding = randomBytes(24).toString("base64url");

    const tx: FaydaTx = { nonce, verifier, intent, userId, bh: sha256(binding) };
    await this.redis.set(`fayda:tx:${state}`, JSON.stringify(tx), "EX", TX_TTL_SEC);

    // name + birthdate are what the identity check needs; everything else is
    // offered to the user as optional on the consent screen.
    const claims = {
      userinfo: {
        name: { essential: true },
        birthdate: { essential: true },
        gender: { essential: false },
        phone_number: { essential: false },
        email: { essential: false },
        picture: { essential: false },
        address: { essential: false },
        nationality: { essential: false },
      },
      id_token: {},
    };
    const params = new URLSearchParams({
      client_id: this.env.FAYDA_CLIENT_ID,
      response_type: "code",
      redirect_uri: this.redirectUri,
      scope: "openid profile email",
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
      claims: JSON.stringify(claims),
      ui_locales: this.env.FAYDA_UI_LOCALES,
      display: "page",
    });
    if (this.env.FAYDA_ACR_VALUES.trim()) params.set("acr_values", this.env.FAYDA_ACR_VALUES.trim());
    return { url: `${discovery.authorization_endpoint}?${params.toString()}`, binding };
  }

  /**
   * The callback: state + binding, code exchange, token verification, then
   * account resolution. Returns what the web page should do next.
   */
  async callback(code: string, state: string, binding: string | undefined): Promise<FaydaOutcome> {
    const raw = await this.redis.getdel(`fayda:tx:${state}`);
    if (!raw) throw new UnauthorizedException("fayda_state_invalid");
    const tx = JSON.parse(raw) as FaydaTx;
    if (!binding || !safeEqual(sha256(binding), tx.bh)) {
      throw new UnauthorizedException("fayda_state_invalid");
    }

    const profile = await this.exchange(code, tx);

    const identity = await this.db
      .select({ userId: authIdentities.userId })
      .from(authIdentities)
      .where(and(eq(authIdentities.provider, PROVIDER), eq(authIdentities.providerUserId, profile.sub)))
      .limit(1);
    const known = identity[0];

    if (tx.intent === "link") {
      if (!tx.userId) throw new UnauthorizedException("fayda_state_invalid");
      if (known && known.userId !== tx.userId) throw new ConflictException("fayda_linked_elsewhere");
      if (!known) await this.attach(tx.userId, profile);
      return { kind: "linked", userId: tx.userId };
    }

    if (known) return { kind: "signed_in", userId: known.userId };

    // New person: park the verified profile until they confirm an email and
    // accept the terms (Fayda often has no email; alerts need one).
    this.assertAdult(profile);
    const token = randomBytes(32).toString("base64url");
    await this.redis.set(
      `fayda:pending:${token}`,
      JSON.stringify({ profile, bh: tx.bh }),
      "EX",
      PENDING_TTL_SEC,
    );
    return {
      kind: "needs_profile",
      token,
      profile: { name: profile.legalName, email: profile.email },
    };
  }

  /** Creates the account for a pending Fayda sign-in. Returns the new user id. */
  async complete(
    token: string,
    binding: string | undefined,
    email: string,
    locale: Locale,
  ): Promise<string> {
    const raw = await this.redis.getdel(`fayda:pending:${token}`);
    if (!raw) throw new UnauthorizedException("fayda_pending_expired");
    const pending = JSON.parse(raw) as { profile: FaydaProfile; bh: string };
    if (!binding || !safeEqual(sha256(binding), pending.bh)) {
      throw new UnauthorizedException("fayda_state_invalid");
    }
    const normalized = email.trim().toLowerCase();

    const taken = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(sql`lower(${users.email})`, normalized))
      .limit(1);
    // Never auto-link by email: an address proves nothing about who holds an
    // existing account. The owner signs in and verifies with Fayda instead.
    if (taken.length > 0) throw new ConflictException("email_taken_link_instead");

    const inserted = await this.db
      .insert(users)
      .values({
        email: normalized,
        passwordHash: null,
        fullName: pending.profile.legalName,
        phone: pending.profile.phone,
        locale,
        termsAcceptedAt: new Date(),
      })
      .returning({ id: users.id });
    const userId = inserted[0]!.id;
    await this.attach(userId, pending.profile);
    await this.codes.issue(userId, "verify_email").catch((err) => {
      console.error(`verification code send failed for ${userId}:`, err);
    });
    return userId;
  }

  // ── internals ───────────────────────────────────────────────────

  private async exchange(code: string, tx: FaydaTx): Promise<FaydaProfile> {
    const discovery = await this.getDiscovery();
    const assertion = await this.clientAssertion(discovery.token_endpoint);

    const res = await fetch(discovery.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: this.redirectUri,
        client_id: this.env.FAYDA_CLIENT_ID,
        client_assertion_type: CLIENT_ASSERTION_TYPE,
        client_assertion: assertion,
        code_verifier: tx.verifier,
      }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!res) throw new BadGatewayException("fayda_unreachable");
    const body = (await res.json().catch(() => null)) as
      | { id_token?: string; access_token?: string; error?: string }
      | null;
    if (!res.ok || !body?.id_token || !body.access_token) {
      // The error CODE only — never the response body (it may carry tokens).
      console.warn(`fayda token exchange failed: HTTP ${res.status} ${body?.error ?? ""}`);
      throw new UnauthorizedException(
        body?.error === "invalid_client" || body?.error === "invalid_assertion"
          ? "fayda_client_rejected"
          : "fayda_code_invalid",
      );
    }

    const jwks = this.getJwks(discovery);
    let idClaims: JWTPayload;
    try {
      ({ payload: idClaims } = await jwtVerify(body.id_token, jwks, {
        // Observed on the live sandbox (2 Nov 2026), contrary to its own
        // discovery document: the id_token is signed PS256 (discovery lists
        // only RS256) and its `iss` is "<issuer>/v1/esignet". Both forms are
        // accepted — still the same host, still the discovery JWKS — and
        // nothing else is.
        issuer: [discovery.issuer, `${discovery.issuer.replace(/\/+$/, "")}/v1/esignet`],
        audience: this.env.FAYDA_CLIENT_ID,
        algorithms: ["RS256", "PS256"],
        clockTolerance: 30,
      }));
    } catch (err) {
      console.warn(`fayda id_token rejected: ${(err as { code?: string }).code ?? "unknown"}`);
      throw new UnauthorizedException("fayda_token_invalid");
    }
    if (idClaims.nonce !== tx.nonce || typeof idClaims.sub !== "string") {
      throw new UnauthorizedException("fayda_token_invalid");
    }

    const userinfo = await this.fetchUserinfo(discovery, body.access_token);
    if (userinfo.sub !== idClaims.sub) throw new UnauthorizedException("fayda_token_invalid");
    return this.toProfile(idClaims.sub, userinfo);
  }

  private async fetchUserinfo(discovery: Discovery, accessToken: string): Promise<JWTPayload> {
    const res = await fetch(discovery.userinfo_endpoint, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!res || !res.ok) {
      console.warn(`fayda userinfo failed: HTTP ${res?.status ?? "network"}`);
      throw new UnauthorizedException("fayda_userinfo_failed");
    }
    let jwt = (await res.text()).trim();
    // JWE (5 segments) for clients registered for encrypted userinfo.
    if (jwt.split(".").length === 5) {
      if (!this.env.FAYDA_USERINFO_ENC_KEY) throw new UnauthorizedException("fayda_userinfo_encrypted");
      const encKey = await importJWK(decodeJwk(this.env.FAYDA_USERINFO_ENC_KEY));
      const { plaintext } = await compactDecrypt(jwt, encKey);
      jwt = new TextDecoder().decode(plaintext);
    }
    // Never accept an unsigned answer: no JWS, no identity.
    if (jwt.split(".").length !== 3) throw new UnauthorizedException("fayda_userinfo_invalid");
    const verify = () =>
      jwtVerify(jwt, this.getJwks(discovery), { algorithms: ["RS256", "PS256"], clockTolerance: 30 });
    try {
      return (await verify()).payload;
    } catch (err) {
      const code = (err as { code?: string }).code ?? "unknown";
      if (code === "ERR_JWKS_NO_MATCHING_KEY") {
        // The provider may have rotated or (observed on the sandbox, 2 Nov
        // 2026) briefly stopped publishing the userinfo signing key. Force one
        // fresh JWKS fetch — past the cooldown — and try again.
        try {
          await this.getJwks(discovery).reload();
          return (await verify()).payload;
        } catch (retryErr) {
          const retryCode = (retryErr as { code?: string }).code ?? "unknown";
          if (retryCode === "ERR_JWKS_NO_MATCHING_KEY" && this.env.FAYDA_USERINFO_JWKS_FALLBACK === "tls") {
            // Explicit, opt-in degraded mode (default "strict"): the claims came
            // straight from the issuer's own userinfo endpoint over TLS, in
            // answer to our access token; the caller still requires their
            // `sub` to equal the id_token's, whose signature WAS verified.
            const payload = decodeJwt(jwt);
            console.warn(
              `fayda userinfo: signing key ${decodeProtectedHeader(jwt).kid ?? "?"} not in the issuer's JWKS — accepted on TLS only (FAYDA_USERINFO_JWKS_FALLBACK=tls)`,
            );
            return payload;
          }
          console.warn(`fayda userinfo rejected after JWKS reload: ${retryCode}`);
          throw new UnauthorizedException("fayda_userinfo_invalid");
        }
      }
      console.warn(`fayda userinfo rejected: ${code}`);
      throw new UnauthorizedException("fayda_userinfo_invalid");
    }
  }

  private toProfile(sub: string, c: JWTPayload): FaydaProfile {
    const str = (key: string): string | null => {
      const value = c[key] ?? c[`${key}#en`];
      return typeof value === "string" && value.trim() ? value.trim() : null;
    };
    const legalName = str("name");
    if (!legalName) throw new UnprocessableEntityException("fayda_profile_incomplete");

    let picture: string | null = null;
    let pictureMime: string | null = null;
    const pic = str("picture");
    // Only an inline JPEG/PNG data URI is kept. A URL is never fetched — that
    // would be the server reaching wherever a claim points.
    const match = pic ? /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(pic) : null;
    if (match?.[1] && match[2] && (match[2].length * 3) / 4 <= MAX_PICTURE_BYTES) {
      picture = match[2];
      pictureMime = match[1];
    }

    return {
      sub,
      legalName,
      birthdate: str("birthdate"),
      gender: str("gender"),
      phone: str("phone_number"),
      email: str("email")?.toLowerCase() ?? null,
      address: c.address ?? null,
      nationality: str("nationality"),
      picture,
      pictureMime,
    };
  }

  private assertAdult(profile: FaydaProfile): void {
    if (!profile.birthdate) throw new UnprocessableEntityException("fayda_profile_incomplete");
    const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(profile.birthdate);
    if (!m) throw new UnprocessableEntityException("fayda_profile_incomplete");
    const born = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const now = new Date();
    const adultAt = Date.UTC(
      Number(m[1]) + this.env.KYC_MIN_AGE,
      Number(m[2]) - 1,
      Number(m[3]),
    );
    if (Number.isNaN(born) || adultAt > now.getTime()) throw new ForbiddenException("underage");
  }

  /**
   * Records the verified identity and raises the account to verified, in one
   * transaction. A Fayda identity already bound to another account is refused
   * by the unique index — one person, one account.
   */
  private async attach(userId: string, profile: FaydaProfile): Promise<void> {
    this.assertAdult(profile);
    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(authIdentities).values({
          userId,
          provider: PROVIDER,
          providerUserId: profile.sub,
          email: profile.email,
        });
        await tx.insert(identityVerifications).values({
          userId,
          provider: PROVIDER,
          subject: profile.sub,
          legalName: profile.legalName,
          birthdate: profile.birthdate,
          gender: profile.gender,
          phone: profile.phone,
          email: profile.email,
          address: profile.address ?? null,
          nationality: profile.nationality,
          picture: profile.picture ? Buffer.from(profile.picture, "base64") : null,
          pictureMime: profile.pictureMime,
        });
        await tx
          .update(users)
          .set({
            kycTier: sql`greatest(${users.kycTier}, 1)`,
            fullName: profile.legalName,
            phone: sql`coalesce(${users.phone}, ${profile.phone})`,
          })
          .where(eq(users.id, userId));
        await tx.insert(auditLogs).values({
          actorId: userId,
          actorLabel: "user:fayda",
          action: "fayda_verified",
          targetType: "user",
          targetId: userId,
          after: { provider: PROVIDER },
        });
      });
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        throw new ConflictException("fayda_linked_elsewhere");
      }
      throw err;
    }
    void this.notifications.emit(userId, "fayda_verified", { legalName: profile.legalName });
  }

  private async clientAssertion(tokenEndpoint: string): Promise<string> {
    this.signingKey ??= await importJWK(decodeJwk(this.env.FAYDA_PRIVATE_KEY), "RS256");
    // Header is exactly {alg, typ} as in the integration guide. Adding the
    // JWK's `kid` makes eSignet answer invalid_client (verified against the
    // sandbox, 2 Nov 2026): it does not look keys up by kid.
    return new SignJWT({})
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(this.env.FAYDA_CLIENT_ID)
      .setSubject(this.env.FAYDA_CLIENT_ID)
      .setAudience(tokenEndpoint)
      .setIssuedAt()
      .setExpirationTime("5m")
      .setJti(randomUUID())
      .sign(this.signingKey);
  }

  private async getDiscovery(): Promise<Discovery> {
    if (this.discovery && Date.now() - this.discovery.at < DISCOVERY_TTL_MS) {
      return this.discovery.doc;
    }
    const issuer = this.env.FAYDA_ISSUER.replace(/\/+$/, "");
    const res = await fetch(`${issuer}/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    const doc = (res?.ok ? await res.json().catch(() => null) : null) as Discovery | null;
    if (!doc?.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) {
      throw new BadGatewayException("fayda_unreachable");
    }
    // The document must describe the issuer we were configured for.
    if (doc.issuer.replace(/\/+$/, "") !== issuer) throw new BadGatewayException("fayda_issuer_mismatch");
    this.discovery = { at: Date.now(), doc };
    this.jwks = null;
    return doc;
  }

  private getJwks(discovery: Discovery): ReturnType<typeof createRemoteJWKSet> {
    this.jwks ??= createRemoteJWKSet(new URL(discovery.jwks_uri), {
      timeoutDuration: 10_000,
      cooldownDuration: 30_000,
    });
    return this.jwks;
  }
}

/** FAYDA_* keys are a base64-encoded single JWK object (not a `{keys:[…]}` set). */
function decodeJwk(b64: string): JWK {
  const parsed = JSON.parse(Buffer.from(b64.trim(), "base64").toString("utf8")) as JWK & {
    keys?: JWK[];
  };
  return parsed.keys?.[0] ?? parsed;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
