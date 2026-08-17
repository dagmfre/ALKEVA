import { sql, type Db } from "./deps.js";

/**
 * The rule vocabulary. Each rule is a deterministic query over settled facts —
 * no model, no score learned from anything. What an LLM is later asked to do is
 * put the finding into a sentence; it is never asked whether the finding holds.
 */
export const RISK_RULE_KEYS = [
  "structuring_near_threshold",
  "velocity_spike",
  "rapid_in_out",
  "new_account_volume",
  "dormant_reactivation",
  "repeated_refusals",
] as const;
export type RiskRuleKey = (typeof RISK_RULE_KEYS)[number];

export type RiskSeverity = "low" | "medium" | "high";

export interface RiskFinding {
  userId: string;
  ruleKey: RiskRuleKey;
  score: number;
  severity: RiskSeverity;
  /** Every evidence value is a string: the column is jsonb and bigints do not
      survive JSON.stringify, so cents are carried as digit strings throughout. */
  evidence: Record<string, string>;
}

export interface RuleContext {
  db: Db;
  now: Date;
  /** Midnight Addis for `now` — the bucket every daily rule shares. */
  windowStart: Date;
  /** The AML review line, in ETB cents. */
  thresholdCents: bigint;
  /** "Near" the threshold, as a percentage of it. */
  nearPct: number;
  /** Trailing window for baselines, in days. */
  lookbackDays: number;
}

/** Fixed weights. Advisory: nothing in the system gates on a score. */
const WEIGHTS: Record<RiskRuleKey, { score: number; severity: RiskSeverity }> = {
  structuring_near_threshold: { score: 85, severity: "high" },
  rapid_in_out: { score: 75, severity: "high" },
  velocity_spike: { score: 60, severity: "medium" },
  dormant_reactivation: { score: 55, severity: "medium" },
  new_account_volume: { score: 50, severity: "medium" },
  repeated_refusals: { score: 40, severity: "low" },
};

function finding(
  ruleKey: RiskRuleKey,
  userId: string,
  evidence: Record<string, string>,
): RiskFinding {
  return { userId, ruleKey, ...WEIGHTS[ruleKey], evidence };
}

/**
 * postgres.js binds a Date parameter as an object and throws inside raw sql,
 * so every timestamp crosses the boundary as an ISO string — the same rule the
 * analytics and revenue queries already follow.
 */
const iso = (d: Date): string => d.toISOString();

type Row = Record<string, unknown>;
const str = (v: unknown): string => (v === null || v === undefined ? "0" : String(v));

/**
 * Structuring: several transactions deliberately parked just under the review
 * line. One order at 490,000 is unremarkable; three in a day is the shape the
 * threshold exists to catch, and is invisible to a per-order check.
 */
async function structuring(ctx: RuleContext): Promise<RiskFinding[]> {
  const floor = (ctx.thresholdCents * BigInt(ctx.nearPct)) / 100n;
  const rows = (await ctx.db.execute(sql`
    select o.user_id,
           count(*)::int as n,
           sum(q.total_cents)::text as total,
           min(q.total_cents)::text as smallest
      from "order" o
      join quote q on q.id = o.quote_id
     where o.status = 'settled'
       and o.created_at >= ${iso(ctx.windowStart)}::timestamptz
       and q.total_cents >= ${floor.toString()}::bigint
       and q.total_cents < ${ctx.thresholdCents.toString()}::bigint
     group by o.user_id
    having count(*) >= 3
  `)) as unknown as Row[];

  return rows.map((r) =>
    finding("structuring_near_threshold", String(r.user_id), {
      orderCount: str(r.n),
      combinedCents: str(r.total),
      smallestCents: str(r.smallest),
      reviewThresholdCents: ctx.thresholdCents.toString(),
      nearThresholdFloorCents: floor.toString(),
    }),
  );
}

/**
 * Velocity: today's trading is a large multiple of this account's own recent
 * habit. A baseline of zero is deliberately excluded — that is a new or dormant
 * account, which the two rules below describe more precisely.
 */
async function velocity(ctx: RuleContext): Promise<RiskFinding[]> {
  const since = new Date(ctx.windowStart.getTime() - ctx.lookbackDays * 86_400_000);
  const rows = (await ctx.db.execute(sql`
    select user_id,
           count(*) filter (where created_at >= ${iso(ctx.windowStart)}::timestamptz)::int as today,
           count(*) filter (where created_at <  ${iso(ctx.windowStart)}::timestamptz)::int as prior
      from "order"
     where created_at >= ${iso(since)}::timestamptz
     group by user_id
  `)) as unknown as Row[];

  const out: RiskFinding[] = [];
  for (const r of rows) {
    const today = Number(r.today ?? 0);
    const prior = Number(r.prior ?? 0);
    if (today < 5 || prior < 1) continue;
    const dailyAvg = prior / ctx.lookbackDays;
    if (today < dailyAvg * 5) continue;
    out.push(
      finding("velocity_spike", String(r.user_id), {
        ordersToday: String(today),
        ordersInLookback: String(prior),
        lookbackDays: String(ctx.lookbackDays),
        dailyAverage: dailyAvg.toFixed(2),
      }),
    );
  }
  return out;
}

