import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { Redis } from "ioredis";
import { auditLogs, authIdentities, authSessions, telegramChats, users, type Db } from "@alkeva/db";
import {
  LOCALES,
  type Env,
  type Locale,
  type MeResponse,
  type TelegramIdentitySummary,
  type TelegramLinkStartResponse,
  type TelegramLinkStatusResponse,
  type TelegramPasswordLinkDto,
  type TelegramGoogleApproveDto,
  type TelegramGoogleFlowDto,
  type TelegramGoogleStartDto,
  type TelegramGoogleStartResponse,
  type TelegramGoogleStatus,
  type TelegramSessionResponse,
  type TelegramSignupDto,
  type TelegramTokens,
} from "@alkeva/shared";
import { DB, ENV, REDIS } from "../core/core.module.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { assertNotTelegramSession } from "../auth/auth.guard.js";
import { AuthService, type AccessPayload } from "../auth/auth.service.js";
import { EmailCodesService } from "../auth/email-codes.service.js";
import { GoogleAuthService, safeEqual, telegramGoogleFlowKey, type TelegramGoogleFlow } from "../auth/google.service.js";
import { isTelegramAmr, SessionsService, type ClientContext, type TokenPair } from "../auth/sessions.service.js";
import { InitDataError, telegramDisplay, verifyInitData, type TelegramWebAppUser, type VerifiedInitData } from "./init-data.js";

/** What a pending (not yet attached) Telegram identity carries. */
interface PendingTelegram {
  tgUserId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  languageCode: string | null;
  allowsWrite: boolean;
}

/** A Telegram account parked against a website-started link, awaiting the owner. */
interface PendingWebLink extends PendingTelegram {
  claimSha: string;
  claimedAt: number;
}

interface ClaimState {
  userId: string;
  tgUserId: string;
  state: "waiting" | "confirmed" | "rejected";
}

/** How recent the website sign-in must be to confirm a link. */
const FRESH_AUTH_SEC = 10 * 60;
const PENDING_TTL_SEC = 10 * 60;
const WEBLINK_TTL_SEC = 10 * 60;
/** The Google ticket only has to survive the hop into the phone's browser. */
const GOOGLE_TICKET_TTL_SEC = 120;

interface GoogleTicket {
  flowId: string;
  intent: "login" | "register";
  locale: Locale;
}

const googleTicketKey = (ticket: string) => `tg:google:ticket:${createHash("sha256").update(ticket).digest("hex")}`;

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const token = () => randomBytes(32).toString("base64url");

/**
 * Telegram Mini App sign-in (Phase 11).
 *
 * Proofs, and what each is allowed to establish:
 *  - initData (verified HMAC, fresh, single-use) proves WHICH TELEGRAM ACCOUNT
 *    opened the Mini App — and nothing about any ALKEVA account.
 *  - An existing auth_identity row (provider 'telegram') is the only thing
 *    that turns a Telegram account into an ALKEVA session.
 *  - That row is written in exactly three places, each needing a second,
 *    independent proof of the ALKEVA side: a brand-new signup (there is no
 *    other side yet), the account's password typed in the same request, or the
 *    owner confirming on the website with a fresh sign-in. A token alone —
 *    leaked link, leaked pending token — never links anything.
 *
 * Staff never get a Telegram session: refused at sign-in and at every link
 * path, and RolesGuard refuses any session whose amr includes "telegram".
 */
