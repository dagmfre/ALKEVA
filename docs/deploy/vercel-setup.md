# Vercel setup — ALKEVA

Supersedes most of `render-setup.md`. Render now runs one thing: the price worker.

## Why the split looks like this

| Piece | Host | Why |
|---|---|---|
| `apps/web` (Next.js) | Vercel | Native fit. No cold start, global CDN. |
| `apps/api` (NestJS) | Vercel | Runs as one serverless function (`apps/api/api/index.ts`). |
| `apps/worker` (30s price tick) | Render | A tick loop is a long-lived process, not a request. Vercel Hobby cron fires **once a day**, so there is nowhere for it to go. |
| Postgres | Supabase | Unchanged. |
| Redis | Public provider | Render Key Value is internal-only (`ipAllowList: []`) — a Vercel function cannot reach it, and the worker and API must share one instance. |

Two things that changed in the code to make this work:

- `packages/shared` and `packages/db` used to ship raw TypeScript (`main: src/index.ts`). A Vercel function bundles JavaScript, so both now compile to `dist/`. **Anything that installs the workspace must now also build it** — hence the new `buildCommand` in `render.yaml`.
- `apps/api` had no build at all (it ran from source via `@swc-node/register`). It now compiles with `tsc`, which is deliberate: esbuild — what Vercel would otherwise use — cannot emit `emitDecoratorMetadata`, and Nest resolves constructor injection from it. Without it every controller fails to instantiate.

## 0. Prerequisites

```bash
vercel login          # interactive — run it yourself
vercel whoami         # confirm
```

## 1. Redis (do this first — both other steps need the URL)

Render's Key Value service cannot be used any more. Provision one publicly reachable Redis and use **the same URL in all three places** (Vercel API, Render worker, and your local `.env` if you want parity).

Easiest path — Vercel Marketplace:

1. Vercel dashboard → **Storage** → **Marketplace** → a Redis provider (Upstash has a no-card free tier: 256 MB, 500k commands/month).
2. Connect it to the **alkeva-api** project. It injects its own env vars.
3. Copy the **TCP** connection string (`rediss://…`) into `REDIS_URL` — the code uses `ioredis` over TCP, not a REST client.

> The price feed depends on Redis **pub/sub** (`price:tick`), not just key/value. Verify it end-to-end after deploy — see step 5. If a provider turns out not to serve `SUBSCRIBE` over TCP, the SSE push degrades to the API's 90s safety poll and the browser's 10s poll fallback; prices stay correct, they just stop being instant.

Command budget sanity check: the worker publishes ~2 messages per 30s tick ≈ 5,800/day, comfortably inside a 500k/month free tier.

## 2. Project `alkeva-api`

```bash
cd apps/api
vercel link          # create/link a project named alkeva-api
```

Settings → **Root Directory** must be `apps/api`. `vercel.json` there already pins the install/build commands, the catch-all rewrite, and `maxDuration: 300` for SSE.

Environment variables (Production + Preview):

| Key | Value |
|---|---|
| `DATABASE_URL` | Supabase session-pooler string — **no surrounding quotes** |
| `REDIS_URL` | from step 1 |
| `JWT_SECRET` | copy from the old Render API service to keep existing sessions valid; otherwise everyone re-logs-in |
| `JWT_REFRESH_SECRET` | same |
| `WEB_ORIGIN` | the web URL from step 3 (CORS only — the browser reaches the API through the Next proxy, so this is not on the critical path) |
| `DB_POOL_MAX` | `3` — every warm instance keeps its own pool; 10 each would exhaust Supabase's pooler |
| `DB_IDLE_TIMEOUT_SEC` | `20` |
| `FEE_COMMISSION_PCT`, `TREASURY_*`, `SELLBACK_DAILY_CEILING_CENTS`, `COMPLIANCE_REVIEW_THRESHOLD_CENTS`, `PAYOUT_AUTO_APPROVE_MAX_CENTS`, `DEMO_FAUCET_ENABLED` | as they were on Render |
| `CHAPA_SECRET_KEY`, `CHAPA_WEBHOOK_HASH`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `SMTP_*`, `MAIL_FROM` | as they were on Render |

