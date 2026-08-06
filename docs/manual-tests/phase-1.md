# Phase 1 — Manual Testing Steps (for Dagmfre)

Run these yourself to independently confirm Phase 1 is healthy. Every step says what you should see — if you see anything else, it's a bug: report it and we fix before the phase closes.

## A. Local bring-up

1. `docker compose up -d` → both `alkeva-postgres` and `alkeva-redis` show healthy in `docker ps`.
2. `cp .env.example .env` (first time only).
3. `pnpm install` → completes without errors.
4. `pnpm db:migrate` → prints `✓ migrations applied`.
5. `pnpm db:seed` → prints the ✓ lines ending `Seed complete.` Run it **twice** — the second run must also succeed (idempotent), saying "admin user exists".
6. Start three terminals (or `pnpm dev` in one):
   - `pnpm dev:api` → `ALKEVA API listening on :4000`
   - `pnpm dev:worker` → a `[XAU] gold-api.com: … USD/oz → … ETB/g` line within ~5s, repeating every 30s
   - `pnpm dev:web` → Next.js ready on `http://localhost:3000`

## B. Health

7. Open `http://localhost:4000/healthz` → `{"ok":true,"db":"ok","redis":"ok","priceFeed":"ok","latestTickAgeSec":<small number>}`.

## C. Registration & login (browser, phone-sized window)

8. Open `http://localhost:3000` → you are redirected to `/login`; **the page is in Amharic** and the Ethiopic text renders in a proper font (no boxes/tofu).
9. Tap the language toggle (`አማ`/`EN`) → all labels switch languages instantly, both directions.
10. Go to register → submit with a **short password** (e.g. `abc`) → browser blocks it (min 8). Try `password1` with a valid email → account created, you land on the dashboard.
11. Log out → log in with the **wrong password** → clear error message in the current language; no crash, no English leaking into Amharic mode.
12. Register again with the **same email** → "account already exists" error.
13. Log in correctly → dashboard.

## D. Live prices (dashboard)

14. Dashboard shows **Gold and Platinum cards in ETB per gram** with an "updated HH:MM:SS" line and source `gold-api.com`.
15. Wait ~35 seconds without touching anything → the updated-time changes (auto-refresh works).
16. Sanity-check the number: `world gold price in USD/oz` × `USD→ETB rate` ÷ `31.1` ≈ the ETB/gram shown (within ~1%). (Google "gold price usd" and "usd to etb".)

## E. Session behaviour

17. Stay logged in, idle 16+ minutes (access token TTL is 15 min), then click anything → you are **still logged in** (silent refresh happened; watch DevTools → Network for a `/api/auth/refresh` call).
18. Log out → back on `/login`. Press Back → dashboard redirects you to `/login` again (no cached authenticated view).

## F. Feed fallback (resilience)

19. Stop the worker. Edit `.env`: set `PRICE_PRIMARY_URL=https://invalid.example.invalid/price`. Restart the worker → log shows `primary feed failed` then `[XAU] swissquote: …` — prices keep flowing from the fallback with `source: swissquote` appearing on the dashboard after the next refresh.
20. Restore `PRICE_PRIMARY_URL` in `.env`, restart worker → source returns to `gold-api.com`.
21. Stop the worker entirely, wait 3+ minutes → dashboard shows the **"price feed delayed" warning** on the cards; `/healthz` reports `"priceFeed":"stale"`. Restart the worker → warning clears within a minute.

## G. Ledger protection (terminal)

22. `docker exec -it alkeva-postgres psql -U alkeva -d alkeva -c "UPDATE ledger_entry SET amount = 1;"`
    → must FAIL with `ledger_entry is append-only: UPDATE is not allowed`. (Empty ledger also prints `UPDATE 0` — in that case first confirm the trigger exists: `\d ledger_entry` shows `ledger_entry_append_only`.)
23. `docker exec -it alkeva-postgres psql -U alkeva -d alkeva -c "DELETE FROM audit_log;"` → must FAIL the same way if any rows exist (`DELETE 0` on empty table is fine — the trigger is what matters).

## H. Production (after the Render deploy — see docs/deploy/render-setup.md)

24. Repeat steps 8–16 on the production URL (`https://alkeva-web.onrender.com`).
25. `https://alkeva-api.onrender.com/healthz` → all ok.
26. Confirm the site works on your actual phone (Android Chrome), including the Amharic font.

---
**Result:** note each failed step number (if any) and report back. Phase 1 closes only when every step passes locally AND in production.
