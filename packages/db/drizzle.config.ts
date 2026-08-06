import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://alkeva:alkeva_local@localhost:5432/alkeva",
  },
  strict: true,
  verbose: true,
});
