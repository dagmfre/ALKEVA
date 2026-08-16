# ALKEVA on Google Cloud — setup runbook

Target shape (decided 16 Aug 2026): **one Compute Engine VM** running web, API,
price worker, Redis and Caddy in Docker. **Postgres stays on Supabase.** This
replaces the Vercel (web + API) + Render (worker) split.

Steady-state cost: **≈ $20–23/month**, of which ~$17 is Google Cloud and the
rest is Gemini API usage. Nothing here is on a free tier that can expire.

Steps marked **[you]** need a browser or an interactive login and cannot be run
by an agent.

---

## Why this shape

| Constraint | Consequence |
|---|---|
| The price worker is a 30-second loop, not a request | It needs a process that never sleeps. Cloud Run's request model and Cloud Scheduler's 1-minute floor both fail it. |
| The API holds an SSE stream with a live Redis subscriber | Same — a long-lived process, and Redis must be reachable from it. |
| Worker and API must share one Redis | On the Vercel/Render split this forced a *publicly reachable* Redis. On one VM it is `redis://redis:6379` on a private Docker network. |
| Managed equivalents are disproportionate | Memorystore Basic 1 GB alone is ~$36/mo — more than this entire VM. |

Rejected alternatives and their costs are in the session record; the short
version is Cloud Run + Memorystore + Cloud SQL lands at $80–100/mo for the
same demo.

---

## 1. Billing separation **[you]**

Do this **before** creating any resource. The billing account — not the project
— is the payment boundary, and it is what produces a clean invoice you can hand
the client.

1. **Create a new billing account.** Console → Billing → *Manage billing
   accounts* → *Create account*. Name it `ALKEVA`. Put your card on it for now;
   it moves to the client's card later with one click and no downtime.
2. **Create a new project** `alkeva-prod` and link it to the `ALKEVA` billing
   account only.
3. **Never run anything of yours in `alkeva-prod`,** and never use its API keys
   outside it. That discipline is the whole mechanism — with one project per
   billing account, cost attribution needs no manual work.
4. **Set a budget:** Billing → Budgets & alerts → $50/month, alerts at 50 / 90 /
   100 %. Add the client's email as a recipient once he has one on the project.
5. **Reporting the client:** the monthly invoice PDF for the `ALKEVA` billing
   account *is* the report. For line items, Billing → Cost table → export CSV.
6. **Handover later:** make the client a *Billing Account Administrator*, then
   move the project to a billing account under his card. Projects change billing
   accounts without redeploying.

### The Gemini key is the one that leaks cost

The key currently in `.env` bills to **your** account. Replace it:

1. Open AI Studio (or Console → APIs & Services → Credentials) **with
   `alkeva-prod` selected**, and create a new API key in that project.
2. Restrict it: *API restrictions* → Generative Language API only.
3. Put it in `/opt/alkeva/.env` as `GEMINI_API_KEY`.
4. **Delete the old key** from your personal project, from local `.env`, and
   from the Vercel project env — a key that still exists still bills.

---

## 2. Provision the VM **[you]**

Install the gcloud CLI first (`gcloud` is not on this machine yet), or run
these in Cloud Shell.

```bash
gcloud auth login
gcloud config set project alkeva-prod
gcloud services enable compute.googleapis.com

# Static IP first — the domain must resolve before Caddy's first ACME attempt.
gcloud compute addresses create alkeva-ip --region=us-central1
gcloud compute addresses describe alkeva-ip --region=us-central1 --format='value(address)'

gcloud compute instances create alkeva \
  --zone=us-central1-a \
  --machine-type=e2-small \
  --image-family=debian-12 --image-project=debian-cloud \
  --boot-disk-size=20GB --boot-disk-type=pd-balanced \
  --address=alkeva-ip \
  --tags=http-server,https-server

gcloud compute firewall-rules create alkeva-web \
  --allow=tcp:80,tcp:443 --target-tags=http-server,https-server
```

Region note: `us-central1` is the cheapest and is what the cost estimate
assumes. A region closer to Ethiopia (`europe-west1`, `me-central1`) cuts
latency but costs 10–25 % more — worth considering before the demo, but change
it *now* if at all, since moving later means rebuilding.

