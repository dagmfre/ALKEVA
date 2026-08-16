# ALKEVA — Deployment & Operations Guide

Everything needed to run, update, and hand over the deployed platform.
Written 16 Aug 2026, after the migration from Vercel + Render to Google Cloud.

**Live now:** <https://23-251-133-30.sslip.io>

---

## 1. What is deployed, and where

One Compute Engine VM runs five containers behind Caddy. Postgres is the only
piece that lives off-box.

```
                    Internet
                       │  :80 / :443
              ┌────────▼────────┐
              │  caddy          │  TLS (Let's Encrypt), path split
              └───┬─────────┬───┘
       /api/*     │         │   /*
              ┌───▼───┐ ┌───▼───┐
              │  api  │ │  web  │   NestJS  ·  Next.js
              └───┬───┘ └───────┘
                  │
        ┌─────────┼──────────┐
    ┌───▼───┐ ┌───▼────┐ ┌───▼──────────┐
    │ redis │ │ worker │ │  Supabase    │  ← off-box, managed Postgres
    └───────┘ └────────┘ └──────────────┘
```

| Service | Role | Notes |
|---|---|---|
| `caddy` | TLS + reverse proxy | Auto-renews certificates. `/api/*` → api with prefix stripped |
| `web` | Next.js 15 | Server-rendered, 34 routes, 5 locales |
| `api` | NestJS | Ledger, orders, payments, admin, AI, SSE price stream |
| `worker` | Price feed | 30-second tick, publishes `price:tick` to Redis |
| `redis` | Cache / pub-sub | Idempotency keys, WebAuthn challenges, price fan-out |
| `migrate` | One-shot | Runs migrations + seed on every deploy, then exits |

**Why one VM and not Cloud Run:** the price worker is a loop, not a request,
and the API holds open SSE connections with a live Redis subscriber. Both need
a process that stays up. Managed equivalents (Cloud Run × 3 + Memorystore +
Cloud SQL) price at $80–100/month for the same workload — Memorystore alone
costs more than this entire VM.

### Identifiers

| Thing | Value |
|---|---|
| GCP project | `alkeva` (number `199775236542`) |
| Billing account | `019EAA-90BB45-0AC5D4` |
| VM instance | `alkeva`, zone `europe-west1-b`, type `e2-small` |
| Static IP | `23.251.133.30` (reserved as `alkeva-ip`) |
| Firewall rule | `alkeva-allow-web` (tcp:80, tcp:443, tag `alkeva-web`) |
| Hostname | `23-251-133-30.sslip.io` (wildcard DNS — no domain purchased yet) |
| App directory | `/opt/alkeva/app` |
| Secrets | `/opt/alkeva/.env` (chmod 600, never in git, never in the image) |
| SSH user | `hp` |

### Database (Supabase)

Managed Postgres on the free tier, region `eu-west-1`, reached through the
**session pooler on port 5432**. The transaction pooler (6543) is rejected by
`createDb` on purpose — it cannot hold the session state the ledger's row locks
require.

Supabase free tier pauses a project after a week of inactivity. This project is
never idle: the price worker writes a tick every 30 seconds.

---

## 2. What it costs

Measured against the resources actually provisioned, `europe-west1` rates:

| Item | Monthly (USD) |
|---|---|
| `e2-small` VM (2 vCPU burst, 2 GB RAM) | ~13.45 |
| Static external IPv4 | ~3.00 |
| 20 GB pd-balanced boot disk | ~2.20 |
| Network egress (demo-scale) | ~1–3 |
| **Google Cloud subtotal** | **~20–22** |
| Gemini API (light production use) | ~3–10 |
| Supabase / Chapa / Brevo | 0 (free tiers) |
| **Total** | **~25–32 / month** |

Roughly **$300–380/year**, plus a domain at $10–15/year.

**What would change this:**
- **Supabase Pro ($25/mo)** if the free tier's storage or connection limits are
  outgrown.
