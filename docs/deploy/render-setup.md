# Render + Supabase deploy — dashboard steps (for Dagmfre)

The repo contains `render.yaml` (blueprint for api, web, worker, key-value). Secrets are pasted in the dashboard only — never into the repo or chat.

## One-time setup (~15 minutes)

### 1. Supabase connection string
1. Supabase dashboard → your project → **Connect** (top bar) → **Session pooler** tab.
2. Copy the URI (looks like `postgres://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres`). Insert your DB password.
3. Keep it handy — it's pasted twice below (api + worker).

### 2. Create the blueprint
1. Render dashboard → **New** → **Blueprint** → connect the `dagmfre/ALKEVA` GitHub repo → branch `main`.
2. Render reads `render.yaml` and lists 4 resources: `alkeva-api`, `alkeva-web`, `alkeva-worker`, `alkeva-redis`.
3. Fill the prompted values:
   | Key | Service | Value |
   |---|---|---|
   | `DATABASE_URL` | api AND worker | the Supabase session-pooler URI |
   | `WEB_ORIGIN` | api | `https://alkeva-web.onrender.com` |
   | `API_URL` | web | `https://alkeva-api.onrender.com` |
   | `SEED_ADMIN_EMAIL` | api | your real admin email |
   | `SEED_ADMIN_PASSWORD` | api | a strong password (this becomes the admin login) |
   *(If Render gives the services different URLs than above — e.g. a suffix like `alkeva-web-xyz1` — use the URLs it actually assigned.)*
4. **Apply**. First build takes ~5–10 min. The api runs migrations + seed automatically before starting (`preDeployCommand`).

### 3. Verify
1. `https://alkeva-api.onrender.com/healthz` → `"db":"ok","redis":"ok"`; `priceFeed` turns `"ok"` within a minute of the worker starting.
2. Open `https://alkeva-web.onrender.com` → register → dashboard shows live prices.
3. Run manual-test steps 24–26 (`docs/manual-tests/phase-1.md`).

## Notes
- **Instance types:** blueprint sets `starter` (paid) for web/api/worker deliberately — free instances sleep and would cold-start ~50s in front of investors. ~$7/service/month; downgrade after the demo if you like.
- **Auto-deploy:** every push to `main` redeploys the changed services. That's the daily-push workflow.
- **Logs:** each service → **Logs** tab. The worker should print a price line every 30s.
- **Rollback:** service → **Events** → previous deploy → **Rollback**.
- **Portability:** nothing in the code is Render-specific — the same repo runs on any VPS with `docker compose up`, `pnpm db:migrate && pnpm db:seed`, and the three `pnpm --filter … start` commands behind a reverse proxy.