@Injectable()
export class TelegramAuthService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly codes: EmailCodesService,
    private readonly notifications: NotificationsService,
    private readonly google: GoogleAuthService,
  ) {}

  /** Listed in AUTH_METHODS and fully configured. */
  get enabled(): boolean {
    const e = this.env;
    return (
      e.AUTH_METHODS.includes("telegram") &&
      !!e.TELEGRAM_BOT_TOKEN &&
      !!e.TELEGRAM_BOT_USERNAME &&
      !!e.TELEGRAM_MINIAPP_SHORT_NAME &&
      !!e.TELEGRAM_WEBAPP_ORIGIN
    );
  }

  assertEnabled(): void {
    if (!this.enabled) throw new ServiceUnavailableException("telegram_unconfigured");
  }

  /** https://t.me/<bot>/<app>?startapp=<param> — the only way back into the Mini App. */
  miniAppLink(startParam?: string): string {
    const base = `https://t.me/${this.env.TELEGRAM_BOT_USERNAME}/${this.env.TELEGRAM_MINIAPP_SHORT_NAME}`;
    return startParam ? `${base}?startapp=${encodeURIComponent(startParam)}` : base;
  }

  // ── initData ─────────────────────────────────────────────────────

  /**
   * Verify + consume. initData is a bearer credential that sits in the Mini
   * App's URL fragment; it is accepted once, and only while fresh. A second
   * presentation of the same launch is refused and audited.
   */
  async consumeInitData(raw: string, ctx: ClientContext): Promise<VerifiedInitData> {
    this.assertEnabled();
    let verified: VerifiedInitData;
    try {
      verified = verifyInitData(raw, this.env.TELEGRAM_BOT_TOKEN, {
        maxAgeSec: this.env.TELEGRAM_INITDATA_MAX_AGE_SEC,
      });
    } catch (err) {
      if (err instanceof InitDataError) throw new UnauthorizedException(err.code);
      throw err;
    }
    const fresh = await this.redis.set(
      `tg:init:${sha256(verified.hash)}`,
      "1",
      "EX",
      this.env.TELEGRAM_INITDATA_MAX_AGE_SEC + 120,
      "NX",
    );
    if (fresh !== "OK") {
      await this.audit(null, "telegram_initdata_replay", String(verified.user.id), {
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      throw new UnauthorizedException("telegram_init_replayed");
    }
    return verified;
  }

  // ── sign in ──────────────────────────────────────────────────────

  async session(rawInitData: string, ctx: ClientContext): Promise<TelegramSessionResponse> {
    const init = await this.consumeInitData(rawInitData, ctx);
    const linked = await this.findLinkedUser(init.user.id);
    if (linked) {
      if (linked.role !== "user") throw new ForbiddenException("telegram_staff_refused");
      await this.refreshChat(linked.id, init.user);
      const { user, tokens } = await this.auth.issueSessionFor(linked.id, ["telegram"], ctx, {
        ttlSec: this.env.TELEGRAM_SESSION_TTL_SEC,
      });
      return { status: "signed_in", user, tokens: this.wire(tokens) };
    }

    const pendingToken = token();
    const pending: PendingTelegram = toPending(init.user);
    await this.redis.set(
      `tg:pending:${sha256(pendingToken)}`,
      JSON.stringify(pending),
      "EX",
      PENDING_TTL_SEC,
    );
    return {
      status: "needs_account",
      pendingToken,
      telegram: summary(pending),
      signupEnabled: this.env.TELEGRAM_SIGNUP_ENABLED,
    };
  }

  /** A brand-new ALKEVA account owned by this Telegram account. */
  async signup(dto: TelegramSignupDto, ctx: ClientContext): Promise<TelegramSessionResponse> {
    this.assertEnabled();
    if (!this.env.TELEGRAM_SIGNUP_ENABLED) throw new ForbiddenException("telegram_signup_disabled");
    const pending = await this.readPending(dto.pendingToken);
    const email = dto.email.trim().toLowerCase();

    const taken = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(sql`lower(${users.email})`, email))
      .limit(1);
    // Never auto-link by email (same rule as Fayda): an address proves nothing
    // about who holds the account that already uses it.
    if (taken.length > 0) throw new ConflictException("email_taken_link_instead");

    let userId: string;
    try {
      userId = await this.db.transaction(async (tx) => {
        const inserted = await tx
          .insert(users)
          .values({
            email,
            passwordHash: null,
            fullName: dto.fullName,
            locale: dto.locale,
            // The DTO's z.literal(true) already refused an unchecked box.
            termsAcceptedAt: new Date(),
          })
          .returning({ id: users.id });
        const id = inserted[0]!.id;
        await this.insertLink(tx, id, pending);
        await tx.insert(auditLogs).values({
          actorId: id,
          actorLabel: `user:${id}`,
          action: "telegram_signup",
          targetType: "user",
          targetId: id,
          after: { telegram: summary(pending).display },
          ip: ctx.ip,
        });
        return id;
      });
    } catch (err) {
      throw mapUniqueViolation(err);
    }
    await this.redis.del(`tg:pending:${sha256(dto.pendingToken)}`);

    await this.codes.issue(userId, "verify_email").catch((err) => {
      console.error(`verification code send failed for ${userId}:`, err);
    });
    const { user, tokens } = await this.auth.issueSessionFor(userId, ["telegram"], ctx, {
      ttlSec: this.env.TELEGRAM_SESSION_TTL_SEC,
    });
    return { status: "signed_in", user, tokens: this.wire(tokens) };
  }

  /** Link path (a): the account's password proves the ALKEVA side, in this request. */
  async linkWithPassword(
    dto: TelegramPasswordLinkDto,
    ctx: ClientContext,
  ): Promise<TelegramSessionResponse> {
    this.assertEnabled();
    const pending = await this.readPending(dto.pendingToken);
    // Lockout + uniform errors live in verifyPassword — same as /auth/login.
    const account = await this.auth.verifyPassword({ email: dto.email, password: dto.password });
    if (account.role !== "user") throw new ForbiddenException("telegram_staff_refused");

    await this.commitLink(account.id, pending, "password", ctx);
    await this.redis.del(`tg:pending:${sha256(dto.pendingToken)}`);
    const { user, tokens } = await this.auth.issueSessionFor(account.id, ["telegram"], ctx, {
      ttlSec: this.env.TELEGRAM_SESSION_TTL_SEC,
    });
    return { status: "signed_in", user, tokens: this.wire(tokens) };
  }

  // -- Google, run in the phone's browser ---------------------------
  //
  // Proofs: the pending token (from fresh initData) proves the Telegram side;
  // a verified Google id_token proves the ALKEVA side. They are bound by a
  // flow id that only this Mini App's pending token can read or confirm. The
  // ticket that starts the browser leg rides a URL fragment, lasts 120 s and
  // works once; the browser leg itself never receives an ALKEVA session.
  //
  // The decisive click belongs to the GOOGLE side: after Google, that browser
  // is shown which Telegram account asked and must approve it (one-time token
  // returned only to it). A confirm on the Telegram side would let whoever
  // sends a victim the handoff link take over the victim's account with one
  // click in Google's account chooser (security review, 8 Nov 2026).

  async googleStart(dto: TelegramGoogleStartDto): Promise<TelegramGoogleStartResponse> {
    this.assertEnabled();
    if (!this.google.configured) throw new ServiceUnavailableException("auth_google_unconfigured");
    const pending = await this.readPending(dto.pendingToken);
    if (dto.intent === "register") {
      if (!this.env.TELEGRAM_SIGNUP_ENABLED) throw new ForbiddenException("telegram_signup_disabled");
      // A new account needs the terms accepted here, before Google.
      if (dto.acceptTerms !== true) throw new BadRequestException("terms_required");
    }
    const flowId = randomUUID();
    const ticket = token();
    const rec: GoogleTicket = { flowId, intent: dto.intent, locale: dto.locale };
    const flow: TelegramGoogleFlow = {
      pendingSha: sha256(dto.pendingToken),
      telegram: summary(pending).display,
      state: "waiting",
    };
    await this.redis
      .multi()
      .set(googleTicketKey(ticket), JSON.stringify(rec), "EX", GOOGLE_TICKET_TTL_SEC)
      .set(telegramGoogleFlowKey(flowId), JSON.stringify(flow), "EX", PENDING_TTL_SEC)
      .exec();
    return {
      flowId,
      url: `${this.env.WEB_ORIGIN}/handoff#g=${ticket}`,
      expiresAt: new Date(Date.now() + GOOGLE_TICKET_TTL_SEC * 1000).toISOString(),
    };
  }

  /** The browser leg: spend the ticket, get Google's consent URL (+ the binding for its cookie). */
  async googleConsume(ticket: string, ctx: ClientContext): Promise<{ url: string; binding: string }> {
    this.assertEnabled();
    const raw = await this.redis.getdel(googleTicketKey(ticket));
    if (!raw) throw new UnauthorizedException("handoff_invalid");
    const rec = JSON.parse(raw) as GoogleTicket;
    const key = telegramGoogleFlowKey(rec.flowId);
    const flowRaw = await this.redis.get(key);
    const flow = flowRaw ? (JSON.parse(flowRaw) as TelegramGoogleFlow) : null;
    if (!flow || flow.state !== "waiting") throw new UnauthorizedException("handoff_invalid");
    await this.redis.set(key, JSON.stringify({ ...flow, state: "started" }), "KEEPTTL");
    await this.audit(null, "telegram_google_started", rec.flowId, {
      intent: rec.intent,
      ip: ctx.ip,
      userAgent: ctx.userAgent?.slice(0, 200) ?? null,
    });
    return this.google.startUrl(rec.intent, rec.locale, rec.flowId);
  }

  /**
   * The browser that completed Google approves (or refuses) the Telegram
   * account that asked. Public: the one-time token, returned only to that
   * browser by the Google callback, is the authorisation.
   */
  async googleApprove(dto: TelegramGoogleApproveDto, ctx: ClientContext): Promise<{ status: "approved" | "declined" }> {
    this.assertEnabled();
    const key = telegramGoogleFlowKey(dto.flowId);
    const raw = await this.redis.get(key);
    const flow = raw ? (JSON.parse(raw) as TelegramGoogleFlow) : null;
    if (!flow || flow.state !== "verified" || !flow.approveSha || !flow.userId || !safeEqual(sha256(dto.token), flow.approveSha)) {
      throw new UnauthorizedException("telegram_google_expired");
    }
    const approved = dto.decision === "approve";
    const next: TelegramGoogleFlow = approved
      ? { ...flow, state: "done", approveSha: undefined }
      : { ...flow, state: "failed", code: "google_declined", approveSha: undefined, userId: undefined };
    await this.redis.set(key, JSON.stringify(next), "KEEPTTL");
    await this.audit(flow.userId, approved ? "telegram_google_approved" : "telegram_google_declined", flow.userId, {
      telegram: flow.telegram,
      ip: ctx.ip,
      userAgent: ctx.userAgent?.slice(0, 200) ?? null,
    });
    return { status: approved ? "approved" : "declined" };
  }

  /** Mini App polling. Another Mini App's pending token learns nothing ("expired"). */
  async googleStatus(dto: TelegramGoogleFlowDto): Promise<TelegramGoogleStatus> {
    this.assertEnabled();
    const raw = await this.redis.get(telegramGoogleFlowKey(dto.flowId));
    const flow = raw ? (JSON.parse(raw) as TelegramGoogleFlow) : null;
    if (!flow || flow.pendingSha !== sha256(dto.pendingToken)) return { status: "expired" };
    if (flow.state === "failed") return { status: "failed", code: flow.code ?? "google_failed" };
    if (flow.state === "done" && flow.userId) {
      const user = await this.mustGetUser(flow.userId);
      return { status: "ready", account: maskEmail(user.email) };
    }
    return { status: "waiting" };
  }

  /** The decisive step: the person confirmed the account inside the Mini App. */
  async googleConfirm(dto: TelegramGoogleFlowDto, ctx: ClientContext): Promise<TelegramSessionResponse> {
    this.assertEnabled();
    const pending = await this.readPending(dto.pendingToken);
    const key = telegramGoogleFlowKey(dto.flowId);
    const raw = await this.redis.get(key);
    const flow = raw ? (JSON.parse(raw) as TelegramGoogleFlow) : null;
    if (!flow || flow.pendingSha !== sha256(dto.pendingToken) || flow.state !== "done" || !flow.userId) {
      throw new UnauthorizedException("telegram_google_expired");
    }
    // Single use: of two racing confirms, only the one that deletes it goes on.
    if ((await this.redis.del(key)) !== 1) throw new UnauthorizedException("telegram_google_expired");

    const account = await this.mustGetUser(flow.userId);
    if (account.role !== "user") throw new ForbiddenException("telegram_staff_refused");
    await this.commitLink(account.id, pending, "google", ctx);
    await this.redis.del(`tg:pending:${sha256(dto.pendingToken)}`);
    const { user, tokens } = await this.auth.issueSessionFor(account.id, ["telegram"], ctx, {
      ttlSec: this.env.TELEGRAM_SESSION_TTL_SEC,
    });
    return { status: "signed_in", user, tokens: this.wire(tokens) };
  }

  /** The person does not recognise the account Google returned: forget it. */
  async googleCancel(dto: TelegramGoogleFlowDto): Promise<{ ok: true }> {
    const key = telegramGoogleFlowKey(dto.flowId);
    const raw = await this.redis.get(key);
    const flow = raw ? (JSON.parse(raw) as TelegramGoogleFlow) : null;
    if (flow && flow.pendingSha === sha256(dto.pendingToken)) await this.redis.del(key);
    return { ok: true };
  }

  // ── link path (b): started and confirmed on the website ──────────

  /** Website, signed in: a one-time link into the Mini App. */
  async startWebLink(auth: AccessPayload): Promise<TelegramLinkStartResponse> {
    this.assertEnabled();
    assertWebSession(auth);
    const user = await this.mustGetUser(auth.sub);
    if (user.role !== "user") throw new ForbiddenException("telegram_staff_refused");
    if (await this.findLinkOf(user.id)) throw new ConflictException("account_has_telegram");

    const linkToken = token();
    const sha = sha256(linkToken);
    // One live link token per account: a new one retires the last.
    const prior = await this.redis.get(`tg:weblink:user:${user.id}`);
    const pipeline = this.redis.multi();
    if (prior) pipeline.del(`tg:weblink:${prior}`);
    pipeline.set(`tg:weblink:${sha}`, JSON.stringify({ userId: user.id }), "EX", WEBLINK_TTL_SEC);
    pipeline.set(`tg:weblink:user:${user.id}`, sha, "EX", WEBLINK_TTL_SEC);
    await pipeline.exec();

    return {
      url: this.miniAppLink(`link-${linkToken}`),
      expiresAt: new Date(Date.now() + WEBLINK_TTL_SEC * 1000).toISOString(),
    };
  }

  /**
   * Mini App, opened from that link: parks this Telegram account against the
   * account that made the link. Nothing is linked until the owner confirms on
   * the website. Returns a claim token the Mini App polls with.
   */
  async claimWebLink(
    rawInitData: string,
    linkToken: string,
    ctx: ClientContext,
  ): Promise<{ claimToken: string; account: string }> {
    const init = await this.consumeInitData(rawInitData, ctx);
    const sha = sha256(linkToken);
    // GETDEL: the link token is single-use whatever happens next.
    const raw = await this.redis.getdel(`tg:weblink:${sha}`);
    if (!raw) throw new UnauthorizedException("telegram_link_expired");
    const { userId } = JSON.parse(raw) as { userId: string };
    await this.redis.del(`tg:weblink:user:${userId}`);

    const already = await this.findLinkedUser(init.user.id);
    if (already) {
      throw new ConflictException(
        already.id === userId ? "telegram_already_linked" : "telegram_linked_elsewhere",
      );
    }
    const user = await this.mustGetUser(userId);
    if (user.role !== "user") throw new ForbiddenException("telegram_staff_refused");

    const claimToken = token();
    const claimSha = sha256(claimToken);
    const parked: PendingWebLink = { ...toPending(init.user), claimSha, claimedAt: Date.now() };
    const claim: ClaimState = { userId, tgUserId: parked.tgUserId, state: "waiting" };
    // A second claim replaces the first: only the latest Telegram account waits.
    const previous = await this.redis.get(`tg:weblink:pending:${userId}`);
    const pipeline = this.redis.multi();
    if (previous) {
      const prev = JSON.parse(previous) as PendingWebLink;
      pipeline.del(`tg:claim:${prev.claimSha}`);
    }
    pipeline.set(`tg:weblink:pending:${userId}`, JSON.stringify(parked), "EX", PENDING_TTL_SEC);
    pipeline.set(`tg:claim:${claimSha}`, JSON.stringify(claim), "EX", PENDING_TTL_SEC);
    await pipeline.exec();

    await this.audit(userId, "telegram_link_claimed", userId, {
      telegram: summary(parked).display,
      ip: ctx.ip,
    });
    return { claimToken, account: maskEmail(user.email) };
  }

  /** Mini App polls: once the owner confirmed on the website, this mints the session (once). */
  async claimStatus(
    claimToken: string,
    ctx: ClientContext,
  ): Promise<{ status: "waiting" | "rejected" | "expired" } | TelegramSessionResponse> {
    this.assertEnabled();
    const key = `tg:claim:${sha256(claimToken)}`;
    const raw = await this.redis.get(key);
    if (!raw) return { status: "expired" };
    const claim = JSON.parse(raw) as ClaimState;
    if (claim.state === "waiting") return { status: "waiting" };
    // Consume: a confirmed claim yields exactly one session.
    if ((await this.redis.del(key)) !== 1) return { status: "expired" };
    if (claim.state === "rejected") return { status: "rejected" };

    // The database, not the claim, is the authority on who this Telegram account opens.
    const linked = await this.findLinkedUser(Number(claim.tgUserId));
    if (!linked || linked.id !== claim.userId) return { status: "expired" };
    if (linked.role !== "user") throw new ForbiddenException("telegram_staff_refused");
    const { user, tokens } = await this.auth.issueSessionFor(linked.id, ["telegram"], ctx, {
      ttlSec: this.env.TELEGRAM_SESSION_TTL_SEC,
    });
    return { status: "signed_in", user, tokens: this.wire(tokens) };
  }

  /** Website: confirm (fresh sign-in required) or reject the parked Telegram account. */
  async decideWebLink(
    auth: AccessPayload,
    decision: "confirm" | "reject",
    ctx: ClientContext,
  ): Promise<TelegramLinkStatusResponse> {
    this.assertEnabled();
    assertWebSession(auth);
    if (decision === "confirm") assertFreshAuth(auth);
    const raw = await this.redis.getdel(`tg:weblink:pending:${auth.sub}`);
    if (!raw) throw new NotFoundException("telegram_link_pending_missing");
    const parked = JSON.parse(raw) as PendingWebLink;
    const claimKey = `tg:claim:${parked.claimSha}`;

    if (decision === "reject") {
      await this.setClaimState(claimKey, "rejected");
      await this.audit(auth.sub, "telegram_link_rejected", auth.sub, {
        telegram: summary(parked).display,
      });
      return this.status(auth.sub);
    }

    await this.commitLink(auth.sub, parked, "web_confirm", ctx);
    await this.setClaimState(claimKey, "confirmed");
    return this.status(auth.sub);
  }

  async status(userId: string): Promise<TelegramLinkStatusResponse> {
    const link = await this.findLinkOf(userId);
    const pendingRaw = link ? null : await this.redis.get(`tg:weblink:pending:${userId}`);
    const pending = pendingRaw ? summary(JSON.parse(pendingRaw) as PendingWebLink) : null;
    return {
      linked: link ? summary({ username: link.username, firstName: link.firstName }) : null,
      canMessage: !!link && link.canMessage && !link.blockedAt,
      pending,
      available: this.enabled,
      botUsername: this.enabled ? this.env.TELEGRAM_BOT_USERNAME : null,
    };
  }

  /**
   * The person granted the bot write access from inside the Mini App
   * (requestWriteAccess). Only their own linked chat changes, and the worst a
   * false claim can do is have the bot try to message its own sender — a
   * refusal from Telegram then marks the chat blocked.
   */
  async enableMessages(auth: AccessPayload): Promise<TelegramLinkStatusResponse> {
    if (!isTelegramAmr(auth.amr)) throw new ForbiddenException("telegram_session_required");
    await this.db
      .update(telegramChats)
      .set({ canMessage: true, blockedAt: null, updatedAt: sql`now()` })
      .where(eq(telegramChats.userId, auth.sub));
    return this.status(auth.sub);
  }

  // ── refresh / unlink ─────────────────────────────────────────────

  async refresh(
    refreshToken: string,
    ctx: ClientContext,
  ): Promise<{ user: MeResponse; tokens: TelegramTokens }> {
    this.assertEnabled();
    const { userId, tokens } = await this.sessions.rotate(refreshToken, ctx, "telegram");
    // A racing rotation of the same token: the Mini App is one tab, so this is
    // only ever a double-fired refresh. Tell it to re-read its stored token.
    if (!tokens) throw new ConflictException("refresh_raced");
    const user = await this.auth.me(userId);
    if (user.role !== "user") {
      await this.sessions.revokeAllForUser(userId, "telegram_staff_refused");
      throw new ForbiddenException("telegram_staff_refused");
    }
    return { user, tokens: this.wire(tokens) };
  }

  /**
   * Disconnect Telegram: the identity and chat rows go, every session opened
   * through Telegram is revoked at once (live access tokens included), and
   * the owner is emailed. Callable from the website, the Mini App, and the
   * bot's /unlink — all of them protective.
   */
  async unlink(userId: string, via: "web" | "miniapp" | "bot"): Promise<{ unlinked: boolean }> {
    const link = await this.findLinkOf(userId);
    if (!link) return { unlinked: false };
    const display = summary({ username: link.username, firstName: link.firstName }).display;
    await this.db.transaction(async (tx) => {
      await tx
        .delete(authIdentities)
        .where(and(eq(authIdentities.userId, userId), eq(authIdentities.provider, "telegram")));
      await tx.delete(telegramChats).where(eq(telegramChats.userId, userId));
      await tx.insert(auditLogs).values({
        actorId: userId,
        actorLabel: via === "bot" ? "telegram:bot" : `user:${userId}`,
        action: "telegram_unlinked",
        targetType: "user",
        targetId: userId,
        before: { telegram: display },
        after: { via },
      });
    });
    await this.revokeTelegramSessions(userId, "telegram_unlinked");
    void this.notifications.emit(userId, "telegram_unlinked", { telegram: display });
    return { unlinked: true };
  }

  /** Every live session that was opened through Telegram, for one user. */
  async revokeTelegramSessions(userId: string, reason: string): Promise<number> {
    const live = await this.db
      .select({ id: authSessions.id, amr: authSessions.amr })
      .from(authSessions)
      .where(and(eq(authSessions.userId, userId), sql`${authSessions.revokedAt} IS NULL`));
    let n = 0;
    for (const s of live) {
      if (isTelegramAmr(s.amr)) {
        await this.sessions.revoke(s.id, reason);
        n++;
      }
    }
    return n;
  }

  /** The user the bot is talking to, if their Telegram account is linked. */
  async findLinkedUser(tgUserId: number): Promise<typeof users.$inferSelect | null> {
    const rows = await this.db
      .select({ user: users })
      .from(authIdentities)
      .innerJoin(users, eq(authIdentities.userId, users.id))
      .where(
        and(eq(authIdentities.provider, "telegram"), eq(authIdentities.providerUserId, String(tgUserId))),
      )
      .limit(1);
    return rows[0]?.user ?? null;
  }

  // ── internals ────────────────────────────────────────────────────

  private async commitLink(
    userId: string,
    pending: PendingTelegram,
    via: "password" | "web_confirm" | "google",
    ctx: ClientContext,
  ): Promise<void> {
    if (await this.findLinkOf(userId)) throw new ConflictException("account_has_telegram");
    try {
      await this.db.transaction(async (tx) => {
        await this.insertLink(tx, userId, pending);
        await tx.insert(auditLogs).values({
          actorId: userId,
          actorLabel: `user:${userId}`,
          action: "telegram_linked",
          targetType: "user",
          targetId: userId,
          after: { telegram: summary(pending).display, via },
          ip: ctx.ip,
        });
      });
    } catch (err) {
      throw mapUniqueViolation(err);
    }
    // Security category: always emailed, cannot be switched off.
    void this.notifications.emit(userId, "telegram_linked", { telegram: summary(pending).display });
  }

  private async insertLink(
    tx: Parameters<Parameters<Db["transaction"]>[0]>[0],
    userId: string,
    pending: PendingTelegram,
  ): Promise<void> {
    await tx.insert(authIdentities).values({
      userId,
      provider: "telegram",
      providerUserId: pending.tgUserId,
      email: null,
    });
    await tx.insert(telegramChats).values({
      userId,
      tgUserId: BigInt(pending.tgUserId),
      username: pending.username,
      firstName: pending.firstName,
      canMessage: pending.allowsWrite,
    });
  }

  /** Keep the display name current; a fresh allows_write_to_pm re-enables delivery. */
  private async refreshChat(userId: string, u: TelegramWebAppUser): Promise<void> {
    await this.db
      .update(telegramChats)
      .set({
        username: u.username ?? null,
        firstName: u.first_name,
        ...(u.allows_write_to_pm ? { canMessage: true, blockedAt: null } : {}),
        updatedAt: sql`now()`,
      })
      .where(eq(telegramChats.userId, userId));
  }

  private async readPending(pendingToken: string): Promise<PendingTelegram> {
    const raw = await this.redis.get(`tg:pending:${sha256(pendingToken)}`);
    if (!raw) throw new UnauthorizedException("telegram_pending_expired");
    return JSON.parse(raw) as PendingTelegram;
  }

  private async findLinkOf(userId: string) {
    const rows = await this.db
      .select()
      .from(telegramChats)
      .where(eq(telegramChats.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  }

  private async mustGetUser(userId: string) {
    const rows = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!rows[0]) throw new NotFoundException("user_not_found");
    return rows[0];
  }

  private async setClaimState(key: string, state: ClaimState["state"]): Promise<void> {
    const raw = await this.redis.get(key);
    if (!raw) return;
    const claim = JSON.parse(raw) as ClaimState;
    await this.redis.set(key, JSON.stringify({ ...claim, state }), "EX", PENDING_TTL_SEC);
  }

  private wire(tokens: TokenPair): TelegramTokens {
    return { ...tokens, expiresIn: this.env.ACCESS_TOKEN_TTL_SEC };
  }

  private async audit(
    actorId: string | null,
    action: string,
    targetId: string,
    after: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(auditLogs).values({
      actorId,
      actorLabel: actorId ? `user:${actorId}` : "system:telegram",
      action,
      targetType: actorId ? "user" : "telegram_user",
      targetId,
      after,
    });
  }
}

// ── helpers ─────────────────────────────────────────────────────────

function toPending(u: TelegramWebAppUser): PendingTelegram {
  return {
    tgUserId: String(u.id),
    username: u.username ?? null,
    firstName: u.first_name || null,
    lastName: u.last_name ?? null,
    languageCode: u.language_code ?? null,
    allowsWrite: u.allows_write_to_pm === true,
  };
}

function summary(p: { username: string | null; firstName: string | null }): TelegramIdentitySummary {
  return {
    display: telegramDisplay({ username: p.username, firstName: p.firstName }),
    username: p.username,
    firstName: p.firstName,
  };
}

/** Website-only operations refuse a Telegram session (no self-escalation from Telegram). */
const assertWebSession = assertNotTelegramSession;

function assertFreshAuth(auth: AccessPayload): void {
  const at = auth.auth_time ?? 0;
  if (Date.now() / 1000 - at > FRESH_AUTH_SEC) throw new ForbiddenException("reauth_required");
}

/** d***@gmail.com — enough for the owner to recognise, useless to anyone else. */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

/** A Telegram locale hint → one of ours (am default). */
export function localeFromTelegram(code: string | null | undefined): Locale {
  const base = (code ?? "").split("-")[0]?.toLowerCase();
  return (LOCALES as readonly string[]).includes(base ?? "") ? (base as Locale) : "am";
}

/** Unique-index races → the same machine codes the pre-checks use. */
function mapUniqueViolation(err: unknown): unknown {
  type PgErr = { code?: string; constraint_name?: string; cause?: PgErr };
  const e = err as PgErr;
  const pg = e?.code === "23505" ? e : e?.cause?.code === "23505" ? e.cause : null;
  if (!pg) return err;
  const c = pg.constraint_name ?? "";
  if (c.startsWith("user_email")) return new ConflictException("email_taken_link_instead");
  if (c.startsWith("telegram_chat_pkey")) return new ConflictException("account_has_telegram");
  return new ConflictException("telegram_linked_elsewhere");
}