- **Gemini** scales with usage — cap it with a quota so it cannot surprise you.
- **A bigger disk.** 20 GB is tight (see §6); 40 GB adds ~$2/month.

Check the real number any time: Console → Billing → Cost table, filtered to the
`alkeva` project. That page is also the client's invoice evidence.

---

## 3. Deploying an update — the fast path

**One command, from the repo root:**

```bash
./deploy/ship.sh
```

That ships `HEAD`, rebuilds only what changed, applies migrations, restarts the
app containers, prunes disk, and health-checks the result.

| Flag | Effect |
|---|---|
| *(none)* | Ship the last commit. Production always matches a commit you can point at. |
| `--dirty` | Ship the working tree, including uncommitted edits. For iterating; do not use for a release. |
| `--logs` | Follow the stack's logs after deploying. |

**How long it takes:**

| Change | Time | Why |
|---|---|---|
| Source only (pages, components, API code) | ~4–6 min | Docker reuses the cached `pnpm install`; only `pnpm -r build` re-runs |
| `package.json` or `pnpm-lock.yaml` touched | ~10–14 min | The dependency layer is invalidated — full reinstall |

**Safety properties, by design:**
- The running stack keeps serving while the new image builds. A failed build
  leaves production untouched.
- Only `api`, `web`, `worker` are recreated. Redis keeps its data; Caddy keeps
  its ACME state, so no certificate is re-requested (Let's Encrypt rate-limits
  that).
- Secrets are never in the payload — `/opt/alkeva/.env` is the only copy.
- The previous source tree is kept at `/opt/alkeva/app.old` for inspection.

### Deploying by hand

If the script is unavailable:

```bash
ssh -i ~/.ssh/google_compute_engine hp@23.251.133.30
cd /opt/alkeva/app
docker compose -f deploy/docker-compose.prod.yml build
docker compose -f deploy/docker-compose.prod.yml up -d
docker image prune -f
```

### Changing a secret or config value

No rebuild needed — the env file is read at container start:

```bash
ssh -i ~/.ssh/google_compute_engine hp@23.251.133.30
sudo nano /opt/alkeva/.env
cd /opt/alkeva/app
docker compose -f deploy/docker-compose.prod.yml up -d --force-recreate api web worker
```

### Rolling back

There is no image registry, so rollback means rebuilding an older commit:

```bash
git checkout <good-commit>
./deploy/ship.sh
git checkout main
```

Database migrations do **not** roll back. Migration `0009` (locale enum → text)
is one-way. Treat schema changes as forward-only.

---

## 4. Everyday operations

All commands run on the VM inside `/opt/alkeva/app`. Set an alias first:

```bash
alias dc='docker compose -f deploy/docker-compose.prod.yml'
```

| Task | Command |
|---|---|
| Service status | `dc ps` |
| Live logs | `dc logs -f api web worker` |
| One service's logs | `dc logs --tail=100 api` |
| Restart one service | `dc restart api` |
| Restart everything | `dc up -d --force-recreate` |
| Stop everything | `dc down` (data volumes survive) |
| Disk usage | `df -h /` and `docker system df` |
| Reclaim disk | `docker image prune -f && docker builder prune -af` |
| Reseed / re-migrate | `dc up -d migrate` |

**Connecting to the VM:**

```bash
ssh -i ~/.ssh/google_compute_engine hp@23.251.133.30
```

Use OpenSSH rather than `gcloud compute ssh` on Windows — gcloud shells out to
PuTTY/plink, which dropped connections repeatedly during this deployment. It is
the same key either way.

