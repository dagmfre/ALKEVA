import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "./auth/auth.module.js";
import { CoreModule } from "./core/core.module.js";
import { FaucetModule } from "./faucet/faucet.module.js";
import { HealthController } from "./health/health.controller.js";
import { LedgerModule } from "./ledger/ledger.module.js";
import { OrdersModule } from "./orders/orders.module.js";
import { PricesModule } from "./prices/prices.module.js";
import { QuotesModule } from "./quotes/quotes.module.js";

@Module({
  imports: [
    CoreModule,
    // Baseline API rate limit; sensitive endpoints tighten with @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    AuthModule,
    PricesModule,
    LedgerModule,
    FaucetModule,
    QuotesModule,
    OrdersModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
