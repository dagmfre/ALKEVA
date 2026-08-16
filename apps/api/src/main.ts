import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { loadDotenvUpwards, loadEnv } from "@alkeva/shared";
import { AppModule } from "./app.module.js";

loadDotenvUpwards();
const env = loadEnv();

// rawBody: Chapa signs webhook payloads with HMAC-SHA256 over the exact bytes
// it sent — verification must run on req.rawBody, never on re-serialized JSON.
const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

// Exactly one proxy hop sits in front of this process (Caddy, on the same
// Docker network — see deploy/Caddyfile). Without this, express reports every
// request as coming from Caddy's container IP and @nestjs/throttler collapses
// into one shared bucket for the entire platform: a single noisy client would
// rate-limit everybody. `1` and not `true` on purpose — trusting the whole
// chain would let a client forge X-Forwarded-For and evade the limiter.
app.set("trust proxy", 1);

app.use(cookieParser());
// The browser normally reaches this API through the Next.js rewrite proxy
// (first-party cookies); CORS is for direct dev access and tooling.
app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
app.enableShutdownHooks();

await app.listen(env.API_PORT);
console.log(`ALKEVA API listening on :${env.API_PORT}`);
