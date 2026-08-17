import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { auditLogs, complianceEvents, users, type Db } from "@alkeva/db";
import { runRiskScan } from "@alkeva/risk";
import type {
  AdminRiskCaseItem,
  AdminRiskCasesResponse,
  AdminRiskScanResponse,
  Env,
  Locale,
  RiskCaseStatus,
} from "@alkeva/shared";
import { AiService } from "../ai/ai.service.js";
import { DB, ENV } from "../core/core.module.js";

const CASE_LIMIT = 100;

/**
 * The AML case queue (spec F20/F22).
 *
 * The rules that open cases live in @alkeva/risk so the worker's timer and the
 * officer's "Run scan now" button cannot drift apart. This service is the
 * console over them, and it is incapable of the one thing an AML tool must
 * never do on its own: it cannot freeze an account, cannot touch a balance,
 * and cannot notify the flagged user. Resolving a case records who resolved it.
 */
@Injectable()
export class ComplianceService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly ai: AiService,
  ) {}

  async listCases(status: RiskCaseStatus): Promise<AdminRiskCasesResponse> {
    const resolver = sql`(select u2.email from "user" u2 where u2.id = ${complianceEvents.resolvedBy})`;
    const rows = await this.db
      .select({
        id: complianceEvents.id,
        userId: complianceEvents.userId,
        userEmail: users.email,
        userStatus: users.status,
        ruleKey: complianceEvents.ruleKey,
        severity: complianceEvents.severity,
        score: complianceEvents.score,
        evidence: complianceEvents.evidence,
        windowStart: complianceEvents.windowStart,
        narrative: complianceEvents.narrative,
        narrativeLocale: complianceEvents.narrativeLocale,
        resolvedAt: complianceEvents.resolvedAt,
        resolvedByEmail: resolver,
        resolutionNote: complianceEvents.resolutionNote,
        createdAt: complianceEvents.createdAt,
      })
      .from(complianceEvents)
      .leftJoin(users, eq(users.id, complianceEvents.userId))
      .where(
        status === "open"
          ? isNull(complianceEvents.resolvedAt)
          : isNotNull(complianceEvents.resolvedAt),
      )
      .orderBy(desc(complianceEvents.createdAt))
      .limit(CASE_LIMIT);

    const [open] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(complianceEvents)
      .where(isNull(complianceEvents.resolvedAt));

    const cases: AdminRiskCaseItem[] = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userEmail: r.userEmail,
      userStatus: r.userStatus,
      ruleKey: r.ruleKey,
      severity: r.severity,
      score: r.score,
      evidence: (r.evidence ?? null) as Record<string, string> | null,
      windowStart: r.windowStart?.toISOString() ?? null,
      narrative: r.narrative,
      narrativeLocale: r.narrativeLocale,
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      resolvedByEmail: (r.resolvedByEmail as string | null) ?? null,
      resolutionNote: r.resolutionNote,
      createdAt: r.createdAt.toISOString(),
    }));

    return { cases, openCount: open?.n ?? 0 };
  }

  /** On-demand pass — the same engine the worker runs, on the officer's click. */
  async scan(actorId: string): Promise<AdminRiskScanResponse> {
    const result = await runRiskScan(this.db, {
      thresholdCents: this.env.COMPLIANCE_REVIEW_THRESHOLD_CENTS,
      nearThresholdPct: this.env.RISK_NEAR_THRESHOLD_PCT,
      lookbackDays: this.env.RISK_LOOKBACK_DAYS,
    });
    await this.db.insert(auditLogs).values({
      actorId,
      actorLabel: `staff:${actorId}`,
      action: "risk_scan_run",
      targetType: "compliance_event",
      targetId: null,
      after: {
        found: String(result.found),
        opened: String(result.opened),
        windowStart: result.windowStart,
      },
    });
    return { ...result, byRule: result.byRule as Record<string, number> };
  }

  /**
   * Close a case. The conditional UPDATE is the mutex: only the click that
   * stamps resolved_at proceeds, so a double-submit cannot record two
   * different officers as having closed the same finding.
   */
  async resolve(caseId: string, actorId: string, note?: string): Promise<{ ok: true }> {
    const claimed = await this.db
      .update(complianceEvents)
      .set({
        resolvedAt: sql`now()`,
        resolvedBy: actorId,
        resolutionNote: note?.trim() ? note.trim() : null,
      })
      .where(and(eq(complianceEvents.id, caseId), isNull(complianceEvents.resolvedAt)))
      .returning({ id: complianceEvents.id, ruleKey: complianceEvents.ruleKey });

    const row = claimed[0];
    if (!row) {
      const [exists] = await this.db
        .select({ id: complianceEvents.id })
        .from(complianceEvents)
        .where(eq(complianceEvents.id, caseId))
        .limit(1);
      if (!exists) throw new NotFoundException("case_not_found");
      throw new ConflictException("case_already_resolved");
    }

    await this.db.insert(auditLogs).values({
      actorId,
      actorLabel: `staff:${actorId}`,
      action: "risk_case_resolved",
      targetType: "compliance_event",
      targetId: caseId,
      after: { ruleKey: row.ruleKey, note: note?.trim() ?? null },
    });
    return { ok: true };
  }

  /**
   * Ask the assistant to put the case in the officer's language, and cache it.
   *
   * A failure here is not a failure of the case: the evidence is already on
   * screen, and the narrative is a convenience. That is why the caller sees the
   * ordinary AI error codes and the row is left untouched.
   */
  async narrate(caseId: string, actorId: string): Promise<{ narrative: string }> {
    const [row] = await this.db
      .select({
        id: complianceEvents.id,
        ruleKey: complianceEvents.ruleKey,
        severity: complianceEvents.severity,
        score: complianceEvents.score,
        evidence: complianceEvents.evidence,
        windowStart: complianceEvents.windowStart,
        createdAt: complianceEvents.createdAt,
        narrative: complianceEvents.narrative,
        narrativeLocale: complianceEvents.narrativeLocale,
      })
      .from(complianceEvents)
      .where(eq(complianceEvents.id, caseId))
      .limit(1);
    if (!row) throw new NotFoundException("case_not_found");

    const [officer] = await this.db
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.id, actorId))
      .limit(1);
    const locale = (officer?.locale ?? "en") as Locale;

    // Already written in this officer's language — don't spend a call to
    // regenerate prose that says the same thing.
    if (row.narrative && row.narrativeLocale === locale) return { narrative: row.narrative };

    const narrative = await this.ai.narrateCase({
      locale,
      ruleKey: row.ruleKey,
      severity: row.severity,
      score: row.score,
      openedAt: row.createdAt.toISOString(),
      windowStart: row.windowStart?.toISOString() ?? null,
      evidence: (row.evidence ?? {}) as Record<string, unknown>,
    });

    await this.db
      .update(complianceEvents)
      .set({ narrative, narrativeAt: sql`now()`, narrativeLocale: locale })
      .where(eq(complianceEvents.id, caseId));

    return { narrative };
  }
}
