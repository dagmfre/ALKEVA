# Phase 7 — Production stage: joint verification

Manual steps for Dagmfre. Every step was self-verified live on 2026-08-15;
this list is the independent re-check. Local setup: `docker compose up -d`,
`pnpm db:migrate && pnpm db:seed` (note: **the seed now skips the admin
account unless `SEED_ADMIN_PASSWORD` is set** — set it in `.env` first),
API + web + worker dev servers running.

## A — Faucet is gone, Deposit replaced it

1. `/trade` (desktop): the left ticket's foot shows a **Deposit birr** button (solid secondary, no dashed border) → clicking lands on `/deposit`.
2. Phone width (<1024px): open the trade sheet from the bottom bar → same Deposit button above "See the price"; tapping it closes the sheet and lands on `/deposit`.
3. `curl -X POST localhost:4000/faucet -H "content-type: application/json" -d '{"amountCents":"1000"}' -b <session>` → **404** (`DEMO_FAUCET_ENABLED` defaults false; only an explicit `=true` in a sandbox `.env` revives it).
4. Search both message files for "demo" → no faucet strings remain.

## B — Gauld palette

5. `pnpm verify:contrast` → **all pairs PASS** (29 asserted), "white on gold …
   correctly banned" at the end.
6. Visual pass on `/`, `/trade`, `/portfolio` vs `design/previews/goodl coloring….jpg`: charcoal (neutral, not warm-brown) surfaces; gold is noticeably brighter/luminous (#F5D21A family); the CTA still ends in the client's `#d4a017 → #b8860b` (devtools: computed `--gold-gradient`).
7. The header's live dot and the chart's current-price tag carry a soft gold glow; **no other element glows** (buttons stay inner-gloss only).
8. Receipt → print preview: still ink on white, chrome hidden.

## C — Tradeo shell

9. ≥1024px: a **full-width global header (~80px)** — brand block (240px, aligned exactly over the sidebar below), page title + EAT clock, XAU + XPT tickers with 24h %, Live dot, then assistant/bell/locale/balance/user on the right.
10. Sidebar: 240px, dense ~34px rows, small section labels, tier chip at the foot. Active pill on every route incl. `/receipt/<id>` → Receipts.
11. Ticker updates within ~2s of a worker tick; stop the worker ~3+ min → dot flips to "Delayed" and the Home stale banner appears; restart → recovers.
12. `/trade`: **two columns** — compact ticket (~1 part) left, dominant chart (~2.5 parts) right, and a **Recent orders** card under the chart sharing its exact width (desktop only), filtered to the selected metal.
13. Chart: range strip is now underlined tabs (24h/7d/30d/1y); the line has a soft glow behind a crisp stroke; y-axis on the right with the live tag.
14. Full trade regression: quote → countdown → confirm → receipt; triple-click Confirm → **one** order; refusals render localized; phone sheet unchanged.
15. Amharic (፩ toggle): header + dense sidebar show no truncation/overlap.

## D — Admin console additions

16. Nav (as administrator) now has **Analytics**, **Deliveries**, **Compliance** entries. Compliance officer sees Analytics/Deliveries/Compliance; finance sees Analytics but not Deliveries/Compliance.
17. `/admin/analytics`: range Select 7/30/90 days changes the totals row and all three charts.
18. `/admin/kyc`: Pending / Approved / Rejected tabs; approve/reject buttons only on Pending.
19. `/admin/compliance`: AML CSV downloads.

## E — Emails (needs SMTP creds per docs/deploy/email-setup.md)

20. With Brevo creds in `.env` (API **and** worker): trigger a KYC approve, a payout approve, a price alert → each arrives as a **branded** mail (charcoal header band, gold rule, white body) in the recipient's locale, with a plain-text part.
21. SMTP unset → notification rows recorded `queued`, nothing crashes.
22. Worker alert email copy is identical to the API's (same shared template).

## F — Password recovery

23. `/login` → "Forgot password?" → enter your email → uniform confirmation (same answer for unknown emails — try one).
24. Email link → `/reset-password?token=…` → set a new password → redirected to login with a green notice. Old password → 401; new → 200.
25. The reset **signs out every other session** (a previously signed-in tab's refresh fails).
26. Reuse the same link → "invalid or expired". DB check: `password_reset_token` stores a 64-char hash, never the raw token.

## G — Landing + terms + consent

27. Signed out, visit `/` → lands on **/welcome**: hero, live XAU/XPT prices (real feed), three trust cards, footer links. `/portfolio` signed out → `/login`. Signed in, `/welcome` → `/`.
28. `/terms` + `/privacy` render in both locales with the visible DRAFT notice.
29. Register without ticking the consent box → blocked; raw
    `curl -X POST /auth/register` without `acceptTerms: true` → **400**.
    With it → account created and `terms_accepted_at` set (DB).

## H — Google sign-in (needs GOOGLE_CLIENT_ID/SECRET; register the redirect URI `${WEB_ORIGIN}/auth/google/callback` exactly)

30. Unconfigured: no Google button anywhere; `GET /auth/google/start` → 503.
31. Configured: "Continue with Google" on login; on register it is disabled until consent is checked. New Google account → lands on `/`, `auth_identity` row exists, `password_hash` NULL, password login refused, the reset flow adds a password.
32. Google with an email that already has a password account → same account (no duplicate), `google_linked` in the audit log.

## I — Passkeys (needs WEBAUTHN_RP_ID=localhost + WEBAUTHN_ORIGIN=http://localhost:3000 locally; real devices)

33. Unconfigured: no passkey UI; `POST /auth/webauthn/login/options` → 503.
34. Configured, on Windows Hello and one Android: `/account` → Passkeys → Add → platform prompt → row appears with your label.
35. Sign out → "Sign in with a passkey" → straight in, `last_used_at` updates, `passkey_login` audited.
36. Remove the passkey → that login refused; password unaffected.
37. Ops note: on `*.vercel.app` the rpID must be the full subdomain — enrolled passkeys die on a custom-domain move (re-enroll then).

## J — Delivery requests

38. A tier-ineligible user sees no delivery card; raw `POST /delivery` → 403 `delivery_not_eligible`.
39. An Emerald/Sapphire user: Portfolio shows **Physical delivery** → request 100g with phone + address → status "Requested"; over-balance → refused; a second open request for the same metal → 409.
40. **Zero ledger rows moved** (SQL: entry count unchanged; zero-sum still 0/0/0).
41. `/admin/delivery`: the row shows the requested grams AND the user's live "holds now" figure; Approve → Schedule (+7 days) → the user's card shows "Scheduled" with the date; each step audited + emailed (`delivery_*`).

## K — Badges

42. Fresh user → all five badges outlined/muted with criteria tooltips.
43. After a first settled buy → "First purchase" turns gold on the next Portfolio load; ≥1g gold flips "Gold holder". No DB writes during reads.

## L — 3D metal visualization

44. Portfolio: "Your metal" card renders a slowly rotating 3D ingot per held metal; the gram caption equals the holdings table exactly.
45. 5g vs 20g accounts: the 20g bar is visibly larger but NOT 4× — cube-root (≈1.59× linear), because mass ∝ volume.
46. Home: a compact ingot in the total-holdings card for the largest metal.
47. OS "reduce motion" ON, or GPU acceleration off → a static SVG ingot at the same scale; no crash, no spinner.
48. `pnpm --filter @alkeva/web build`: three.js appears only in an async chunk (grep `WebGLRenderer` in `.next/static/chunks` — not in the shared first-load files).

## M — Regression (the money core, after everything above)

49. Buy + sell settle to the cent; triple-confirm → one order; `kyc_required` fires for tier-0; zero-sum 0/0/0 on all three assets; append-only trigger still rejects UPDATE.
50. Daily sell-back/tier caps now reset at **midnight EAT** (21:00 UTC): a sell at 22:30 UTC counts toward the NEXT Addis day (`eatDayStartUtc`).

## N — Post-review fixes (2026-08-16): threads, admin access, shadcn, 3D

### Assistant — long-term multi-thread chat
51. `/assistant` (desktop): a **thread rail** on the left lists every past conversation (title = your first message, newest activity first, EAT stamp). Opening the page lands on the most recent thread with its full history — conversations persist forever in our own database.
52. "New conversation" starts a blank thread; the first send creates it server-side and it appears in the rail. Sending with a thread open **continues that thread** (the model remembers earlier turns — ask a follow-up like "and platinum?").
53. The trash icon on a rail row opens a **confirmation dialog**; deleting removes the thread (active thread → back to a blank chat). Deleting/fetching another user's thread id via curl → **404**.
54. Phone width: the rail collapses into a dropdown thread picker + New button above the chat.
55. Replies render as markdown (bold, lists) via AI Elements; the input is the AI SDK prompt box (Enter sends, gold submit button); while waiting, a shimmer "thinking" line shows; a failed send still becomes a retryable bubble.

### Admin access from the user app
56. Signed in as staff (admin/compliance/finance): the header **user pill is now a menu** — Account, **Admin console**, Sign out (desktop). A non-staff user sees no Admin console entry.
57. On a phone: `/account` shows an "Admin console →" button for staff only.

### shadcn sweep
58. All admin queues (users/orders/payouts/reviews/kyc/delivery/audit) render on the shadcn Table treatment (row hover, hairline separators). Admin overview now shows role-gated **Recent activity** (newest audit rows) + icons on the queue cards.
59. History + trade Recent orders: statuses are now outlined **Badge** chips (✓ settled gain-green, ◑ review platinum, ✕ rejected loss-red).
60. Home price-alert: the "Set alert" popover is a real **Dialog** (focus-trapped, Escape closes, backdrop).

### 3D
61. Portfolio/Home ingot now has **metal reflections** (image-based lighting, no network fetch — check devtools: no HDR request), a soft contact shadow beneath, and a subtle float + slow turn. Volume ∝ grams unchanged (5g vs 20g ≈ 1.59× linear).

### Passkeys enabled locally
62. `.env` now carries `WEBAUTHN_RP_ID=localhost` + `WEBAUTHN_ORIGIN=http://localhost:3000` — `/login` shows "Sign in with a passkey", `/account` shows the Passkeys card (section I's device steps now runnable). Google stays hidden until `GOOGLE_CLIENT_ID/SECRET` are pasted (section H).
