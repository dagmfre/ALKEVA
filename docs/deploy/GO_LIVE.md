# ALKEVA — Go-live runbook (real money)

Phase 10, written 2 Nov 2026. Do these **in order**. Every step says who does it and how to check it. Nothing here is optional: with `NODE_ENV=production` the API, worker and seed **refuse to start** on the unsafe settings (`packages/shared/src/env.ts::productionEnvProblems`), so a skipped step shows up as a container that will not boot, never as a quietly unsafe platform.

Server facts (netcup VPS, `root@159.195.85.255`, key `~/.ssh/alkeva_vps`, app in `/opt/alkeva`) are in `docs/deploy/OPERATIONS.md`.

---

## 0. Decide the money limits with the client (Tekleweyni) — before anything else

These are config, not code. Write the agreed values into `/opt/alkeva/.env` (template: `deploy/env.production.example`).

| Setting | Default | Meaning |
|---|---|---|
| `FEE_COMMISSION_PCT` | 2.0 | Commission per buy and per sell |
| `QUOTE_SPREAD_BPS` | 0 | Extra dealer spread per side (0 = commission only) |
| `PAYOUT_AUTO_APPROVE_MAX_CENTS` | 1,000,000 (10,000 ETB) | Instant withdrawals below this — only to an account already paid before, in the Fayda legal name. 0 = finance approves every one |
| `PAYOUT_DAILY_MAX_CENTS` / `_COUNT` | 1,000,000 ETB / 5 | Hard per-customer daily withdrawal limits |
| `COMPLIANCE_REVIEW_THRESHOLD_CENTS` | 500,000 ETB | One order, or one day's total, at/above this goes to compliance review |
| `TREASURY_HALT_CENTS` | 1,500,000 ETB | Sell-backs stop below this cash float |
| `SELLBACK_DAILY_CEILING_CENTS` | 5,000,000 ETB | Platform-wide sell-backs per day |
| `TIER_BANDS_JSON` | 5 gemstone bands, no caps | Add `perTxnCapCents` / `dailyCapCents` per band if wanted |

## 1. Start from a clean database (Dagmfre, on the VPS)

Production has carried demo users, sandbox balances, the `DEMO-SEED` vault stock and a made-up opening float since August. None of it may stand behind real money. Keep only the real price history.

```bash
cd /opt/alkeva/app
COMPOSE="docker compose -f deploy/docker-compose.prod.yml"
# 1a. Last backup of the demo era, kept off to the side.
bash deploy/backup-db.sh
# 1b. Save the REAL price ticks (not the synthetic 'seed-backfill' year).
$COMPOSE exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\copy (select * from price_tick where source <> '"'"'seed-backfill'"'"') to /tmp/ticks.csv csv header"'
$COMPOSE cp postgres:/tmp/ticks.csv /opt/alkeva/ticks.csv
# 1c. Stop the apps, recreate the database volume.
$COMPOSE stop api web worker
$COMPOSE rm -sf postgres && docker volume rm alkeva_pgdata
$COMPOSE up -d postgres && sleep 10
# 1d. Schema + seed (staff accounts only — production seeds no demo data).
$COMPOSE run --rm migrate
# 1e. Put the real ticks back.
$COMPOSE cp /opt/alkeva/ticks.csv postgres:/tmp/ticks.csv
$COMPOSE exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\copy price_tick from /tmp/ticks.csv csv header"'
```
**Check:** `select count(*) from "user"` = the seeded staff only; `select count(*) from ledger_entry` = 0; `select count(*) from vault_holding` = 0.

## 2. Real vault stock and float (administrator, in the app)

Admin console → **Treasury → Treasury entries** (administrator only, append-only, audited):
- **Vault intake** for every bar actually in the vault: grams + bar serial(s) + assay certificate reference. Until this exists, every buy is refused with `reserve_halt` — correctly.
- **Capital in** for the birr float the business puts up for sell-backs (bank/Chapa reference). Below `TREASURY_HALT_CENTS` sell-backs are refused with `float_halt`.

**Check:** Treasury shows physical stock = the vault, issued = 0, coverage "—"; cash float = the capital entered.

## 3. Chapa live keys (Tekleweyni / Dagmfre, Chapa dashboard)

1. Merchant account approved for live mode.
2. Live secret key → `CHAPA_SECRET_KEY` (must NOT start with `CHASECK_TEST`; the boot guard refuses it unless `ALLOW_SANDBOX_PAYMENTS=true`, which is for staging only).
3. Webhook URL `https://allkeva.com/api/webhooks/chapa`, secret hash → `CHAPA_WEBHOOK_HASH`.

