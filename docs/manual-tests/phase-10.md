# Phase 10 — joint verification (real-money readiness)

Run locally first (`pnpm dev`, or API/worker/web separately), then repeat sections A, B, E and H on production after `docs/deploy/GO_LIVE.md`.

**Local setup.** `.env` already has the Fayda **sandbox** client (only works on `http://localhost:3000/callback`), `AUTH_METHODS=fayda,password,google,passkey`, `KYC_METHODS=fayda`, VAPID keys, and `FAYDA_USERINFO_JWKS_FALLBACK=tls` (the sandbox currently does not publish its userinfo signing key — see GO_LIVE §4.6). To keep test codes out of real inboxes, run Mailpit and point SMTP at it: `docker run -d -p 1025:1025 -p 8025:8025 axllent/mailpit`, then start the API and worker with `SMTP_HOST=localhost SMTP_PORT=1025 SMTP_USER= SMTP_PASS=`; read mail at http://localhost:8025.

Sandbox test identities: FAN **3126894653473958** or **6230247319356120**, OTP **111111**. (On my dev DB both are already linked to accounts — to see "Complete your account" again, use a fresh database or ask me to unlink one.)

## A. Fayda sign-in (national ID)
1. `/login` → **Continue with Fayda** is the first, gold button. Password form, Google and passkey follow below it.
2. Click it → Fayda's page → "Login with Code (OTP)" → FAN → Get OTP → 111111 → Verify & Sign In.
3. Back on `/callback`: a brand-new person sees **Complete your account** with their verified legal name (green), an email field, and the terms checkbox. Submit.
4. You land on **Confirm your email**; the code is in Mailpit (Amharic or English depending on the language you chose). Wrong code → "X attempts left". Right code → you are sent on, verified.
5. Sign out, sign in with the same FAN → straight in, same account (no new account).
6. Open the callback URL from step 3 in a different browser → "This sign-in link has expired or was opened in a different browser".
7. On Fayda, cancel instead of entering the OTP → "You cancelled the sign-in on Fayda…".

## B. Identity check for an existing account
8. Register with email + password (password ≥10 chars) → confirm email via Mailpit → banner "Verify your identity with Fayda…".
9. `/kyc` shows **Verify with Fayda** (three steps); the document upload is NOT shown (`KYC_METHODS=fayda`).
10. Verify with a FAN already linked to another account → "This Fayda ID is already linked to another ALKEVA account".
11. Verify with an unlinked FAN → back on `/kyc` "Done — your identity is verified with Fayda", showing your legal name; deposit/trade/withdraw unlock.
12. Set `KYC_METHODS=fayda,document`, restart API → `/kyc` also shows "No Fayda ID? Upload a document"; the admin KYC tab reappears. Set it back.

## C. Sign-in methods by env
13. `AUTH_METHODS=fayda` (restart API) → `/login` shows only Fayda plus a small **Staff sign-in** link. A customer's email+password → "This sign-in method is not available". The admin's email+password via Staff sign-in → works.
14. 5 wrong passwords for one email → "Too many attempts… paused for 15 minutes" (same message for an email that does not exist).

## D. Sessions (the "blank Portfolio on the phone" fix)
15. Sign in on the desktop AND on your phone (same account). Use both for 20+ minutes (past the 15-minute access token). Both stay signed in; Portfolio on the phone loads.
16. Account → **Signed-in devices** lists both; "Sign out" the phone from the desktop → the phone's next action goes to the sign-in page ("Your session ended").
17. Kill the API while on Portfolio → you see "This could not be loaded… Try again", never an endless skeleton.

## E. Withdrawals (real-money rules)
18. Withdraw → the account holder name is pre-filled with your Fayda legal name.
19. Submit → "Check your email" step; the code is in Mailpit. Wrong code → error, step stays; correct code → "Received. Our finance team will check it" (first payout to a new account always goes to finance).
20. Admin → Payouts → approve (as a different staff member). After it settles, withdraw again ≤10,000 ETB to the SAME account in the same name → "Sent" instantly.
21. Same account but a different holder name → finance queue. Over 10,000 ETB → finance queue.
22. Sixth withdrawal in one day → "You have reached today's number of withdrawals".
23. A staff account trying to deposit/withdraw/trade → refused ("Staff accounts cannot…").

## F. Delivery, review, treasury (admin)
24. A big buy (or one that takes today's total past 500,000 ETB) → "Order under review" notice; Admin → Reviews → approve → settles. Approving your OWN order is refused.
25. Customer (Sapphire/Emerald tier) requests delivery → Admin → Delivery → Approve → the grams leave the customer's balance (they can no longer be sold) → "Cancel & return grams" gives them back → approve again → Schedule → **Mark delivered** → Treasury: physical stock and grams owed both drop by the delivered grams.
26. Admin → Treasury → Treasury entries: record a vault intake (bar serial + assay ref) and a capital-in. Try a vault outtake larger than the spare stock → "Refused: the vault would hold less metal than customers own".

## G. Notifications
27. Bell shows an unread **count**; opening it marks what you see as read; each notice has its figures (amount, grams, price) and opens the right page.
28. Create a price alert just under the live price → within ~30 s: a toast appears, the bell count rises without reloading, and an email arrives.
29. Notices page → **Turn on browser alerts** → allow. Put ALKEVA in a background tab, trigger another alert → a system notification appears; clicking it opens ALKEVA. (iPhone: only after Share → Add to Home Screen.)
30. Notices page → untick "Price alerts → Email" → the next alert arrives in the bell and browser but not by email. "Security" email cannot be turned off.

## H. Wallet, tier, colour, 3D
31. Desktop header: wallet chip with three icons (birr / gold bar / platinum bar) and a gold badge counting withdrawals/deposits in progress. Click → drawer with total value, each holding valued at the live price, in-progress list, Deposit/Withdraw/Buy/Sell, Hide balances (remembered on this browser).
32. Phone: wallet icon top-right → bottom sheet with the same content. "Open wallet" → `/wallet`.
33. Avatar has a ring in your tier colour and a small gem (coin / triangle / round / oval / emerald-cut). The menu shows "Tier n of 5", progress to the next tier, what it unlocks, and the 5 achievements (earned ✓ / locked with how to earn).
34. The main colour is the bright yellow (#F5D21A family) again — buttons, active tabs, chart line, 3D gold.
35. **On a real phone** (Android Chrome and iPhone Safari): Portfolio → "Your metal" shows the gold box (or, while 3D loads / if the GPU cannot, a drawn box — never an empty panel). Tap → opens, shows the grams.

## I. Production guard (on the VPS, before go-live)
36. With `NODE_ENV=production` and a `CHASECK_TEST` key (or http WEB_ORIGIN, no SMTP, Fayda enabled without keys, `FAYDA_USERINFO_JWKS_FALLBACK=tls`) → `docker compose up` shows the API/worker refusing to start and listing each problem.
