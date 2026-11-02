import type { Redis } from "ioredis";

/**
 * Runs `fn` only if this process wins a Redis lock, so a background sweep
 * runs once even when several API instances are up. The lock expires on its
 * own if the process dies mid-run.
 */
export async function runExclusive(
  redis: Redis,
  key: string,
  ttlSeconds: number,
  fn: () => Promise<void>,
): Promise<void> {
  const won = await redis.set(key, String(process.pid), "EX", ttlSeconds, "NX");
  if (!won) return;
  try {
    await fn();
  } finally {
    await redis.del(key).catch(() => undefined);
  }
}

/** A background interval that never keeps the process alive and never throws. */
export function every(ms: number, label: string, fn: () => Promise<void>): NodeJS.Timeout {
  const timer = setInterval(() => {
    fn().catch((err) => console.error(`${label} failed:`, err));
  }, ms);
  timer.unref();
  return timer;
}
