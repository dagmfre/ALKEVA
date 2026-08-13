import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import type { MessageEvent } from "@nestjs/common";
import { Redis } from "ioredis";
import { defer, interval, map, merge, Observable, Subject } from "rxjs";
import type { PriceSnapshotResponse } from "@alkeva/shared";
import { REDIS } from "../core/core.module.js";
import { PricesService } from "./prices.service.js";

/** Redis channel the worker publishes to after every price_tick insert. */
export const PRICE_TICK_CHANNEL = "price:tick";

/** XAU and XPT land ~together each tick — coalesce them into one snapshot broadcast. */
const DEBOUNCE_MS = 300;
/** Keeps proxies (Render edge, Next fetch) from idling out the SSE connection. */
const HEARTBEAT_MS = 25_000;
/** If pub/sub goes quiet this long while someone is listening, re-check the table directly. */
const SAFETY_POLL_MS = 90_000;

/**
 * Live price fan-out. The worker is a separate OS process (even on Render it is
 * backgrounded in the same startCommand), so in-process events can't see its
 * inserts — Redis pub/sub is the signal, and a periodic safety poll covers a
 * dropped subscriber connection. Every browser on /prices/stream receives the
 * identical PriceSnapshotResponse the moment a tick lands.
 */
@Injectable()
export class PriceFeedService implements OnModuleInit, OnModuleDestroy {
  private readonly snapshots$ = new Subject<PriceSnapshotResponse>();
  private sub: Redis | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private safetyTimer: NodeJS.Timeout | null = null;
  private subscriberCount = 0;
  private lastBroadcastAt = "";

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly prices: PricesService,
  ) {}

  onModuleInit(): void {
    // A connection in subscriber mode can't run other commands — duplicate it.
    this.sub = this.redis.duplicate();
    void this.sub.subscribe(PRICE_TICK_CHANNEL).catch((err: Error) => {
      console.error(`price feed: subscribe failed: ${err.message}`);
    });
    this.sub.on("message", () => this.scheduleBroadcast());
    this.safetyTimer = setInterval(() => void this.safetyCheck(), SAFETY_POLL_MS);
  }

  onModuleDestroy(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.safetyTimer) clearInterval(this.safetyTimer);
    this.snapshots$.complete();
    void this.sub?.quit().catch(() => undefined);
  }

  private scheduleBroadcast(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.broadcast();
    }, DEBOUNCE_MS);
  }

  private async broadcast(): Promise<void> {
    try {
      const snapshot = await this.prices.snapshot();
      const newest = snapshot.prices.map((p) => p.at).sort().at(-1) ?? "";
      this.lastBroadcastAt = newest;
      this.snapshots$.next(snapshot);
    } catch (err) {
      // A failed snapshot must never kill the stream; the next signal retries.
      console.error(`price feed: snapshot failed: ${(err as Error).message}`);
    }
  }

  /** Covers a silently-dead pub/sub connection: if ticks advanced without a message, broadcast. */
  private async safetyCheck(): Promise<void> {
    if (this.subscriberCount === 0) return;
    try {
      const snapshot = await this.prices.snapshot();
      const newest = snapshot.prices.map((p) => p.at).sort().at(-1) ?? "";
      if (newest && newest !== this.lastBroadcastAt) {
        this.lastBroadcastAt = newest;
        this.snapshots$.next(snapshot);
      }
    } catch {
      // Table unreachable — nothing to broadcast; clients keep their staleness ratchet.
    }
  }

  /** SSE observable: immediate snapshot, then every broadcast, plus keep-alive heartbeats. */
  stream(): Observable<MessageEvent> {
    return new Observable<MessageEvent>((observer) => {
      this.subscriberCount++;
      const inner = merge(
        defer(() => this.prices.snapshot()).pipe(
          map((s): MessageEvent => ({ type: "snapshot", data: s })),
        ),
        this.snapshots$.pipe(map((s): MessageEvent => ({ type: "snapshot", data: s }))),
        interval(HEARTBEAT_MS).pipe(map((): MessageEvent => ({ type: "heartbeat", data: "" }))),
      ).subscribe(observer);
      return () => {
        this.subscriberCount--;
        inner.unsubscribe();
      };
    });
  }
}
