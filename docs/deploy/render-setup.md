# Render + Supabase deploy — dashboard steps (for Dagmfre)

The repo contains `render.yaml` (blueprint for api, web, key-value — all **free tier**). Secrets are pasted in the dashboard only — never into the repo or chat.

> **Free-tier note:** Render has no free background-worker service, so the price-tick loop runs *inside* the api web service (backgrounded before the API starts). Migrations + seed also run at the start of the api service (free tier has no `preDeployCommand`). Free web services sleep after ~15 min idle → the first hit cold-starts ~50s and ticks pause while asleep; the dashboard's ~30s price polling keeps the instance warm during an active demo.

## One-time setup (~15 minutes)

### 1. Supabase connection string
1. Supabase dashboard → your project → **Connect** (top bar) → **Session pooler** tab.
2. Copy the URI (looks like `postgres://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres`). Insert your DB password.
3. Keep it handy — it's pasted twice below (api + worker).

### 2. Create the blueprint
1. Render dashboard → **New** → **Blueprint** → connect the `dagmfre/ALKEVA` GitHub repo → branch `main`.
2. Render reads `render.yaml` and lists 3 resources: `alkeva-api`, `alkeva-web`, `alkeva-redis`.
3. Fill the prompted values:
   | Key | Service | Value |
   |---|---|---|
   | `DATABASE_URL` | api | the Supabase session-pooler URI |
   | `WEB_ORIGIN` | api | `https://alkeva-web.onrender.com` |
   | `API_URL` | web | `https://alkeva-api.onrender.com` |
   | `SEED_ADMIN_EMAIL` | api | your real admin email |
   | `SEED_ADMIN_PASSWORD` | api | a strong password (this becomes the admin login) |
   *(If Render gives the services different URLs than above — e.g. a suffix like `alkeva-web-xyz1` — use the URLs it actually assigned.)*
4. **Apply**. First build takes ~5–10 min. The api runs migrations + seed automatically at the start of its start command, then backgrounds the price worker and starts the API.

### 3. Verify
1. `https://alkeva-api.onrender.com/healthz` → `"db":"ok","redis":"ok"`; `priceFeed` turns `"ok"` within a minute of the worker starting.
2. Open `https://alkeva-web.onrender.com` → register → dashboard shows live prices.
3. Run manual-test steps 24–26 (`docs/manual-tests/phase-1.md`).

## Notes
- **Instance types:** blueprint sets `free` for api + web. Free instances sleep after ~15 min idle and cold-start ~50s. For the live investor demo, either keep the dashboard open (its ~30s polling keeps the api warm) or upgrade api + web to `starter` (~$7/service/mo) shortly before the demo and downgrade after. To upgrade a paid api, you can also move `pnpm db:migrate && pnpm db:seed` back into a `preDeployCommand` (paid-only) and run the worker as its own `type: worker` service.
- **Auto-deploy:** every push to `main` redeploys the changed services. That's the daily-push workflow.
- **Logs:** each service → **Logs** tab. The api service prints a price-tick line every ~30s (the worker runs inside it).
- **Rollback:** service → **Events** → previous deploy → **Rollback**.
- **Portability:** nothing in the code is Render-specific — the same repo runs on any VPS with `docker compose up`, `pnpm db:migrate && pnpm db:seed`, and the three `pnpm --filter … start` commands behind a reverse proxy.
