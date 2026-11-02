import {
  Inject,
  Injectable,
  UnprocessableEntityException,
} from "@nestjs/common";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  auditLogs,
  ledgerTransactions,
  ledgerEntries,
  treasuryConfig,
  vaultHoldings,
  type Db,
} from "@alkeva/db";
import type {
  MetalAsset,
  SystemAccountName,
  TreasuryCapitalEntryDto,
  TreasuryEntriesResponse,
  TreasuryVaultEntryDto,
} from "@alkeva/shared";
import { DB } from "../core/core.module.js";
import { LedgerService } from "../ledger/ledger.service.js";

/**
 * The only way real inventory and real capital enter the books (Phase 10).
 * Replaces the seed's demo vault stock and demo opening float, which must
 * never stand behind the reserve gate with real money.
 *
 *  - Vault intake / outtake: an append-only `vault_holding` row (the table
 *    rejects UPDATE/DELETE since migration 0012) carrying the bar serial and
 *    assay reference. An outtake may never leave less metal in the vault than
 *    customers are owed — non-negotiable #5 holds even for the owner.
 *  - Capital in / out: a balanced `treasury` ledger transaction between
 *    system:external and system:cash. Taking capital out may not push the cash
 *    float below the halt threshold that protects customer sell-backs.
 *
 * Administrator-only, every entry audited with the actor.
 */
@Injectable()
export class TreasuryEntriesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly ledger: LedgerService,
  ) {}

  async list(): Promise<TreasuryEntriesResponse> {
    const vault = await this.db
      .select()
      .from(vaultHoldings)
      .orderBy(desc(vaultHoldings.createdAt))
      .limit(100);
    const cashId = await this.ledger.systemAccountId("system:cash");
    const capital = await this.db
      .select({
        id: ledgerTransactions.id,
        note: ledgerTransactions.note,
        createdAt: ledgerTransactions.createdAt,
        amount: ledgerEntries.amount,
      })
      .from(ledgerTransactions)
      .innerJoin(ledgerEntries, eq(ledgerEntries.transactionId, ledgerTransactions.id))
      .where(and(eq(ledgerTransactions.kind, "treasury"), eq(ledgerEntries.accountId, cashId)))
      .orderBy(desc(ledgerTransactions.createdAt))
      .limit(100);
    return {
      vault: vault.map((v) => ({
        id: v.id,
        asset: v.asset as MetalAsset,
        kind: v.kind,
        gramsMg: v.gramsMg.toString(),
        reference: v.reference,
        createdAt: v.createdAt.toISOString(),
      })),
      capital: capital.map((c) => ({
        id: c.id,
        direction: c.amount > 0n ? "in" : "out",
        amountCents: (c.amount > 0n ? c.amount : -c.amount).toString(),
        reference: c.note ?? "",
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }

  async recordVault(actorId: string, dto: TreasuryVaultEntryDto): Promise<void> {
    const asset = dto.asset;
    const vaultAccountId = await this.ledger.systemAccountId(
      `system:vault:${asset}` as SystemAccountName,
    );
    await this.db.transaction(async (tx) => {
      // Lock the vault account: buys of this asset serialize on the same lock,
      // so the "owed to customers" figure cannot move under this check.
      const balances = await this.ledger.lockAndReadBalances(tx, [vaultAccountId]);
      if (dto.kind === "outtake") {
        const physical = await this.physicalMg(tx, asset);
        const owed = -(balances.get(vaultAccountId) ?? 0n);
        if (physical - dto.gramsMg < (owed > 0n ? owed : 0n)) {
          throw new UnprocessableEntityException("vault_below_owed");
        }
      }
      const inserted = await tx
        .insert(vaultHoldings)
        .values({
          asset,
          kind: dto.kind,
          gramsMg: dto.gramsMg,
          reference: dto.reference,
          recordedBy: actorId,
        })
        .returning({ id: vaultHoldings.id });
      await tx.insert(auditLogs).values({
        actorId,
        actorLabel: `staff:${actorId}`,
        action: `vault_${dto.kind}`,
        targetType: "vault_holding",
        targetId: inserted[0]?.id,
        after: { asset, gramsMg: dto.gramsMg.toString(), reference: dto.reference },
      });
    });
  }

  async recordCapital(actorId: string, dto: TreasuryCapitalEntryDto): Promise<void> {
    const cashId = await this.ledger.systemAccountId("system:cash");
    const externalId = await this.ledger.systemAccountId("system:external");
    await this.db.transaction(async (tx) => {
      const balances = await this.ledger.lockAndReadBalances(tx, [cashId, externalId]);
      if (dto.direction === "out") {
        const cfg = await tx.select().from(treasuryConfig).where(eq(treasuryConfig.id, 1)).limit(1);
        const halt = cfg[0]?.haltThresholdCents ?? 0n;
        if ((balances.get(cashId) ?? 0n) - dto.amountCents < halt) {
          throw new UnprocessableEntityException("float_below_halt");
        }
      }
      const signed = dto.direction === "in" ? dto.amountCents : -dto.amountCents;
      const txnId = await this.ledger.postTransaction(tx, {
        kind: "treasury",
        initiatedBy: actorId,
        note: `capital_${dto.direction}: ${dto.reference}`,
        entries: [
          { accountId: externalId, asset: "ETB", amount: -signed },
          { accountId: cashId, asset: "ETB", amount: signed },
        ],
      });
      await tx.insert(auditLogs).values({
        actorId,
        actorLabel: `staff:${actorId}`,
        action: `capital_${dto.direction}`,
        targetType: "ledger_transaction",
        targetId: txnId,
        after: { amountCents: dto.amountCents.toString(), reference: dto.reference },
      });
    });
  }

  private async physicalMg(
    tx: Parameters<Parameters<Db["transaction"]>[0]>[0],
    asset: MetalAsset,
  ): Promise<bigint> {
    const rows = await tx
      .select({
        mg: sql<string>`coalesce(sum(case when ${vaultHoldings.kind} = 'intake' then ${vaultHoldings.gramsMg} else -${vaultHoldings.gramsMg} end), 0)::bigint`,
      })
      .from(vaultHoldings)
      .where(inArray(vaultHoldings.asset, [asset]));
    return BigInt(rows[0]?.mg ?? "0");
  }
}