## 4. Fayda production client (Dagmfre, partner.fayda.et)

The local setup uses Fayda's **public sandbox test client** — it only works on `http://localhost:3000/callback`. Production needs your own:

1. FaydaPartners → **Create Partner** (organisation details).
2. Generate the key pair **on your own machine** (never on a website):
   ```bash
   openssl genrsa -out alkeva-fayda.key 2048
   openssl req -new -x509 -key alkeva-fayda.key -out alkeva-fayda.crt -days 730 -subj "/CN=allkeva.com/O=ALKEVA"
   ```
   Upload `alkeva-fayda.crt` under **My Certificates**. Keep `alkeva-fayda.key` offline and backed up.
3. **OIDC Client**: redirect URI exactly `https://allkeva.com/callback`; claims name, birthdate (+ optional gender, phone_number, email, picture, address, nationality); note the client ID.
4. Convert the private key to the base64 JWK the API expects:
   ```bash
   pip install jwcrypto
   python3 -c "import base64;from jwcrypto import jwk;k=jwk.JWK.from_pem(open('alkeva-fayda.key','rb').read());print(base64.b64encode(k.export_private().encode()).decode())"
   ```
5. `/opt/alkeva/.env`: `FAYDA_CLIENT_ID`, `FAYDA_PRIVATE_KEY`, `FAYDA_REDIRECT_URI=https://allkeva.com/callback`, and `FAYDA_ISSUER` if Fayda gives you a production host other than `https://esignet.ida.fayda.et`.
6. **Ask Fayda support** about the userinfo signing key: on 2 Nov 2026 the sandbox signed userinfo with a key (`A9nhXDtL…`) its own JWKS stopped publishing. Production runs `FAYDA_USERINFO_JWKS_FALLBACK=strict` (the boot guard insists), so if production has the same gap every Fayda sign-in is refused until Fayda publishes the key.

**Check:** sign in at `https://allkeva.com/login` → Continue with Fayda → your own FAN → "Complete your account" shows your legal name.

## 5. Email (Dagmfre)

1. netcup SCP → server → **delete the "Mail Block" policy** (outbound 587/465 is blocked until you do; verified 13 Oct).
2. Brevo SMTP credentials → `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM=ALKEVA <no-reply@allkeva.com>` (verify the sender domain in Brevo — SPF/DKIM).
3. **Check:** register a test account → the 6-digit code arrives within a minute.

## 6. Browser notifications

```bash
npx web-push generate-vapid-keys
```
→ `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_SUBJECT=mailto:support@allkeva.com`. Never change the pair afterwards (every subscription is bound to it).

## 7. Server hardening (Dagmfre, on the VPS)

```bash
# Redis password
echo "REDIS_PASSWORD=$(openssl rand -hex 24)" > /opt/alkeva/redis.env && chmod 600 /opt/alkeva/redis.env
# then in /opt/alkeva/.env:  REDIS_URL=redis://:THAT_PASSWORD@redis:6379
# Encrypted, off-box backups
apt install -y age rclone
age-keygen -o alkeva-backup.key      # do this on YOUR laptop; keep the key offline
# /opt/alkeva/backup.env:
#   BACKUP_AGE_RECIPIENT=age1...      (the public line from age-keygen)
#   BACKUP_RCLONE_REMOTE=remote:bucket (after `rclone config`, e.g. Backblaze B2)
timedatectl status                    # "System clock synchronized: yes" — Fayda assertions are clock-checked
```
Also remove the duplicate `WEB_ORIGIN` line from `/opt/alkeva/.env`, and set `NODE_ENV=production`.

## 8. Staff

1. `SEED_ADMIN_*`, `SEED_COMPLIANCE_*`, `SEED_FINANCE_*` with long unique passwords (the seed never promotes an existing customer account).
2. Each staff member signs in and enrols a **passkey** (Account → Passkeys).
3. Then `STAFF_REQUIRE_PASSKEY=true` — admin routes now need a passkey sign-in.

## 9. Ship and smoke-test (Dagmfre)

```bash
./deploy/ship.sh            # first run records the VPS host key in ~/.ssh/alkeva_known_hosts
```
Then with a real customer account and small real amounts:
1. Fayda sign-in → email code → identity verified (tier 1).
2. Deposit 100 ETB through Chapa → credited.
3. Buy 0.1 g → receipt. Sell 0.1 g → receipt.
4. Withdraw 50 ETB → email code → first payout goes to the finance queue (new destination) → finance approves → arrives.
5. Bell, email and browser notification for each step.
6. Admin → Treasury: coverage and float as expected.

Record the result in `CLAUDE.md` (Progress Log).
