import {
  Inject,
  Injectable,
  InternalServerErrorException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  accounts,
  freezes,
  ledgerEntries,
  ledgerTransactions,
  users,
  type Db,
} from "@alkeva/db";
import type { Asset, BalancesResponse, SystemAccountName } from "@alkeva/shared";
import { DB } from "../core/core.module.js";

/** The transaction handle drizzle passes to `db.transaction` callbacks. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface EntrySpec {
  accountId: string;
  asset: Asset;
  /** Signed: ETB cents or metal milligrams. Zero entries are dropped. */
  amount: bigint;
}

export interface PostTxnSpec {
  kind: "deposit" | "buy" | "sell" | "withdrawal" | "treasury";
  orderId?: string;
  paymentId?: string;
  payoutId?: string;
  initiatedBy?: string;
  note?: string;
  entries: EntrySpec[];
}

/**
 * The only code path that writes ledger entries. Invariants live here
 * (app-level) and in migration 0001's triggers (DB-level backstop):
 * append-only, zero-sum per (transaction, asset), entry asset matches account.
 */
@Injectable()
export class LedgerService {
  /** system account ids never change after seed — cache name → id. */
  private readonly systemIds = new Map<SystemAccountName, string>();

  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Guarantees the (user, asset) account row exists. Call BEFORE opening a
   * money transaction — the upsert must not sit inside the locked section.
   */
  async ensureUserAccount(userId: string, asset: Asset): Promise<string> {
    await this.db
      .insert(accounts)
      .values({ ownerType: "user", userId, asset })
      .onConflictDoNothing();
    const rows = await this.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        sql`${accounts.ownerType} = 'user' and ${accounts.userId} = ${userId} and ${accounts.asset} = ${asset}`,
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new InternalServerErrorException("account_create_failed");
    return row.id;
  }

  async systemAccountId(name: SystemAccountName): Promise<string> {
    const cached = this.systemIds.get(name);
    if (cached) return cached;
    const rows = await this.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.systemName, name))
      .limit(1);
    const row = rows[0];
    if (!row) throw new InternalServerErrorException("system_account_missing");
    this.systemIds.set(name, row.id);
    return row.id;
  }

  /**
   * Locks the given account rows in id-ASC order (the global deadlock-free
   * protocol every money path follows), then returns each account's balance.
   * Accounts with no entries project to 0n.
   */
  async lockAndReadBalances(tx: Tx, accountIds: string[]): Promise<Map<string, bigint>> {
    const ids = [...new Set(accountIds)].sort();
    const locked = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(inArray(accounts.id, ids))
      .orderBy(asc(accounts.id))
      .for("update");
    if (locked.length !== ids.length) {
      throw new InternalServerErrorException("account_missing");
    }

    const sums = await tx
      .select({
        accountId: ledgerEntries.accountId,
        balance: sql<string>`coalesce(sum(${ledgerEntries.amount}), 0)::bigint`,
      })
      .from(ledgerEntries)
      .where(inArray(ledgerEntries.accountId, ids))
      .groupBy(ledgerEntries.accountId);

    const balances = new Map<string, bigint>(ids.map((id) => [id, 0n]));
    for (const row of sums) balances.set(row.accountId, BigInt(row.balance));
    return balances;
  }

  /**
   * Posts one atomic ledger transaction inside an already-open `tx` whose
   * account locks are held. Zero entries are omitted (DB CHECK forbids 0);
   * per-asset zero-sum is asserted here before the deferred trigger would
   * catch it at COMMIT.
   */
  async postTransaction(tx: Tx, spec: PostTxnSpec): Promise<string> {
    const entries = spec.entries.filter((e) => e.amount !== 0n);
    const perAsset = new Map<Asset, bigint>();
    for (const e of entries) {
      perAsset.set(e.asset, (perAsset.get(e.asset) ?? 0n) + e.amount);
    }
    for (const [asset, total] of perAsset) {
      if (total !== 0n) {
        throw new InternalServerErrorException(`ledger_unbalanced:${asset}`);
      }
    }
    if (entries.length === 0) {
      throw new InternalServerErrorException("ledger_empty_transaction");
    }

    const inserted = await tx
      .insert(ledgerTransactions)
      .values({
        kind: spec.kind,
        orderId: spec.orderId,
        paymentId: spec.paymentId,
        payoutId: spec.payoutId,
        initiatedBy: spec.initiatedBy,
        note: spec.note,
      })
      .returning({ id: ledgerTransactions.id });
    const txn = inserted[0];
    if (!txn) throw new InternalServerErrorException("ledger_txn_insert_failed");

    await tx.insert(ledgerEntries).values(
      entries.map((e) => ({
        transactionId: txn.id,
        accountId: e.accountId,
        asset: e.asset,
        amount: e.amount,
      })),
    );
    return txn.id;
  }

  /**
   * Two independent freeze signals, checked together: user.status and an
   * unlifted freeze row. Shared by every money path (orders inside their tx,
   * faucet/payments/payouts before theirs) — pass the handle that matches
   * the caller's isolation needs.
   */
  async isFrozen(handle: Db | Tx, userId: string): Promise<boolean> {
    const rows = await handle
      .select({
        status: users.status,
        activeFreeze: sql<boolean>`${freezes.id} is not null`,
      })
      .from(users)
      .leftJoin(freezes, and(eq(freezes.userId, users.id), isNull(freezes.liftedAt)))
      .where(eq(users.id, userId))
      .limit(1);
    const row = rows[0];
    return !row || row.status === "frozen" || row.activeFreeze;
  }

  /** Throwing form for paths where frozen is a hard stop, not a recorded rejection. */
  async assertNotFrozen(userId: string): Promise<void> {
    if (await this.isFrozen(this.db, userId)) {
      throw new UnprocessableEntityException("account_frozen");
    }
  }

  /** Balance projection across the user's accounts; absent accounts read 0. */
  async balancesForUser(userId: string): Promise<BalancesResponse> {
    const rows = await this.db
      .select({
        asset: accounts.asset,
        balance: sql<string>`coalesce(sum(${ledgerEntries.amount}), 0)::bigint`,
      })
      .from(accounts)
      .leftJoin(ledgerEntries, eq(ledgerEntries.accountId, accounts.id))
      .where(sql`${accounts.ownerType} = 'user' and ${accounts.userId} = ${userId}`)
      .groupBy(accounts.asset);

    const byAsset = new Map(rows.map((r) => [r.asset, BigInt(r.balance)]));
    return {
      etbCents: (byAsset.get("ETB") ?? 0n).toString(),
      xauMg: (byAsset.get("XAU") ?? 0n).toString(),
      xptMg: (byAsset.get("XPT") ?? 0n).toString(),
    };
  }
}