/**
 * Money in, money straight back out. Custody accounts used as a pass-through
 * are the classic layering shape, and it is only visible by looking at the
 * deposit and the payout together.
 */
async function rapidInOut(ctx: RuleContext): Promise<RiskFinding[]> {
  const since = new Date(ctx.now.getTime() - 86_400_000);
  const rows = (await ctx.db.execute(sql`
    select u.id as user_id,
           coalesce(d.cents, 0)::text as deposited,
           coalesce(w.cents, 0)::text as withdrawn
      from "user" u
      join (
        select user_id, sum(amount_cents) as cents
          from payment
         where status = 'credited'
           and credited_at >= ${iso(since)}::timestamptz
         group by user_id
      ) d on d.user_id = u.id
      left join (
        select user_id, sum(amount_cents) as cents
          from payout
         where created_at >= ${iso(since)}::timestamptz
           and status <> 'rejected'
         group by user_id
      ) w on w.user_id = u.id
  `)) as unknown as Row[];

  const out: RiskFinding[] = [];
  for (const r of rows) {
    const deposited = BigInt(str(r.deposited));
    const withdrawn = BigInt(str(r.withdrawn));
    if (deposited <= 0n || withdrawn * 100n < deposited * 80n) continue;
    out.push(
      finding("rapid_in_out", String(r.user_id), {
        depositedCents: deposited.toString(),
        withdrawnCents: withdrawn.toString(),
        returnedPct: ((withdrawn * 100n) / deposited).toString(),
        windowHours: "24",
      }),
    );
  }
  return out;
}

/** A days-old account moving review-line money is worth a human look. */
async function newAccountVolume(ctx: RuleContext): Promise<RiskFinding[]> {
  const since = new Date(ctx.now.getTime() - 7 * 86_400_000);
  const rows = (await ctx.db.execute(sql`
    select o.user_id,
           sum(q.total_cents)::text as total,
           count(*)::int as n,
           min(u.created_at)::text as joined
      from "order" o
      join quote q on q.id = o.quote_id
      join "user" u on u.id = o.user_id
     where o.status = 'settled'
       and u.created_at >= ${iso(since)}::timestamptz
     group by o.user_id
    having sum(q.total_cents) >= ${ctx.thresholdCents.toString()}::bigint
  `)) as unknown as Row[];

  return rows.map((r) =>
    finding("new_account_volume", String(r.user_id), {
      volumeCents: str(r.total),
      orderCount: str(r.n),
      accountAgeDays: "7",
      reviewThresholdCents: ctx.thresholdCents.toString(),
    }),
  );
}

/** Long silence, then a burst. The silence is the signal, not the burst. */
async function dormantReactivation(ctx: RuleContext): Promise<RiskFinding[]> {
  const dormantBefore = new Date(ctx.windowStart.getTime() - 30 * 86_400_000);
  const rows = (await ctx.db.execute(sql`
    select user_id,
           max(created_at) filter (where created_at < ${iso(ctx.windowStart)}::timestamptz) as last_before,
           count(*) filter (where created_at >= ${iso(ctx.windowStart)}::timestamptz)::int as today
      from "order"
     group by user_id
  `)) as unknown as Row[];

  const out: RiskFinding[] = [];
  for (const r of rows) {
    const today = Number(r.today ?? 0);
    const lastBefore = r.last_before ? new Date(String(r.last_before)) : null;
    if (today < 3 || !lastBefore || lastBefore > dormantBefore) continue;
    const days = Math.floor((ctx.windowStart.getTime() - lastBefore.getTime()) / 86_400_000);
    out.push(
      finding("dormant_reactivation", String(r.user_id), {
        ordersToday: String(today),
        quietDays: String(days),
        lastActivityAt: lastBefore.toISOString(),
      }),
    );
  }
  return out;
}

/**
 * Refusals in bulk. A user who trips the gates five times in a day is either
 * confused or mapping where the limits are; both deserve a person's attention,
 * and the second is the reason this rule exists.
 */
async function repeatedRefusals(ctx: RuleContext): Promise<RiskFinding[]> {
  const rows = (await ctx.db.execute(sql`
    select user_id,
           count(*)::int as n,
           string_agg(distinct failure_reason, ',') as reasons
      from "order"
     where status = 'rejected'
       and created_at >= ${iso(ctx.windowStart)}::timestamptz
     group by user_id
    having count(*) >= 5
  `)) as unknown as Row[];

  return rows.map((r) =>
    finding("repeated_refusals", String(r.user_id), {
      refusalCount: str(r.n),
      reasons: r.reasons ? String(r.reasons) : "unknown",
    }),
  );
}

export const RULES: ((ctx: RuleContext) => Promise<RiskFinding[]>)[] = [
  structuring,
  velocity,
  rapidInOut,
  newAccountVolume,
  dormantReactivation,
  repeatedRefusals,
];
