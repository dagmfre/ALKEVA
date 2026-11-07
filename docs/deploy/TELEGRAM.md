# ALKEVA in Telegram: go-live runbook (Phase 11)

This runbook puts ALKEVA inside Telegram as a Mini App with its own bot. The code is already on `main`, and nothing turns on until **`telegram` is in `AUTH_METHODS`** and every value below is set.

## What you are setting up

| Thing | Value | Why |
|---|---|---|
| Mini App host | `https://tg.allkeva.com` | It is its own origin on purpose. Telegram blocks Mini App calls from any origin other than the one registered in BotFather (Bot API 10.2, enforced since 20 Jul 2026), and web.telegram.org frames the app. Only this host may be framed, and only by `https://web.telegram.org`. allkeva.com keeps `X-Frame-Options: DENY`. |
| Bot webhook | `https://allkeva.com/api/webhooks/telegram` | It is authenticated by a secret header. Caddy also allows only Telegram's published IP ranges (149.154.160.0/20, 91.108.4.0/22) to reach it. |
| Sessions | Bearer tokens, no cookies | The web.telegram.org iframe is a third-party context. The access token lives in memory and the refresh token in `sessionStorage`. Each session lasts 12 h, absolute. |

## 1. Create the bot (Dagmfre, in Telegram)

1. Open **@BotFather** and send `/newbot`. Choose the display name `ALKEVA` and a username such as `alkeva_bot`.
2. BotFather replies with the **bot token**. It is a password: never paste it in chat, email, a ticket or git. It only goes into `/opt/alkeva/.env`.
3. In the BotFather Mini App, open **My Bots → ALKEVA → Bot Settings → Configure Mini App**:
   - Main Mini App URL: **`https://tg.allkeva.com`**, exactly. No path, no redirect, no tracking link. The protected origin is taken from this URL.
   - **Leave "origin protection" ON.** Opting out makes us responsible for every page the app could link to.
4. Still in BotFather, create a direct-link Mini App with **`/newapp`**: pick the bot, give it the URL `https://tg.allkeva.com` and the short name `app`. Deep links then look like `https://t.me/alkeva_bot/app?startapp=trade`.
5. Optional: set a profile photo with `/setuserpic` (use `apps/web/public/brand/mark-512.png`).

## 2. DNS

Add an **A record `tg` → `159.195.85.255`** (the netcup VPS) in the zone that serves allkeva.com, which is still Google Cloud DNS. Caddy obtains the certificate by itself on the next restart.

Check it:

```bash
dig +short tg.allkeva.com   # → 159.195.85.255
```

## 3. Production settings (`/opt/alkeva/.env` on the VPS)

```bash
AUTH_METHODS=password,google,passkey,telegram     # append ",telegram" to what is there
TELEGRAM_DOMAIN=tg.allkeva.com                    # read by Caddy (ship.sh copies it to caddy.env)
TELEGRAM_WEBAPP_ORIGIN=https://tg.allkeva.com
TELEGRAM_BOT_TOKEN=<from BotFather>
TELEGRAM_BOT_USERNAME=alkeva_bot                  # without the @
TELEGRAM_MINIAPP_SHORT_NAME=app
TELEGRAM_WEBHOOK_SECRET=<openssl rand -hex 32>
TELEGRAM_INITDATA_MAX_AGE_SEC=300
TELEGRAM_SESSION_TTL_SEC=43200
TELEGRAM_SIGNUP_ENABLED=true                      # false = Telegram can only open existing accounts
TELEGRAM_TEST_ENV=false
```

The production boot guard refuses to start if:
- Telegram is enabled and any of these values is missing;
- the webhook secret is shorter than 32 characters;
- the Mini App origin is http, has a path, or is the same host as `WEB_ORIGIN`;
- `TELEGRAM_TEST_ENV=true`.

`ship.sh`'s settings preflight runs that guard before anything restarts.

## 4. Deploy, then register the webhook

```bash
bash deploy/ship.sh                 # migration 0014 runs automatically
ssh -i ~/.ssh/alkeva_vps root@159.195.85.255
cd /opt/alkeva/app && set -a && . ../.env && set +a
node scripts/telegram-setup.mjs     # webhook + commands + descriptions (5 languages) + menu button
node scripts/telegram-setup.mjs --check
```

`--check` must show:
- `url` = `https://allkeva.com/api/webhooks/telegram`;
- `pending_update_count` 0;
- `last_error_message` null;
- `allowed_updates` `["message"]`.

## 5. Smoke test (about 5 minutes)

1. `curl -sI https://tg.allkeva.com/` must include `content-security-policy: frame-ancestors https://web.telegram.org` and must NOT include `x-frame-options`.
2. `curl -sI https://allkeva.com/` must still include `x-frame-options: DENY`.
3. `curl -s -o /dev/null -w '%{http_code}' -X POST https://allkeva.com/api/webhooks/telegram` must return **403** (not from a Telegram IP).
4. In Telegram, open the bot and tap **Start**. You get a welcome message with an "Open ALKEVA" button. Send `/price` and you get the live gold and platinum price per gram.
5. Tap the menu button. The Mini App opens on "Welcome to ALKEVA" with your @username.
6. Then follow `docs/manual-tests/phase-11.md`.

## 6. Turning it off

- **Off, quickly:** remove `telegram` from `AUTH_METHODS` and restart the api, web and worker containers. Sign-in, link, handoff and the bot all refuse with `telegram_unconfigured` or 401. Linked accounts keep working on the website.
- **Revoke the bot token** (if it ever leaks): in BotFather, `/revoke`, then put the new token in `.env`, restart, and rerun `telegram-setup.mjs`.

## Things to know

- **Payments policy.** Telegram's developer terms §6.2 require *digital* goods to be paid in Telegram Stars. ALKEVA sells physical vault gold, and Chapa runs in the phone's external browser, never inside Telegram. This risk was accepted on 7 Nov 2026.
- **Data.** We store only the Telegram user id, first name and @username (`telegram_chat` + `auth_identity`). The Privacy page says so. Unlinking deletes both rows.
- **Encryption at rest.** Telegram's terms §4.4 ask that user data be "encrypted at rest and stored separately from its key". The netcup disk is not encrypted today. This is an open compliance item, the same one as the backup age key.
- **Network.** `api.telegram.org` did not answer from the developer machine on 7 Nov 2026 (it timed out; other sites worked). The VPS is in Germany. If bot notices ever stall, check `docker compose logs worker | grep telegram`: the outbox retries with backoff, honours `retry_after`, and marks a chat `blocked_at` when Telegram answers 403.
