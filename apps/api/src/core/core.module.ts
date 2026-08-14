import {
  Global,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { Redis } from "ioredis";
import { createDb, type Db } from "@alkeva/db";
import { loadEnv, type Env } from "@alkeva/shared";

export const ENV = "ENV";
export const DB = "DB";
export const DB_CLIENT = "DB_CLIENT";
export const REDIS = "REDIS";

@Injectable()
class CoreShutdown implements OnApplicationShutdown {
  constructor(
    @Inject(DB_CLIENT) private readonly bundle: ReturnType<typeof createDb>,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async onApplicationShutdown() {
    await Promise.allSettled([this.bundle.client.end(), this.redis.quit()]);
  }
}

/**
 * Global infrastructure module: validated env, Drizzle db, Redis.
 * Feature modules inject these by token.
 */
@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: (): Env => loadEnv() },
    {
      provide: DB_CLIENT,
      useFactory: (env: Env) =>
        createDb(env.DATABASE_URL, {
          max: env.DB_POOL_MAX,
          idleTimeoutSec: env.DB_IDLE_TIMEOUT_SEC,
        }),
      inject: [ENV],
    },
    {
      provide: DB,
      useFactory: (bundle: ReturnType<typeof createDb>): Db => bundle.db,
      inject: [DB_CLIENT],
    },
    {
      provide: REDIS,
      useFactory: (env: Env) => new Redis(env.REDIS_URL, { lazyConnect: false }),
      inject: [ENV],
    },
    CoreShutdown,
  ],
  exports: [ENV, DB, REDIS],
})
export class CoreModule {}
