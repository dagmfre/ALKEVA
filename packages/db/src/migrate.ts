import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadDotenvUpwards } from "@alkeva/shared";
import { createDb } from "./index.js";

loadDotenvUpwards();
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations",
);

const { db, client } = createDb(databaseUrl, { max: 1 });

try {
  await migrate(db, { migrationsFolder });
  console.log("✓ migrations applied");
} finally {
  await client.end();
}