Everything else in `packages/shared/src/env.ts` has a default.

```bash
vercel --prod
```

## 3. Project `alkeva-web`

```bash
cd apps/web
vercel link          # create/link a project named alkeva-web
```

Root Directory `apps/web`. One environment variable:

| Key | Value |
|---|---|
| `API_URL` | the `alkeva-api` production URL, no trailing slash |

```bash
vercel --prod
```

Then go back and set `WEB_ORIGIN` on `alkeva-api` to this URL and redeploy it. (Chicken-and-egg is unavoidable; do API → web → API.)

## 4. Render + Chapa

- Re-sync the blueprint. The `alkeva-api` and `alkeva-web` services and the `alkeva-redis` Key Value store are gone; `alkeva-worker` replaces them.
- Set `DATABASE_URL` and `REDIS_URL` on the worker. `REDIS_URL` **must be the same instance the API uses** or the SSE push never fires.
- **Set up an external uptime pinger** — this is required, not optional. Free Render web services sleep after ~15 min without traffic, and now that the API is on Vercel *no ALKEVA traffic reaches Render at all*. Point cron-job.org / UptimeRobot at `https://alkeva-worker.onrender.com/healthz` every 5 minutes. Without it the price ticks stop.
- Chapa dashboard → Webhooks → change the URL to `https://<alkeva-api-url>/webhooks/chapa`. The signature hash is unchanged.

## 5. Verify

```bash
curl -s https://<api>/healthz
curl -s https://<worker>.onrender.com/healthz     # {"ok":true,"writer":true,"lastTickAt":"…"}
curl -s https://<api>/prices/latest
curl -N -s https://<api>/prices/stream | head -5  # snapshot, then heartbeats
```

The stream check is the pub/sub proof: leave it open past a tick and confirm a **second** `snapshot` event arrives within a couple of seconds of `lastTickAt` advancing. If only heartbeats arrive, pub/sub is not reaching the API — prices are still correct via polling, but the push path is down.

Then the money-core regression through the new origin, exactly as in `docs/manual-tests/phase-6.md`: faucet → quote → settle → receipt, plus zero-sum on all three assets.

## Known consequences of this topology

- **SSE reconnects every ~5 minutes.** 300s is the Vercel function ceiling; `EventSource` reconnects and `PriceProvider` re-subscribes. Expect a brief gap, not a failure.
- **Each SSE viewer pins a function instance** for up to 300s, and each such instance holds its own Redis subscriber and Postgres pool. Fine for a demo; watch it if concurrent viewers grow.
- **Vercel's Hobby plan prohibits commercial use.** ALKEVA is a client's commercial platform — move to Pro before this is anything but a demo/staging deployment.
- **First request to a cold instance pays for the whole Nest bootstrap.** Warm instances reuse the container, so this is a first-hit cost, not a per-request one.

## Go-live ops checklist (production stage, 2026-08-15)

Before real users touch this deployment:

1. **Vercel Pro** — Hobby prohibits commercial use; both `alkeva-web` and `alkeva-api` must move to a Pro team.
2. **Node version alignment** — `.vercel/project.json` / the dashboard setting resolved Node **24.x** while the repo pins **22** (`.node-version`, `engines`). Set the Vercel project Node version to 22.x so all three runtimes match.
3. **`SEED_ADMIN_PASSWORD`** — the schema default is gone. The worker (the only service that runs `db:seed`) must have it set in the Render dashboard, or no administrator is seeded/reset (the seed logs the skip).
4. **`DEMO_FAUCET_ENABLED`** — now defaults to `false`. Leave it unset everywhere in production; only a sandbox environment should ever set it to `true`.
5. **Uptime pinger** (unchanged, still required) — cron-job.org / UptimeRobot → `https://alkeva-worker.onrender.com/healthz` every 5 minutes, or the price loop sleeps.
