# Phase 6 — Production-readiness pass: joint verification

**Scope (13 Aug 2026):** one live price everywhere (SSE + shared store) · AI assistant hardening (error taxonomy, retry bubbles, new chat) · instant withdrawals below threshold · administrator superuser · admin analytics dashboard · polish (single-writer worker lock, throttle messages).

Prereqs: docker `alkeva-postgres` + `alkeva-redis` up; `.env` carries `CHAPA_SECRET_KEY` (CHASECK_TEST…), `CHAPA_WEBHOOK_HASH`, `GEMINI_API_KEY`; api + worker + web running. Sign in as the seeded admin unless a step says otherwise.

## A — One price, everywhere (the screenshot bug)

1. Open Home on desktop. Compare the **navbar ticker** gold figure with the **Gold price card** big number and with the chart's **Current** cell + gold axis tag. All three must be **identical to the cent**, at any moment. Same for platinum.
2. The 24h % beside the ticker must equal the % on the price card exactly (both now come from the API's canonical `change24hPctMilli`, computed against the raw tick ~24h ago — never a bucket average).
3. Keep the page open ≥35s. When the worker lands a tick, **every** price surface updates within ~1s of each other (SSE push, one connection for the whole app — no per-component timers).
4. Open a second browser window side by side. Both windows show the identical price and update together.
5. Open the trade page (`/trade`). The estimate row's unit price now **live-updates** with the ticker (it was frozen at mount before). Request a quote — quoting/confirming is unchanged (server-priced, expiring).
6. Open the price-alert dialog — the threshold prefills instantly from the same store, no fetch.
7. Portfolio: the header total and each holding's *current value* re-mark live with the same tick, so **Portfolio total ≡ Home total ≡ ticker** at every instant. Cost basis and gain/loss methodology remain server-computed.
8. Ask the assistant "What is the gold price right now?" — the number it quotes must equal the ticker (same latest tick; verified 13 Aug: 22,802.02 on both).
9. Kill the API process. Within ~15s the provider falls back to a 10s poll (prices freeze, then resume when the API returns; SSE re-attaches within ~60s). Past 3 minutes without a tick, the stale banner appears and cannot un-appear while the feed is dead (client-side ratchet).
10. Chart ranges 7d/30d/1y now refresh every 5 minutes (they previously never refreshed after mount).

## B — Assistant

11. Ask a question → answer. Ask a follow-up using "it" → the assistant resolves it from history (multi-turn replay from our own DB — the full conversation survives reload and lives in `ai_message` forever).
12. Send 6 questions inside a minute → the 6th shows the **rate-limit** message ("receiving a lot of questions"), not the generic error, and the failed bubble offers **Retry**.
13. Stop the API, send a message → the bubble marks **Not sent** with Retry and Dismiss; Dismiss restores the text to the input. No orphan duplicate bubbles remain (the screenshot bug).
14. Restart the API, hit Retry on the failed bubble → it sends once, one reply appears.
15. **New conversation** button clears the thread; the next send starts a fresh server-side conversation row. Reloading shows the new conversation.
16. Poisoned-history recovery (optional, SQL): corrupt one assistant row's `tool_calls` (`update ai_message set tool_calls='{"steps":[{"bogus":1}]}' where id=…`) → the next question still answers (text-only degrade), never a permanent "busy".

## C — Instant withdrawals

17. As a KYC'd user with balance: `/withdraw`, pick **telebirr**, account `0900123456`, name anything, amount **300 ETB** → submit. The request returns **settled** in a few seconds with no admin involvement (sandbox transfer + verify). Balance drops by exactly the amount.
18. Audit log (`/admin/audit`): the payout shows `payout_requested` (user), `payout_auto_approved` + `payout_settled` with actor **system:auto_approve**.
19. Request an amount **≥ 500,000 ETB** (or set `PAYOUT_AUTO_APPROVE_MAX_CENTS=0` and restart): the payout stays **Awaiting approval** in the finance queue — large outflows keep a human in the loop.
20. Finance path unchanged: approve from `/admin/payouts` works; approving your own payout is still forbidden (403 `cannot_approve_own`) — for administrators too.
21. Double-submit the same withdrawal (same idempotency key) → same payout row returned, money moves once.
22. With `CHAPA_SECRET_KEY` emptied: requests park as `requested` (never stranded, never auto-fired). Restore the key after.

## D — Administrator superuser

23. Signed in as `administrator`: the sidebar now shows **KYC, Reviews, Payouts** (plus Users/Orders/Treasury/Audit). Each page loads (200) and actions work: KYC approve/reject, review resolve, payout approve/reject, freeze/unfreeze, CSV export.
24. Sign in as `compliance@` and `finance@`: their scopes are unchanged (compliance: no payouts/treasury; finance: no KYC/reviews/users/audit).

## E — Analytics dashboard

25. `/admin` now renders: the four action cards, a 30-day totals row (trade volume, settled orders, money in, money out, new users), and three charts — trade volume by day (buys gold / sells platinum, stacked), money in vs out (paired bars), new users (line).
26. Hover any bar/point → tooltip with the full ETB figure (never abbreviated), day label, series dots.
27. Numbers hand-check: totals row vs SQL (verified 13 Aug: 19 settled orders / 1,484,369.41 ETB / 16 new users — matched exactly, including **today's** activity).
28. Switch to Amharic → titles, series names, and totals labels localize; numerals stay Latin.

## F — Polish + regressions

29. Start a **second** worker process → it logs `another instance holds the tick lock — idling` and writes nothing (advisory lock; the double-writing stale-process problem can't recur).
30. Money core: zero-sum per asset = 0 (all three), no zero-amount entries, append-only trigger still rejects UPDATE, serials unique/settled-only.
31. Whole-workspace typecheck clean; `pnpm --filter @alkeva/web build` clean (25 routes, incl. `/api/prices/stream`).
32. Chapa failure reasons are now readable text (was `[object Object]` for validation refusals). Transfer references are ≤36 chars (`ALK…` — `ALKPO…` was 37 and Chapa rejected every real transfer; fixed + verified live).

## Self-verified live 13 Aug 2026 (all passed)

- SSE: initial snapshot + heartbeat + pushed snapshot on the very tick the worker landed; shadow route streams through the Next origin.
- Instant withdrawal 250 ETB: settled in 2.3s end-to-end through the real Chapa sandbox; idempotent replay; exact balance delta; audit labels exact.
- Signed `payout.success` webhook (x-chapa-signature) settled a parked `processing` payout via the sandbox-verify rule.
- Analytics totals matched SQL to the cent after the through-today fix.
- AI: happy path + multi-turn quote the identical latest tick; conversation replayed from DB.
- Admin role matrix: administrator 200 on kyc/payouts/analytics; am + en render on all routes; zero-sum 0/0/0.
