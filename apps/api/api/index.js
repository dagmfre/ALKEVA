// @ts-check
/**
 * Vercel serverless entrypoint for the NestJS API.
 *
 * `src/main.ts` stays the entrypoint for local dev and for anything that runs
 * the API as a long-lived process; this file is the same application wired for
 * a platform that hands us one request at a time.
 *
 * Four decisions worth knowing:
 *
 * 1. This file is plain JavaScript on purpose. Vercel's Node builder compiles a
 *    TypeScript entrypoint itself, and that path emitted nothing here — the
 *    deployment failed with the builder's "Division by zero" on zero output
 *    artifacts. It is glue code importing already-compiled JS, so there is
 *    nothing for TypeScript to do. It is still type-checked: `@ts-check` plus
 *    tsconfig.entry.json cover it (`pnpm typecheck:entry`).
 *
 * 2. We export an `http.Server`, not a `(req, res)` handler. Vercel's Node
 *    helpers wrap handler-style exports and can consume the request body
 *    before it reaches us — that would silently break Chapa webhook
 *    verification, which HMACs the exact bytes Chapa sent. A server export
 *    receives the untouched `IncomingMessage`, so `rawBody` survives.
 *
 * 3. Bootstrap is lazy and memoised on the module scope. Vercel reuses a warm
 *    instance across invocations, so Nest is constructed once per instance and
 *    every later request reuses the same DI container, Postgres pool and Redis
 *    connection. The first request on a cold instance pays for it.
 *
 * 4. We import from `../dist/`, not `../src/`. `pnpm build` pre-compiles the
 *    app with tsc, which is what emits the `design:paramtypes` metadata Nest
 *    needs to resolve constructor injection.
 */

// MUST be first: ESM evaluates imports in declaration order, and the decorators
// inside dist/app.module.js run at evaluation time. The __metadata helper
// silently no-ops if Reflect.metadata is not yet installed, so importing this
// any later produces an app whose classes carry no design:paramtypes — Nest
// then fails to resolve every constructor.
import "reflect-metadata";
import http from "node:http";
import { NestFactory } from "@nestjs/core";
// Imported explicitly rather than letting NestFactory.create() pick the adapter
// itself: that path uses a dynamic require, which Vercel's static dependency
// tracer does not follow, and the package would be missing from the bundle.
// The no-arg constructor creates its own express instance.
import { ExpressAdapter } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { loadEnv } from "@alkeva/shared";
import { AppModule } from "../dist/server.js";

/** @typedef {(req: http.IncomingMessage, res: http.ServerResponse) => void} NodeHandler */

// Read on the module scope so a misconfigured deployment fails on the first
// request with a clear message rather than half-serving traffic.
const env = loadEnv();

/** @type {Promise<NodeHandler> | null} */
let ready = null;

/** @returns {Promise<NodeHandler>} */
async function bootstrap() {
  // rawBody: Chapa signs webhook payloads with HMAC-SHA256 over the exact bytes
  // it sent — verification must run on req.rawBody, never on re-serialized JSON.
  const app = await NestFactory.create(AppModule, new ExpressAdapter(), {
    rawBody: true,
  });
  app.use(cookieParser());
  // The browser normally reaches this API through the Next.js rewrite proxy
  // (first-party cookies); CORS is for direct access and tooling.
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });

  // init(), not listen() — the platform owns the socket. No shutdown hooks:
  // the pooled Postgres/Redis connections are meant to outlive a request and
  // tearing them down on SIGTERM would cut off in-flight work.
  await app.init();

  return /** @type {NodeHandler} */ (app.getHttpAdapter().getInstance());
}

const server = http.createServer((req, res) => {
  (ready ??= bootstrap()).then(
    (handler) => handler(req, res),
    (err) => {
      // A failed bootstrap must not poison the instance — the next request
      // retries rather than inheriting a rejected promise forever.
      ready = null;
      console.error(`api bootstrap failed: ${err.stack ?? err.message}`);
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ message: "api_unavailable" }));
    },
  );
});

export default server;
