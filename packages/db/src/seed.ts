import argon2 from "argon2";
import { eq, sql } from "drizzle-orm";
import { loadDotenvUpwards, loadEnv, parseTierBands, SYSTEM_ACCOUNTS } from "@alkeva/shared";
import { createDb } from "./index.js";
import {
  accounts,
  feeConfig,
  holdingTierConfig,
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
  const bands = parseTierBands(env.TIER_BANDS_JSON);
  for (const [i, band] of bands.entries()) {
    await db
      .insert(holdingTierConfig)
      .values({
        name: band.name,
        rank: i + 1,
        maxUsd: band.maxUsd,
        // Delivery reserved for the top two tiers (Q35: high-value holdings only).
        deliveryEligible: i >= bands.length - 2,
      })
      .onConflictDoUpdate({
        target: holdingTierConfig.name,
        set: { rank: i + 1, maxUsd: band.maxUsd, deliveryEligible: i >= bands.length - 2 },
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

  console.log("Seed complete.");
} finally {
  await client.end();
}