**Point the domain's A record at the static IP and wait for it to resolve.**
Caddy will fail its HTTP-01 challenge until it does, and Let's Encrypt
rate-limits repeated failures.

Then, on the VM (`gcloud compute ssh alkeva --zone=us-central1-a`):

```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git
sudo usermod -aG docker $USER   # log out and back in
sudo mkdir -p /opt/alkeva && sudo chown $USER /opt/alkeva
```

---

## 3. Configure and start

```bash
git clone <repo> /opt/alkeva/app
cp /opt/alkeva/app/deploy/env.production.example /opt/alkeva/.env
chmod 600 /opt/alkeva/.env
# fill it in — every value is documented inline in that file
nano /opt/alkeva/.env

cd /opt/alkeva/app
docker compose -f deploy/docker-compose.prod.yml up -d --build
```

The `migrate` container runs `db:migrate` then `db:seed` and must exit 0 before
api/web/worker start — that ordering is declared in the compose file, not left
to timing. Both scripts are idempotent, so this repeats safely on every deploy.

Watch the first boot:

```bash
docker compose -f deploy/docker-compose.prod.yml logs -f
```

### Redeploy

```bash
cd /opt/alkeva/app && git pull
docker compose -f deploy/docker-compose.prod.yml up -d --build
```

Build it on the VM only if you moved to `e2-medium`; on `e2-small` a
`next build` can exhaust 2 GB. The safer path is to build elsewhere and pull:
push the image to Artifact Registry from your machine or Cloud Build, then
`docker compose pull && up -d`.

---

## 4. Re-point everything that is origin-bound

Moving domains breaks more than DNS. Each of these is a hard failure if missed:

| What | New value | Where |
|---|---|---|
| Chapa webhook | `https://DOMAIN/api/webhooks/chapa` | Chapa dashboard |
| Chapa `return_url` | derived from `WEB_ORIGIN` | `/opt/alkeva/.env` |
| Google OAuth redirect | `https://DOMAIN/auth/google/callback` | Cloud Console → Credentials, **exact match** |
| Passkeys | `WEBAUTHN_RP_ID=DOMAIN`, `WEBAUTHN_ORIGIN=https://DOMAIN` | `.env` — existing credentials bound to the old origin will **not** work; users re-enrol |
| Cookie `Secure` flag | automatic — derived from `WEB_ORIGIN` starting `https://` | `auth.controller.ts::cookieOpts` |
| Email links | `MAIL_FROM` + `WEB_ORIGIN` | `.env` |

---

## 5. Decommission the old hosts

Only after the manual test pass on the new domain succeeds:

- Vercel: `alkeva-web` and `alkeva-api` → delete or leave paused.
- Render: `alkeva-worker` → **delete.** Two workers writing price ticks is the
  failure the `pg_try_advisory_lock` single-writer guard exists to survive, but
  do not lean on it; the second instance idles, it does not disappear.
- Cancel any external uptime pinger — the Render free-tier sleep it existed to
  prevent no longer applies.
- Keep Supabase exactly as is.

---

## 6. Operating notes

- **Backups.** Supabase handles Postgres. The only VM state worth keeping is the
  Caddy volume (ACME certificates) and the Redis AOF (idempotency keys,
  WebAuthn challenges — both short-lived and safe to lose). Consider a weekly
  snapshot schedule (~$0.30/mo for a 20 GB disk).
- **Base image patches.** `node:22-bookworm-slim` accumulates CVEs between
  releases. Rebuilding on `git pull` picks up the current base; rebuild monthly
  even when the app has not changed.
- **Log growth.** Caddy rolls its access log at 10 MiB × 5. Docker's own logs do
  not rotate by default — set `log-driver: json-file` with `max-size` in
  `/etc/docker/daemon.json` before the disk fills.
- **Restarts.** `restart: unless-stopped` plus Docker's own systemd unit means
  a VM reboot brings the whole stack back with no cron or pinger involved.
