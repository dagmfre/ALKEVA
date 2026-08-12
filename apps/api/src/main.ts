import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { loadDotenvUpwards, loadEnv } from "@alkeva/shared";
import { AppModule } from "./app.module.js";

loadDotenvUpwards();
const env = loadEnv();

// rawBody: Chapa signs webhook payloads with HMAC-SHA256 over the exact bytes
// it sent — verification must run on req.rawBody, never on re-serialized JSON.
const app = await NestFactory.create(AppModule, { rawBody: true });
app.use(cookieParser());
// The browser normally reaches this API through the Next.js rewrite proxy
// (first-party cookies); CORS is for direct dev access and tooling.
app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
app.enableShutdownHooks();

await app.listen(env.API_PORT);
console.log(`ALKEVA API listening on :${env.API_PORT}`);
