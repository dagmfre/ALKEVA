# Phase 4 — Money in and out · Joint verification

**Precondition — one-time setup (Dagmfre):**

1. Paste into `.env` (and Render env for production): `CHAPA_SECRET_KEY` (the `CHASECK_TEST-…` key), `CHAPA_WEBHOOK_HASH` (any random string you choose), `GEMINI_API_KEY`.
2. In dashboard.chapa.co → Settings → Webhooks: set the webhook URL to `https://<api-host>/webhooks/chapa` and the **secret hash to the exact same string** as `CHAPA_WEBHOOK_HASH`. (Local dev needs no tunnel — the return page reconciles by itself; the webhook is exercised for real on Render.)
3. Restart API + web. Steps marked **[keys]** only work after this setup; everything else was already self-verified without keys on 11 Aug.

Test users: any fresh registration (starts at KYC tier 0). Existing users were grandfathered to tier 1 by migration 0004.

## A — KYC gate (identity before money)

1. Register a brand-new user. On Account, the Identity check row shows **"Verify now →"**.
2. Open Trade, get demo birr via the faucet, request a quote, confirm. **Expect: refusal "Verify your identity first…"** — the order appears in History as rejected with that reason.
3. Open `/deposit` and `/withdraw`. **Expect: both show the "Verify your identity" card**, not the form.
4. Go to `/kyc`. Pick a document type, attach a photo (>2 MB must be refused; a .txt must be refused). Submit. **Expect: "Under review" card.** Submitting again must be refused ("already have a submission under review").
5. Sign in as **compliance** → `/admin/kyc`. Your submission is listed; "View document" opens the image. Approve it.
6. Back as the user: Account shows **✓ Verified**; a notice appears under the bell; trading now works.

## B — Deposit (Chapa sandbox) **[keys]**

7. `/deposit`: the channel-limits table shows Telebirr/CBEBirr/bank/card caps. Enter 500 ETB, continue. **Expect: redirect to checkout.chapa.co.**
8. Pay with test mobile number `0900123456` (telebirr or cbebirr; Awash/Amole OTP is `12345`).
9. **Expect: return page says "Confirming your payment…" then "Deposit credited"** — the credit happens only after the server verifies with Chapa, never from the redirect itself.
10. Home balance is up by exactly 500.00 ETB; the bell shows "Deposit credited"; (with SMTP configured) an email arrived.
11. Abandon a second deposit (close the checkout tab). **Expect: no credit, ever.** The return page (if visited) eventually shows "Payment not completed" or stays pending — balance unchanged.
12. Webhook honesty checks (can be run any time): `POST /webhooks/chapa` with no/garbage signature → **401**; the same body re-delivered twice → still exactly one credit (idempotent). [Self-verified 11 Aug with simulated signatures: valid forms 200, tampered 401.]

## C — Withdrawal (request → hold → finance decision)

13. `/withdraw`: the destination dropdown lists real banks/wallets from Chapa **[keys]**. Enter 200 ETB, an account number, a name. Submit.
14. **Expect: balance drops by 200.00 immediately** ("Awaiting approval" in the request list) — the money is held, not gone.
15. Double-click protection: submitting the same form twice creates **one** request.
16. Request more than your balance. **Expect: "Not enough birr balance"**, recorded in the list as returned.
17. Sign in as **finance** → `/admin/payouts`. Reject one request with the two-step confirm. **Expect: user's balance restored to the cent; "Withdrawal returned" notice.**
18. Approve another **[keys]**. **Expect: status walks Requested → Processing → Sent** (test mode forces a successful transfer; the settle still happens only after Chapa verifies it). The held amount leaves the platform books.
19. As **compliance**, try `/admin/payouts`. **Expect: 403 — finance only.** As finance, try to freeze a user: also impossible.

## D — Ledger regression (after everything above)

20. `SELECT asset, sum(amount) FROM ledger_entry GROUP BY asset;` → **0, 0, 0**.
21. `SELECT count(*) FROM ledger_entry WHERE amount = 0;` → **0**.
22. Any `UPDATE ledger_entry …` → **rejected by the append-only trigger.**
23. `system:payout_hold` balance equals exactly the sum of currently-pending withdrawal requests.

*Self-verified 11 Aug 2026 (without live keys): unconfigured 503s; signature accept/reject matrix; KYC upload → 409 duplicate → 413 oversize; `kyc_required` refusal recorded then gate opens at tier 1; payout hold + idempotent replay + insufficient-balance; zero-sum and append-only clean. The [keys] steps are the remaining live surface.*
