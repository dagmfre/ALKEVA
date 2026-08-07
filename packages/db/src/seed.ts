import argon2 from "argon2";
import { eq, sql } from "drizzle-orm";
import { loadDotenvUpwards, loadEnv, parseTierBands, SYSTEM_ACCOUNTS } from "@alkeva/shared";
import { createDb } from "./index.js";
import {
  accounts,
  feeConfig,
  holdingTierConfig,
  ledgerEntries,
  ledgerTransactions,
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

  console.log("Seed complete.");
} finally {
  await client.end();
}
