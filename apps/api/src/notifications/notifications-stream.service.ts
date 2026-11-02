import {
  Inject,
  Injectable,
  type MessageEvent,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { Redis } from "ioredis";
import { filter, interval, map, merge, Observable, Subject } from "rxjs";
import { REDIS } from "../core/core.module.js";

const HEARTBEAT_MS = 25_000;

/**
 * Live notices for open tabs. Both the API (NotificationsService.emit) and the
 * worker (price alerts) publish `notify:<userId>` on Redis; one pattern
 * subscription per API process fans each message out to that user's open
 * streams only. The stream carries "something new" — the browser then
 * refetches the list over the ordinary authenticated endpoint.
 */
@Injectable()
export class NotificationsStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly events$ = new Subject<{ userId: string; data: string }>();
  private sub: Redis | null = null;

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  onModuleInit(): void {
    this.sub = this.redis.duplicate();
    void this.sub.psubscribe("notify:*").catch((err: Error) => {
      console.error(`notification stream: psubscribe failed: ${err.message}`);
    });
    this.sub.on("pmessage", (_pattern: string, channel: string, message: string) => {
      this.events$.next({ userId: channel.slice("notify:".length), data: message });
    });
  }

  onModuleDestroy(): void {
    this.events$.complete();
    void this.sub?.quit().catch(() => undefined);
  }

  stream(userId: string): Observable<MessageEvent> {
    return merge(
      this.events$.pipe(
        filter((e) => e.userId === userId),
        map((e): MessageEvent => ({ type: "notification", data: e.data })),
      ),
      interval(HEARTBEAT_MS).pipe(map((): MessageEvent => ({ type: "heartbeat", data: "" }))),
    );
  }
}
