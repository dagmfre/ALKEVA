import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { eq } from "drizzle-orm";
import { Redis } from "ioredis";
import { auditLogs, identityVerifications, type Db } from "@alkeva/db";
import type { Env, TelegramHandoffStartResponse, TelegramHandoffStatus } from "@alkeva/shared";
import { DB, ENV, REDIS } from "../core/core.module.js";
import type { AccessPayload } from "../auth/auth.service.js";
import { faydaHandoffKey, FaydaService } from "../auth/fayda.service.js";
import type { ClientContext } from "../auth/sessions.service.js";

/** The ticket only has to survive the hop into the phone's browser. */
const TICKET_TTL_SEC = 120;
/** The handoff as a whole: the Fayda round trip plus the owner's confirm. */
const HANDOFF_TTL_SEC = 15 * 60;

interface TicketRecord {
  id: string;
  userId: string;
  purpose: "fayda_link";
}

interface HandoffRecord {
  userId: string;
  sid: string | null;
  purpose: "fayda_link";
  state: "waiting" | "started" | "done";
}

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/**
 * Mini App → the phone's browser, for flows that cannot run inside Telegram's
 * webview (eSignet refuses to be framed; OIDC providers refuse embedded
 * webviews). The browser is given NOTHING that works as an ALKEVA session:
 *
 *  1. The Mini App (a Telegram session) asks for a handoff. A 256-bit ticket
 *     is minted; only its sha256 is stored, for 120 s, single-use.
 *  2. The Mini App opens https://<site>/handoff#t=<ticket> with openLink —
 *     the ticket rides the URL FRAGMENT, which browsers never send to a
 *     server, so it cannot land in an access log or a Referer.
 *  3. That page POSTs the ticket; `consume` GETDELs it and can do exactly one
 *     thing: start the Fayda flow bound to the ticket's user, with a browser
 *     binding cookie. No access or refresh token is ever issued here.
 *  4. Fayda's verified result is PARKED (FaydaService "link_handoff"); the
 *     owner confirms it back inside the Mini App, signed in as the same user.
 *
 * A leaked ticket therefore buys an attacker one Fayda round trip whose result
 * nobody can commit.
 */
@Injectable()
export class TelegramHandoffService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly fayda: FaydaService,
  ) {}

  async create(auth: AccessPayload, purpose: "fayda_link"): Promise<TelegramHandoffStartResponse> {
    if (!(auth.amr ?? []).includes("telegram")) {
      // The website runs Fayda in place; a handoff exists only for the Mini App.
      throw new ForbiddenException("handoff_telegram_only");
    }
    if (!this.fayda.verificationEnabled) throw new ServiceUnavailableException("fayda_unconfigured");
    const verified = await this.db
      .select({ id: identityVerifications.id })
      .from(identityVerifications)
      .where(eq(identityVerifications.userId, auth.sub))
      .limit(1);
    if (verified.length > 0) throw new ConflictException("fayda_already_verified");

    const id = randomUUID();
    const ticket = randomBytes(32).toString("base64url");
    const ticketRec: TicketRecord = { id, userId: auth.sub, purpose };
    const handoff: HandoffRecord = { userId: auth.sub, sid: auth.sid ?? null, purpose, state: "waiting" };
    await this.redis
      .multi()
      .set(`tg:handoff:ticket:${sha256(ticket)}`, JSON.stringify(ticketRec), "EX", TICKET_TTL_SEC)
      .set(`tg:handoff:${id}`, JSON.stringify(handoff), "EX", HANDOFF_TTL_SEC)
      .exec();
    return {
      id,
      url: `${this.env.WEB_ORIGIN}/handoff#t=${ticket}`,
      expiresAt: new Date(Date.now() + TICKET_TTL_SEC * 1000).toISOString(),
    };
  }

  /** The browser leg. Returns the Fayda authorize URL + the binding for its cookie. */
  async consume(ticket: string, ctx: ClientContext): Promise<{ url: string; binding: string }> {
    const raw = await this.redis.getdel(`tg:handoff:ticket:${sha256(ticket)}`);
    if (!raw) throw new UnauthorizedException("handoff_invalid");
    const rec = JSON.parse(raw) as TicketRecord;
    const handoff = await this.read(rec.id);
    if (!handoff || handoff.userId !== rec.userId || handoff.state !== "waiting") {
      throw new UnauthorizedException("handoff_invalid");
    }
    await this.write(rec.id, { ...handoff, state: "started" });
    await this.db.insert(auditLogs).values({
      actorId: rec.userId,
      actorLabel: "telegram:handoff",
      action: "telegram_handoff_consumed",
      targetType: "user",
      targetId: rec.userId,
      after: { purpose: rec.purpose, ip: ctx.ip, userAgent: ctx.userAgent?.slice(0, 200) ?? null },
      ip: ctx.ip,
    });
    return this.fayda.start("link_handoff", rec.userId, rec.id);
  }

  async status(auth: AccessPayload, id: string): Promise<TelegramHandoffStatus> {
    const handoff = await this.read(id);
    if (!handoff) return { status: "expired" };
    if (handoff.userId !== auth.sub) throw new NotFoundException("handoff_not_found");
    if (handoff.state === "done") return { status: "done" };
    const parked = await this.fayda.peekHandoff(id, auth.sub);
    if (parked) return { status: "awaiting_confirmation", ...parked };
    return { status: "waiting" };
  }

  async confirm(auth: AccessPayload, id: string): Promise<TelegramHandoffStatus> {
    const handoff = await this.read(id);
    if (!handoff || handoff.userId !== auth.sub) throw new NotFoundException("handoff_not_found");
    if (!(auth.amr ?? []).includes("telegram")) throw new ForbiddenException("handoff_telegram_only");
    const committed = await this.fayda.commitHandoff(id, auth.sub);
    if (!committed) return { status: "expired" };
    await this.write(id, { ...handoff, state: "done" });
    await this.db.insert(auditLogs).values({
      actorId: auth.sub,
      actorLabel: `user:${auth.sub}`,
      action: "telegram_handoff_committed",
      targetType: "user",
      targetId: auth.sub,
      after: { purpose: handoff.purpose },
    });
    return { status: "done" };
  }

  /** Discard a parked result the owner does not recognise. */
  async discard(auth: AccessPayload, id: string): Promise<TelegramHandoffStatus> {
    const handoff = await this.read(id);
    if (!handoff || handoff.userId !== auth.sub) throw new NotFoundException("handoff_not_found");
    await this.redis.del(`tg:handoff:${id}`, faydaHandoffKey(id));
    await this.db.insert(auditLogs).values({
      actorId: auth.sub,
      actorLabel: `user:${auth.sub}`,
      action: "telegram_handoff_discarded",
      targetType: "user",
      targetId: auth.sub,
      after: { purpose: handoff.purpose },
    });
    return { status: "expired" };
  }

  private async read(id: string): Promise<HandoffRecord | null> {
    const raw = await this.redis.get(`tg:handoff:${id}`);
    return raw ? (JSON.parse(raw) as HandoffRecord) : null;
  }

  private async write(id: string, rec: HandoffRecord): Promise<void> {
    await this.redis.set(`tg:handoff:${id}`, JSON.stringify(rec), "KEEPTTL");
  }
}
