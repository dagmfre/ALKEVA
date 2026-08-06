import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export * as schema from "./schema.js";
export * from "./schema.js";

export type Db = ReturnType<typeof createDb>["db"];

/**
 * Creates a Drizzle client over postgres-js.
 * `max` stays small — Supabase's session pooler and Render instances are modest.
 */
export function createDb(databaseUrl: string, opts?: { max?: number }) {
  const client = postgres(databaseUrl, {
    max: opts?.max ?? 10,
    // Supabase requires SSL in production; local docker does not offer it.
    ssl: databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1")
      ? false
      : "require",
  });
  const db = drizzle(client, { schema });
  return { db, client };
}
