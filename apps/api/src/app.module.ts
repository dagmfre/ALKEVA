import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AdminModule } from "./admin/admin.module.js";
import { AiModule } from "./ai/ai.module.js";
import { AlertsModule } from "./alerts/alerts.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { CoreModule } from "./core/core.module.js";
import { FaucetModule } from "./faucet/faucet.module.js";
import { HealthController } from "./health/health.controller.js";
import { KycModule } from "./kyc/kyc.module.js";
import { LedgerModule } from "./ledger/ledger.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { OrdersModule } from "./orders/orders.module.js";
import { PaymentsModule } from "./payments/payments.module.js";
import { PayoutsModule } from "./payouts/payouts.module.js";
import { PortfolioModule } from "./portfolio/portfolio.module.js";
import { PricesModule } from "./prices/prices.module.js";
import { QuotesModule } from "./quotes/quotes.module.js";
import { TreasuryModule } from "./treasury/treasury.module.js";
import { WebhooksModule } from "./webhooks/webhooks.module.js";

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
    PortfolioModule,
    TreasuryModule,
    NotificationsModule,
    PaymentsModule,
    PayoutsModule,
    KycModule,
    WebhooksModule,
    AdminModule,
    AiModule,
    AlertsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
