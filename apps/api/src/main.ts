import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { loadDotenvUpwards, loadEnv } from "@alkeva/shared";
import { AppModule } from "./app.module.js";

loadDotenvUpwards();
const env = loadEnv();

const app = await NestFactory.create(AppModule);
app.use(cookieParser());
// The browser normally reaches this API through the Next.js rewrite proxy
// (first-party cookies); CORS is for direct dev access and tooling.
app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
app.enableShutdownHooks();

await app.listen(env.API_PORT);
console.log(`ALKEVA API listening on :${env.API_PORT}`);
