# Phase 11: joint verification (ALKEVA as a Telegram Mini App)

There are two ways to run this.

**Local** (no Telegram client needed) covers sections A–F.
- `.env` already has a **fake** dev bot token, `telegram` in `AUTH_METHODS`, and `TELEGRAM_WEBAPP_ORIGIN=http://tg.localhost:3000`.
- Start Postgres, Redis and Mailpit, then the API and worker with `SMTP_HOST=localhost SMTP_PORT=1025 SMTP_USER= SMTP_PASS=`, then `pnpm --filter @alkeva/web dev`.
- Mint a launch with `node scripts/telegram-dev-initdata.mjs --id 1001 --first Abebe --username abebe_dev`. It prints a `launch:` URL: open it in Chrome. Chrome resolves `tg.localhost` to your machine.
- A launch is **single-use and valid for 5 minutes**. Mint a new one for each fresh open; that is the security rule you are testing.
- Use `--id <another number>` to be a different Telegram person, `--start trade` to test deep links, and `--age 400` to get a stale launch.

**Real Telegram** covers section G. Do it after `docs/deploy/TELEGRAM.md` is done in production.

## A. First open and sign-up
1. Open `http://tg.localhost:3000/` with no launch data. You see "Open ALKEVA in Telegram" with an "Open in Telegram" button. Nothing else is reachable.
2. Open a fresh launch URL. You see "Welcome to ALKEVA" and "Telegram account: @abebe_dev", with **Create account / I have an account**.
3. Create account: the name is pre-filled from Telegram and can be edited. "Create my account" stays disabled until the terms box is ticked.
4. Submit. You land in the app, which uses the phone layout even on a wide window. The banner says to confirm your email, and the code is in Mailpit (http://localhost:8025).
5. Reload the page (F5). You are still signed in, with no "reopen" screen.
6. Open DevTools → Application. There are **no** `alkeva_access` / `alkeva_refresh` cookies on `tg.localhost`, and `sessionStorage` holds `alkeva.tg.rt` only (no access token stored anywhere).
7. Mint a new launch for the **same** `--id`. You go straight in: same account, no onboarding.

## B. The launch-data rules
8. Copy a launch URL, open it, then clear sessionStorage (DevTools) and open the **same** URL again. You see "Please reopen ALKEVA": a launch works once.
9. `--age 400` gives "Please reopen ALKEVA" (older than 5 minutes).
10. In a launch URL, change one digit of the user id inside `tgWebAppData`. You see "We couldn't open ALKEVA" (signature fails).
11. Signing up with an email that already has an account says "An ALKEVA account already uses this email. Choose 'I have an account'…". **Nothing is linked automatically.**

## C. Connecting an existing account
12. **With a password**, inside the Mini App. New `--id` → "I have an account" → your website email and password. A wrong password gives "Incorrect email or password"; the right one gets you in. Mailpit has "Telegram connected to your account", sent even if email notices are off.
13. **From the website** (Google-, Fayda- or passkey-only accounts):
    - Sign in at `http://localhost:3000` → Account → Telegram → **Connect Telegram** → "Open Telegram". Locally, run `node scripts/telegram-dev-initdata.mjs --id 2002 --start link-<the token after link- in the link>` and open its launch URL.
    - The Mini App says "Confirm on allkeva.com … waiting to connect to t***@…". **Nothing is connected yet.**
    - On the website, the Telegram card now shows "@… wants to connect". Click **Confirm** and the Mini App signs in by itself within ~3 s.
    - Repeat with **Not me**: the Mini App shows "Connection declined", and nothing is linked.
14. Make the same link work twice by opening the same `link-` launch with a different `--id`. You get "This connect link has expired or was already used".
15. Confirming on the website more than 10 minutes after you signed in there gives "For your security, sign in again…".

## D. A Telegram session can't escalate
16. Inside the Mini App, Account shows **no passkey card**, and there is no Admin console entry.
17. `http://tg.localhost:3000/admin` returns 404. `/login` and `/register` redirect to the app home.
18. Make your Telegram-linked account staff (`update "user" set role='compliance' where email='…'`). Opening the Mini App gives "Staff accounts can't be used inside Telegram". Set the role back.

## E. Money in and identity, via the phone's browser
19. Verify your email first (Mailpit code). Then **Deposit** → amount → Deposit. The Mini App shows "Pay with Chapa" → **Continue to Chapa**, which opens Chapa in a new tab (in Telegram, the phone's browser).
20. Finish or abandon the sandbox payment. Chapa lands on `localhost:3000/telegram/return?id=…`: "Payment submitted" with **Back to Telegram**. That page holds no ALKEVA session (no cookies needed).
21. Back in the Mini App, tap **I've paid — check now**. The deposit status page checks with Chapa itself. Only a payment Chapa confirms is credited.
22. **Fayda** (sandbox, FAN 3126894653473958 or 6230247319356120, OTP 111111):
    - Go to KYC → **Verify with Fayda** → **Continue to Fayda**. A browser tab opens `localhost:3000/handoff`, and the `#t=…` disappears from the address bar at once. Fayda's pages follow.
    - After Fayda you see "Identity checked — go back to ALKEVA in Telegram and confirm the name".
    - Back in the Mini App, KYC shows the legal name and birth year. **Your account is not verified yet.**
    - Tap **Yes, this is me** and you are verified (tier 1). "This isn't me" discards it.
23. Reload that `/handoff#t=…` tab, or open it a second time: "This link has expired". A ticket works once, for 2 minutes.

## F. Notices and disconnecting
24. Notifications page: inside the Mini App the "Browser alerts" card is gone, and the preferences table has a **Telegram** column. It also shows on the website once Telegram is connected.
25. Account → Telegram → **Disconnect Telegram** → **Disconnect**. Inside the Mini App, the app ends with "Please reopen ALKEVA". Opening a new launch shows onboarding again. Mailpit has "Telegram disconnected".

## G. Real Telegram (production, after TELEGRAM.md)
26. iPhone, Android, Telegram Desktop **and** web.telegram.org (the iframe): open the bot → Start → the welcome message has an "Open ALKEVA" button. `/price` gives the live price. `/help` lists the commands. Commands appear in your Telegram language.
27. In each client: sign in or create an account, then check that safe areas look right (nothing under the notch or the home bar) and that Telegram's ← Back button appears below the main tabs and works.
28. Buy 0.1 g and sell 0.1 g. Both settle to the cent with one receipt each, and a "Receipt …" message arrives from the bot.
29. Deposit through Chapa in the phone's browser, then "Back to Telegram". The deep link reopens the Mini App on the deposit's status, and the bot says "Deposit credited" once Chapa confirms.
30. While a quote is on screen, try to close the Mini App. Telegram asks you to confirm.
31. web.telegram.org: everything above works inside the frame (the cookie-less sessions are what make this possible).
32. Open https://allkeva.com inside an iframe on any other site. It refuses to render: only the tg host can be framed.
33. Send the bot `/unlink`. The reply says it was disconnected, the Mini App session ends, and the owner gets an email.
