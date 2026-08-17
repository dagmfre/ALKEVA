import { auditLogs, complianceEvents, eatDayStartUtc, type Db } from "./deps.js";
import { RULES, type RiskFinding, type RiskRuleKey, type RuleContext } from "./rules.js";

export { RISK_RULE_KEYS, type RiskFinding, type RiskRuleKey, type RiskSeverity } from "./rules.js";

/**
 * The deterministic AML pass (spec F20/F22).
 *
 * Two callers share it: the worker on a timer, and a compliance officer
 * pressing "Run scan now". Both must reach the same conclusions from the same
 * data, which is why the engine lives in its own package rather than being
 * written twice.
 *
 * What it does NOT do is as deliberate as what it does. It never freezes an
 * account, never blocks a trade, never emails the flagged user (telling a
 * suspect they are flagged is tipping-off), and never posts a ledger entry. It
 * opens a case for a human and writes an audit row saying it did.
 */

export interface RiskScanConfig {
  /** The AML review line in ETB cents — the same value the order path uses. */
  thresholdCents: bigint;
  /** "Just under the line" expressed as a percentage of it. */
  nearThresholdPct: number;
  /** Trailing window used for per-account baselines. */
  lookbackDays: number;
}

export interface RiskScanResult {
  scannedAt: string;
  windowStart: string;
  /** Findings the rules produced this pass. */
  found: number;
  /** Cases actually opened — a repeat finding is suppressed by the unique index. */
  opened: number;
  byRule: Partial<Record<RiskRuleKey, number>>;
}

export async function runRiskScan(
  db: Db,
  config: RiskScanConfig,
  opts?: { now?: Date },
): Promise<RiskScanResult> {
  const now = opts?.now ?? new Date();
  const ctx: RuleContext = {
    db,
    now,
    // Daily rules bucket on midnight Addis, not midnight UTC — the same day
    // boundary the tier caps and sell-back ceilings already use.
    windowStart: eatDayStartUtc(now),
    thresholdCents: config.thresholdCents,
    nearPct: config.nearThresholdPct,
    lookbackDays: config.lookbackDays,
  };

  const findings: RiskFinding[] = [];
  for (const rule of RULES) {
    // One failing rule must not cost the pass its other findings.
    try {
      findings.push(...(await rule(ctx)));
    } catch (err) {
      console.error(`risk scan: rule failed: ${(err as Error).message}`);
    }
  }

  const byRule: Partial<Record<RiskRuleKey, number>> = {};
  let opened = 0;

  for (const f of findings) {
    // The claim: (user, rule, window) is unique, so a second scan over the same
    // day returns no row and the case is not duplicated.
    const inserted = await db
      .insert(complianceEvents)
      .values({
        userId: f.userId,
        ruleKey: f.ruleKey,
        action: "flag",
        score: f.score,
        severity: f.severity,
        windowStart: ctx.windowStart,
        evidence: f.evidence,
      })
      .onConflictDoNothing()
      .returning({ id: complianceEvents.id });

    const row = inserted[0];
    if (!row) continue;
    opened += 1;
    byRule[f.ruleKey] = (byRule[f.ruleKey] ?? 0) + 1;

    // actorId stays null: 'rules-engine' is a system actor, and the column is a
    // foreign key to a real person. The label is the one the schema has
    // documented since Phase 1 and nothing had yet used.
    await db.insert(auditLogs).values({
      actorId: null,
      actorLabel: "rules-engine",
      action: "risk_case_opened",
      targetType: "compliance_event",
      targetId: row.id,
      after: {
        ruleKey: f.ruleKey,
        severity: f.severity,
        score: String(f.score),
        userId: f.userId,
        windowStart: ctx.windowStart.toISOString(),
        ...f.evidence,
      },
    });
  }

  return {
    scannedAt: now.toISOString(),
    windowStart: ctx.windowStart.toISOString(),
    found: findings.length,
    opened,
    byRule,
  };
}
