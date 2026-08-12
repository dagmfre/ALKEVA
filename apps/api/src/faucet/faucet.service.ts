import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { auditLogs, type Db } from "@alkeva/db";
import type { BalancesResponse, Env, FaucetDto } from "@alkeva/shared";
import { DB, ENV } from "../core/core.module.js";
import { LedgerService } from "../ledger/ledger.service.js";

/**
 * Demo-only test money (Phase 2 decision, user-approved): credits the caller's
 * ETB account with REAL zero-sum ledger entries (system:external → user), so
 * everything downstream reconciles. Env-gated; Chapa deposits replace it in
 * Phase 4 by flipping DEMO_FAUCET_ENABLED.
 */
@Injectable()
export class FaucetService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly ledger: LedgerService,
  ) {}

  async credit(userId: string, dto: FaucetDto): Promise<BalancesResponse> {
    if (!this.env.DEMO_FAUCET_ENABLED) throw new NotFoundException("not_found");
    if (dto.amountCents > this.env.DEMO_FAUCET_MAX_CENTS) {
      throw new UnprocessableEntityException("faucet_limit");
    }
    await this.ledger.assertNotFrozen(userId);

    const userEtbId = await this.ledger.ensureUserAccount(userId, "ETB");
    const externalId = await this.ledger.systemAccountId("system:external");

    await this.db.transaction(async (tx) => {
      await this.ledger.lockAndReadBalances(tx, [userEtbId, externalId]);
      await this.ledger.postTransaction(tx, {
        kind: "deposit",
        initiatedBy: userId,
        note: "demo_faucet",
        entries: [
          { accountId: externalId, asset: "ETB", amount: -dto.amountCents },
          { accountId: userEtbId, asset: "ETB", amount: dto.amountCents },
        ],
      });
      await tx.insert(auditLogs).values({
        actorId: userId,
        actorLabel: `user:${userId}`,
        action: "demo_faucet",
        targetType: "account",
        targetId: userEtbId,
        after: { amountCents: dto.amountCents.toString() },
      });
    });

    return this.ledger.balancesForUser(userId);
  }
}
