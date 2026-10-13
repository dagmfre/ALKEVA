import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export * as schema from "./schema.js";
export * from "./schema.js";

export type Db = ReturnType<typeof createDb>["db"];

/**
 * Creates a Drizzle client over postgres-js.
 * `max` stays small — Supabase's session pooler and Render instances are modest.
 * `idleTimeoutSec` releases idle connections: a serverless instance can be
 * frozen mid-life, and connections it never closes stay checked out on the
 * pooler until Supabase reaps them. 0 keeps them open indefinitely.
 */
export function createDb(
  databaseUrl: string,
  opts?: { max?: number; idleTimeoutSec?: number },
) {
  // Defend against a common dashboard paste mistake: surrounding quotes or stray
  // whitespace. Without this, postgres-js fails to parse the URL and silently
  // falls back to localhost:5432 (ECONNREFUSED in production).
  const url = databaseUrl.trim().replace(/^["']|["']$/g, "");
  if (!/^postgres(ql)?:\/\//i.test(url)) {
    throw new Error(
      `DATABASE_URL is not a valid postgres connection string (must start with postgres:// or postgresql://). ` +
        `Check for surrounding quotes or a wrong value in the environment.`,
    );
  }
  // Supabase requires SSL; a local Postgres does not offer it. `sslmode=disable`
  // in the URL is the explicit opt-out for a database on a private network that
  // is not localhost — the compose `postgres` service on the VPS. It has to be
  // honoured here: postgres-js lets an explicit `ssl` option override the URL's
  // sslmode, so without this check the URL's opt-out would be silently ignored.
  const noSsl =
    /[?&]sslmode=disable(&|$)/i.test(url) ||
    url.includes("localhost") ||
    url.includes("127.0.0.1");
  const client = postgres(url, {
    max: opts?.max ?? 10,
    idle_timeout: opts?.idleTimeoutSec ?? 20,
    ssl: noSsl ? false : "require",
  });
  const db = drizzle(client, { schema });
  return { db, client };
}