**If the VM needs a reboot:** everything restarts automatically
(`restart: unless-stopped` plus Docker's systemd unit). No cron, no pinger.

---

## 5. Health checks

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://23-251-133-30.sslip.io/welcome
curl -s https://23-251-133-30.sslip.io/api/healthz
curl -s https://23-251-133-30.sslip.io/api/prices/latest
```

A healthy price response has `"stale": false` and an `at` timestamp within the
last minute. If it is stale, check the worker: `dc logs --tail=30 worker`.

**Ledger integrity** — the invariant that matters most. Every asset must sum to
exactly zero:

```sql
select asset, sum(amount) from ledger_entry group by asset;
```

Any non-zero row means money was created or destroyed. That should be
impossible (a database trigger enforces it), but it is the first thing to check
if anything looks wrong.

---

## 6. Known issues and their fixes

**Disk fills during builds.** Each build leaves a ~2.7 GB image plus build
cache; 20 GB fills after about three deploys, and the box gets flaky mid-build.
`ship.sh` prunes every run, which contains it. The durable fix is a bigger disk:

```bash
gcloud compute disks resize alkeva --size=40GB --zone=europe-west1-b --project=alkeva
ssh -i ~/.ssh/google_compute_engine hp@23.251.133.30 "sudo resize2fs /dev/sda1"
```

Costs ~$2/month more. Recommended before demo day — a deploy that can wedge the
box is a bad trade for $2.

**`next build` needs more RAM than an `e2-small` has.** Handled by a 4 GB swap
file created at provisioning (`deploy/vm-startup.sh`). Do not remove it.

**Docker logs.** Capped at 10 MB × 3 per container via
`/etc/docker/daemon.json`. Without that a chatty container fills the disk.

---

## 7. Before going live

### 7.1 Buy and attach a real domain

`23-251-133-30.sslip.io` works and has a valid certificate, but it does not read
as a finished product in front of investors. A `.com` is $10–15/year.

1. **Buy** the domain (Namecheap, Cloudflare, Porkbun — any registrar).
2. **Point it at the VM.** Create two DNS A records:

   | Type | Name | Value | TTL |
   |---|---|---|---|
   | A | `@` | `23.251.133.30` | 300 |
   | A | `www` | `23.251.133.30` | 300 |

3. **Wait for propagation**, then verify: `nslookup alkeva.com` returns
   `23.251.133.30`. Do not proceed until it does — Caddy's certificate request
   fails against a domain that does not resolve, and Let's Encrypt rate-limits
   repeated failures.
4. **Update the env file** on the VM (`sudo nano /opt/alkeva/.env`) — five
   values, all of them origin-bound:

   ```
   ALKEVA_DOMAIN=alkeva.com
   WEB_ORIGIN=https://alkeva.com
   WEBAUTHN_RP_ID=alkeva.com
   WEBAUTHN_ORIGIN=https://alkeva.com
   MAIL_FROM=ALKEVA <no-reply@alkeva.com>
   ```

5. **Restart:** `dc up -d --force-recreate` — Caddy requests the new
   certificate automatically, usually within 30 seconds.
6. **Re-point the two external dashboards:**
   - Google Cloud Console → Credentials → OAuth client → authorised redirect
     URI → `https://alkeva.com/auth/google/callback`
   - Chapa dashboard → webhook → `https://alkeva.com/api/webhooks/chapa`
     (the `/api` prefix is required; Caddy strips it before Nest sees it)

**Passkeys enrolled on the old hostname stop working.** WebAuthn credentials
bind to the RP ID. Anyone enrolled must re-enrol. Harmless before launch, but
do not let it surprise you mid-demo.

### 7.2 Billing separation (outstanding)

The `alkeva` project currently shares billing account `019EAA-90BB45-0AC5D4`
with a personal Gemini project. To bill the client cleanly:

1. Console → Billing → Manage billing accounts → **Create account**, name it
   `ALKEVA`.
2. Link **only** the `alkeva` project to it.
3. Create the Gemini API key **inside the `alkeva` project** (AI Studio, with
   `alkeva` selected) and put it in `/opt/alkeva/.env`. Restrict it to the
   Generative Language API and set a quota cap. **Delete the old key** — a key
   that still exists still bills.
4. Set a **budget alert**: $50/month, notify at 50 / 90 / 100 %.
5. At handover, make the client a Billing Account Administrator and move the
   project to a billing account on his card. Projects change billing accounts
   with no redeploy and no downtime.

### 7.3 Decommission the old hosts

Only after the new origin passes a full manual test:

- **Render** → delete `alkeva-worker`. It was double-writing price ticks
  alongside the new worker during the migration. It is quiet now; a wake-up
  restarts the overlap.
- **Vercel** → delete or pause `alkeva-web` and `alkeva-api`. They run older
  code against the *same* database — including code that predates migration
  0009.
- Cancel any external uptime pinger.
- **Keep Supabase.**

### 7.4 Security checklist

- [ ] Rotate the Supabase database password (it has been pasted into chat
      transcripts more than once)
- [ ] Rotate `JWT_SECRET` and `JWT_REFRESH_SECRET` — currently shared with the
      old Vercel deployment. Rotating logs everyone out, so do it at a quiet
      moment, not mid-demo
- [ ] Confirm `SEED_ADMIN_PASSWORD` is strong and not reused
- [ ] Confirm `DEMO_FAUCET_ENABLED=false`
- [ ] Swap Chapa test keys for live keys when the merchant account is signed
- [ ] Review the copyright page: the certificate scan shows the owner's
      personal phone number and address

---

## 8. The 3-minute demo run sheet

For recording a walkthrough. Two sign-ins, so open a private window for the
admin half. Full step-by-step tests live in `docs/manual-tests/phase-7.md`.

**0:00 — Landing (20s)**
Open `https://<domain>/welcome`. The gold price on screen is the live feed, not
a mock. Switch the language picker to Amharic — the whole page changes. Click
**View copyright registration** to show the Ethiopian IP Authority certificate.

**0:20 — Sign up and identity (25s)**
Register an account. Accept the terms. Land on the dashboard: balances, live
market cards, portfolio. Open **Identity check**, upload a document, submit.

**0:45 — Deposit (25s)**
**Deposit** → enter 5,000 ETB → Chapa hosted checkout (sandbox) → pay → return.
The balance updates only after the server verifies the payment with Chapa —
never on the browser's word.

**1:10 — Buy gold (35s)**
**Trade** → Buy → 2 grams. A quote appears with a countdown ring: the price is
locked for 30 seconds. Show the fee breakdown, confirm before it expires, land
on the settled receipt with its serial number. Say the line that matters: *the
platform never sells a gram the vault does not hold — that gate runs inside the
transaction.*

**1:45 — Portfolio and the vault (25s)**
**Portfolio** → holdings, cost basis, gain/loss, the 3D bar sized to the actual
grams held, tier progress and badges.

**2:10 — The AI assistant (25s)**
**Assistant** → ask in Amharic: *"የወርቅ ዋጋ ዛሬ ስንት ነው?"* It answers with the same
live price shown on the dashboard. Ask *"should I buy now?"* — it declines to
advise. It is read-only: it cannot trade, approve, or move money.

**2:35 — Admin (25s)**
Private window → sign in as admin → **Admin console**. Approve the KYC document
submitted at 0:45. Show the audit log: every privileged action is recorded with
an actor. Show treasury reserves.

**3:00 — Close**
Sell 1 gram back and show the ledger balancing, or end on the admin analytics
chart.

**Do not show:** the faucet (disabled), raw `.env` files, or the Supabase
dashboard.

---

## 9. Where things live in the repo

| Path | What |
|---|---|
| `Dockerfile` | One image, four entrypoints (web · api · worker · migrate) |
| `deploy/docker-compose.prod.yml` | The production stack |
| `deploy/Caddyfile` | TLS, path routing, SSE buffering disabled |
| `deploy/ship.sh` | One-command deploy |
| `deploy/vm-startup.sh` | VM provisioning (swap, Docker, log rotation) |
| `deploy/env.production.example` | Documented env template |
| `docs/deploy/gcp-setup.md` | First-time provisioning from scratch |
| `docs/manual-tests/phase-7.md` | 62-step manual verification |
| `packages/db/migrations/` | Schema history — forward-only |
| `CLAUDE.md` | Project state, decision log, progress log |
