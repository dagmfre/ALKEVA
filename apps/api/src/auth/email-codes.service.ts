import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { emailCodes, users, type Db } from "@alkeva/db";
import { emailLocaleFor, renderNotification, type Env } from "@alkeva/shared";
import { DB, ENV } from "../core/core.module.js";
import { MailService } from "../notifications/mail.service.js";

export type EmailCodePurpose = "verify_email" | "withdrawal";

const CODE_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;
/** At most this many codes per user and purpose in the window — mail bombing guard. */
const ISSUE_LIMIT = 5;
const ISSUE_WINDOW_MIN = 15;

/**
 * Six-digit one-time codes sent by email: confirming an address, confirming a
 * withdrawal. Only an HMAC of the code (keyed with the server secret and the
 * row id) is stored, so a database leak cannot be brute-forced offline — a
 * plain sha256 of a 6-digit number can be reversed in milliseconds.
 *
 * Codes go straight to MailService and never into the notifications table:
 * the payload is the secret, the same rule as the password-reset link.
 */
@Injectable()
export class EmailCodesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly mail: MailService,
  ) {}

  /**
   * Issues a fresh code (retiring any earlier live one for the same purpose)
   * and emails it. `payload` is stored with the code and handed back by
   * `consume` — for a withdrawal, the exact request the code confirms.
   */
  async issue(
    userId: string,
    purpose: EmailCodePurpose,
    payload: Record<string, string> = {},
    toEmail?: string,
  ): Promise<{ id: string; expiresAt: string; sentTo: string }> {
    const userRows = await this.db
      .select({ email: users.email, locale: users.locale })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const user = userRows[0];
    if (!user) throw new NotFoundException("user_not_found");
    const to = toEmail ?? user.email;

    const recent = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(emailCodes)
      .where(
        and(
          eq(emailCodes.userId, userId),
          eq(emailCodes.purpose, purpose),
          gt(emailCodes.createdAt, sql`now() - make_interval(mins => ${ISSUE_WINDOW_MIN})`),
        ),
      );
    if ((recent[0]?.n ?? 0) >= ISSUE_LIMIT) {
      throw new HttpException(
        { message: "code_rate_limited", retryAfterSeconds: ISSUE_WINDOW_MIN * 60 },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // One live code per purpose: issuing a new one retires the old.
    await this.db
      .update(emailCodes)
      .set({ expiresAt: sql`now()` })
      .where(
        and(
          eq(emailCodes.userId, userId),
          eq(emailCodes.purpose, purpose),
          isNull(emailCodes.consumedAt),
          gt(emailCodes.expiresAt, sql`now()`),
        ),
      );

    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const inserted = await this.db
      .insert(emailCodes)
      .values({
        userId,
        purpose,
        codeHash: "pending",
        payload: { ...payload, email: to },
        expiresAt: sql`now() + make_interval(mins => ${CODE_TTL_MIN})`,
      })
      .returning({ id: emailCodes.id, expiresAt: emailCodes.expiresAt });
    const row = inserted[0]!;
    await this.db
      .update(emailCodes)
      .set({ codeHash: this.hash(row.id, code) })
      .where(eq(emailCodes.id, row.id));

    const template = purpose === "withdrawal" ? "withdrawal_code" : "email_code";
    const rendered = renderNotification(template, emailLocaleFor(user.locale), {
      ...payload,
      code,
      minutes: String(CODE_TTL_MIN),
    });
    const outcome = await this.mail.send(to, rendered.subject, rendered.html, rendered.text);
    if (outcome === "skipped" && this.env.NODE_ENV !== "production") {
      // Local development without SMTP: the code has to reach the developer
      // somehow. Production refuses to boot without SMTP (env guard).
      console.log(`[dev] ${purpose} code for ${to}: ${code}`);
    }

    return { id: row.id, expiresAt: row.expiresAt.toISOString(), sentTo: maskEmail(to) };
  }

  /**
   * Checks a code and consumes it on success. `id` pins a specific code (a
   * withdrawal intent); without it the newest live code for the purpose is
   * used. Wrong codes count; the fifth wrong attempt kills the code.
   */
  async consume(
    userId: string,
    purpose: EmailCodePurpose,
    code: string,
    id?: string,
  ): Promise<Record<string, string>> {
    const rows = await this.db
      .select()
      .from(emailCodes)
      .where(
        and(
          eq(emailCodes.userId, userId),
          eq(emailCodes.purpose, purpose),
          ...(id ? [eq(emailCodes.id, id)] : []),
        ),
      )
      .orderBy(desc(emailCodes.createdAt))
      .limit(1);
    const row = rows[0];
    if (!row || row.consumedAt) throw new UnprocessableEntityException("code_invalid");
    if (row.expiresAt.getTime() <= Date.now()) {
      throw new UnprocessableEntityException("code_expired");
    }
    if (row.attempts >= MAX_ATTEMPTS) throw new UnprocessableEntityException("code_locked");

    const ok = /^[0-9]{6}$/.test(code) && safeEqual(row.codeHash, this.hash(row.id, code));
    if (!ok) {
      const bumped = await this.db
        .update(emailCodes)
        .set({ attempts: sql`${emailCodes.attempts} + 1` })
        .where(eq(emailCodes.id, row.id))
        .returning({ attempts: emailCodes.attempts });
      const attempts = bumped[0]?.attempts ?? MAX_ATTEMPTS;
      throw new UnprocessableEntityException({
        message: attempts >= MAX_ATTEMPTS ? "code_locked" : "code_invalid",
        attemptsLeft: Math.max(0, MAX_ATTEMPTS - attempts),
      });
    }

    // Single use: the conditional UPDATE is the mutex against a double submit.
    const claimed = await this.db
      .update(emailCodes)
      .set({ consumedAt: sql`now()` })
      .where(and(eq(emailCodes.id, row.id), isNull(emailCodes.consumedAt)))
      .returning({ id: emailCodes.id });
    if (claimed.length === 0) throw new UnprocessableEntityException("code_invalid");
    return (row.payload ?? {}) as Record<string, string>;
  }

  private hash(id: string, code: string): string {
    return createHmac("sha256", this.env.JWT_SECRET).update(`${id}:${code}`).digest("hex");
  }
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** "dagmfre@gmail.com" → "da•••••@gmail.com" — enough to recognise, not to harvest. */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  const keep = local.slice(0, Math.min(2, local.length));
  return `${keep}${"•".repeat(Math.max(1, local.length - keep.length))}@${domain}`;
}
