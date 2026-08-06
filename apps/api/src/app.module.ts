import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "./auth/auth.module.js";
import { CoreModule } from "./core/core.module.js";
import { HealthController } from "./health/health.controller.js";
import { PricesModule } from "./prices/prices.module.js";

@Module({
  imports: [
    CoreModule,
    // Baseline API rate limit; sensitive endpoints tighten with @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    AuthModule,
    PricesModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
