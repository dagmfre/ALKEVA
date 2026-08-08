import argon2 from "argon2";
import { eq, sql } from "drizzle-orm";
import {
  loadDotenvUpwards,
  loadEnv,
  METAL_ASSETS,
  parseTierBands,
  SYSTEM_ACCOUNTS,
  UNITS,
  type MetalAsset,
} from "@alkeva/shared";
import { createDb } from "./index.js";
import {
  accounts,
  feeConfig,
  holdingTierConfig,
  ledgerEntries,
  ledgerTransactions,
  priceTicks,
  treasuryConfig,
  users,
  vaultHoldings,
} from "./schema.js";

/**
 * Idempotent seed — safe to run on every deploy.
 * Creates: system ledger accounts, config rows (from env), the admin user,
 * and the initial demo vault intake (only if the vault is empty).
 */
loadDotenvUpwards();
const env = loadEnv();
const { db, client } = createDb(env.DATABASE_URL, { max: 1 });

function pctToMilli(pct: number): number {
  return Math.round(pct * 1000);
}

try {
  // 1. System accounts — one per name, asset derived from the name.
  for (const name of SYSTEM_ACCOUNTS) {
    const asset = name === "system:vault:XAU" ? "XAU" : name === "system:vault:XPT" ? "XPT" : "ETB";
    await db
      .insert(accounts)
      .values({ ownerType: "system", systemName: name, asset })
      .onConflictDoNothing();
  }
  console.log("✓ system accounts");

  // 2. Config rows (single-row tables, id=1) — env is the source of truth.
  await db
    .insert(feeConfig)
    .values({
      id: 1,
      commissionPctMilli: pctToMilli(env.FEE_COMMISSION_PCT),
      serviceFeeCents: env.FEE_SERVICE_CENTS,
      taxPctMilli: pctToMilli(env.TAX_PCT),
      reforestPctMilli: pctToMilli(env.REFOREST_PCT),
    })
    .onConflictDoUpdate({
      target: feeConfig.id,
      set: {
        commissionPctMilli: pctToMilli(env.FEE_COMMISSION_PCT),
        serviceFeeCents: env.FEE_SERVICE_CENTS,
        taxPctMilli: pctToMilli(env.TAX_PCT),
        reforestPctMilli: pctToMilli(env.REFOREST_PCT),
        updatedAt: sql`now()`,
      },
    });

  await db
    .insert(treasuryConfig)
    .values({
      id: 1,
      floatTargetCents: env.TREASURY_FLOAT_ETB_CENTS,
      haltThresholdCents: env.TREASURY_HALT_CENTS,
      dailySellbackCeilingCents: env.SELLBACK_DAILY_CEILING_CENTS,
    })
    .onConflictDoUpdate({
      target: treasuryConfig.id,
      set: {
        floatTargetCents: env.TREASURY_FLOAT_ETB_CENTS,
        haltThresholdCents: env.TREASURY_HALT_CENTS,
        dailySellbackCeilingCents: env.SELLBACK_DAILY_CEILING_CENTS,
        updatedAt: sql`now()`,
      },
    });
  console.log("✓ fee + treasury config");

  // 3. Holding tiers from TIER_BANDS_JSON (Decision A3).
  // Caps are optional in the JSON; absent = NULL = uncapped.
  const bands = parseTierBands(env.TIER_BANDS_JSON);
  for (const [i, band] of bands.entries()) {
    const caps = {
      perTxnCapCents: band.perTxnCapCents ? BigInt(band.perTxnCapCents) : null,
      dailyCapCents: band.dailyCapCents ? BigInt(band.dailyCapCents) : null,
    };
    await db
      .insert(holdingTierConfig)
      .values({
        name: band.name,
        rank: i + 1,
        maxUsd: band.maxUsd,
        ...caps,
        // Delivery reserved for the top two tiers (Q35: high-value holdings only).
        deliveryEligible: i >= bands.length - 2,
      })
      .onConflictDoUpdate({
        target: holdingTierConfig.name,
        set: {
          rank: i + 1,
          maxUsd: band.maxUsd,
          ...caps,
          deliveryEligible: i >= bands.length - 2,
        },
      });
  }
  console.log(`✓ ${bands.length} holding tiers`);

  // 4. Admin user.
  const existingAdmin = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, env.SEED_ADMIN_EMAIL))
    .limit(1);
  if (existingAdmin.length === 0) {
    const passwordHash = await argon2.hash(env.SEED_ADMIN_PASSWORD, {
      type: argon2.argon2id,
    });
    await db.insert(users).values({
      email: env.SEED_ADMIN_EMAIL,
      passwordHash,
      fullName: "ALKEVA Admin",
      locale: "en",
      role: "administrator",
      kycTier: 3,
    });
    console.log("✓ admin user created");
  } else {
    console.log("✓ admin user exists");
  }

  // 5. Demo vault intake — only when the vault has no records at all.
  const vaultCount = await db.select({ n: sql<number>`count(*)::int` }).from(vaultHoldings);
  if ((vaultCount[0]?.n ?? 0) === 0) {
    await db.insert(vaultHoldings).values([
      {
        asset: "XAU",
        kind: "intake",
        gramsMg: env.VAULT_SEED_XAU_MG,
        reference: "DEMO-SEED-XAU — placeholder inventory, not a real vault receipt",
      },
      {
        asset: "XPT",
        kind: "intake",
        gramsMg: env.VAULT_SEED_XPT_MG,
        reference: "DEMO-SEED-XPT — placeholder inventory, not a real vault receipt",
      },
    ]);
    console.log("✓ demo vault intake");
  } else {
    console.log("✓ vault already has records, skipping seed intake");
  }

  // 6. Opening float — one treasury-kind ledger transaction funding
  // system:cash from system:external, so sells can pay out and the float
  // projection is real. Idempotent: only while system:cash has no entries.
  if (env.TREASURY_FLOAT_ETB_CENTS > 0n) {
    const [cashAccount] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.systemName, "system:cash"))
      .limit(1);
    const [externalAccount] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.systemName, "system:external"))
      .limit(1);
    if (!cashAccount || !externalAccount) throw new Error("system accounts missing");

    const cashEntryCount = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.accountId, cashAccount.id));

    if ((cashEntryCount[0]?.n ?? 0) === 0) {
      await db.transaction(async (tx) => {
        const [txn] = await tx
          .insert(ledgerTransactions)
          .values({ kind: "treasury", note: "opening_float (seed)" })
          .returning({ id: ledgerTransactions.id });
        if (!txn) throw new Error("failed to create opening-float transaction");
        await tx.insert(ledgerEntries).values([
          {
            transactionId: txn.id,
            accountId: externalAccount.id,
            asset: "ETB",
            amount: -env.TREASURY_FLOAT_ETB_CENTS,
          },
          {
            transactionId: txn.id,
            accountId: cashAccount.id,
            asset: "ETB",
            amount: env.TREASURY_FLOAT_ETB_CENTS,
          },
        ]);
      });
      console.log("✓ opening float posted");
    } else {
      console.log("✓ system:cash already funded, skipping opening float");
    }
  }

  // 7. One year of price history — the 30d and 1y chart ranges (Phase 3.3)
  // have nothing to draw otherwise, since the live worker only started ticking
  // this week. Daily synthetic ticks, clearly labelled `seed-backfill` so no
  // one mistakes them for observed prices, and deterministic so re-seeding
  // reproduces the same chart.
  //
  // Idempotent on its own marker rather than on tick age: a few real ticks
  // from a day of local testing must not be mistaken for a year of history.
  // Real ticks are never modified — the synthetic series ends where the real
  // feed begins, so the two join without a gap or an overlap.
  const backfilled = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(priceTicks)
    .where(eq(priceTicks.source, "seed-backfill"));

  if ((backfilled[0]?.n ?? 0) === 0) {
    // Anchors: plausible mid-2026 spot, used only when the worker has not yet
    // written a real tick to anchor against.
    const FALLBACK_USD_PER_OZ_MICRO: Record<MetalAsset, bigint> = {
      XAU: 3_300_000_000n,
      XPT: 1_050_000_000n,
    };
    const FALLBACK_FX_MICRO = 132_000_000n;
    const DAYS = 365;

    // Deterministic LCG (glibc constants) — no Math.random, so the seeded
    // chart is identical on every machine and every re-run.
    let lcg = 20260809;
    const nextUnit = (): number => {
      lcg = (lcg * 1103515245 + 12345) % 2147483648;
      return lcg / 2147483648; // [0, 1)
    };

    const rows: (typeof priceTicks.$inferInsert)[] = [];

    for (const asset of METAL_ASSETS) {
      // Anchor on the OLDEST real tick: the synthetic series walks backwards
      // from where the live feed starts, so there is no overlap and no step
      // at the seam. With no real ticks at all, anchor on now + a plausible
      // spot price so a fresh database still charts.
      const [earliest] = await db
        .select({
          usd: priceTicks.usdPerOzMicro,
          fx: priceTicks.etbRateMicro,
          at: priceTicks.at,
        })
        .from(priceTicks)
        .where(eq(priceTicks.asset, asset))
        .orderBy(sql`${priceTicks.at} asc`)
        .limit(1);

      const endUsd = earliest?.usd ?? FALLBACK_USD_PER_OZ_MICRO[asset];
      const fxMicro = earliest?.fx ?? FALLBACK_FX_MICRO;
      const anchorAt = earliest?.at ?? new Date();

      let usd = endUsd;
      for (let daydiff = 1; daydiff <= DAYS; daydiff++) {
        // ±0.9% per day, with a mild downward drift going back in time so the
        // year reads as gradual appreciation rather than a flat line.
        const driftBp = Math.round((nextUnit() - 0.5) * 180) - 4;
        usd = (usd * BigInt(10_000 - driftBp)) / 10_000n;
        if (usd <= 0n) usd = endUsd;

        const at = new Date(anchorAt);
        at.setUTCHours(12, 0, 0, 0);
        at.setUTCDate(at.getUTCDate() - daydiff);

        rows.push({
          asset,
          usdPerOzMicro: usd,
          etbRateMicro: fxMicro,
          // Identical formula to the worker (apps/worker/src/main.ts).
          etbCentsPerGram:
            (usd * fxMicro * 100_000n) / (UNITS.MICRO * UNITS.MICRO * UNITS.TROY_OZ_MG),
          source: "seed-backfill",
          fxSource: "seed-backfill",
          at,
        });
      }
    }

    for (let i = 0; i < rows.length; i += 500) {
      await db.insert(priceTicks).values(rows.slice(i, i + 500));
    }
    console.log(`✓ ${rows.length} backfilled price ticks (${DAYS}d × ${METAL_ASSETS.length})`);
  } else {
    console.log("✓ price history already present, skipping backfill");
  }

  console.log("Seed complete.");
} finally {
  await client.end();
}
