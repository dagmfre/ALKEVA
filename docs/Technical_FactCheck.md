# ALKEVA — Technical Fact-Check

| | |
|---|---|
| **Date** | 6 August 2026 |
| **Scope** | Technical claims only, from `Convo_With_Claude.ai.md` and `ALKEVA_Spec_v1.0.md`. Legal/regulatory claims are explicitly **out of scope** per the developer's instruction. |
| **Verdict key** | ✅ Confirmed · ⚠️ Partially true / needs correction · ❌ Wrong · 🔍 Needs user-provided docs |

---

## 1. Money mathematics

| # | Claim | Verdict | Evidence & notes | Impact on build |
|---|---|---|---|---|
| 1.1 | `0.1 + 0.2 = 0.30000000000000004` in floating point; money must never be floats | ✅ | IEEE 754 double precision cannot represent 0.1 or 0.2 exactly. Standard, well-known behaviour in JS/Python/Postgres `float`. | Store **ETB in cents** and **metal in milligrams**, both as `bigint`. Postgres `NUMERIC` is an acceptable alternative but bigint is simpler and unambiguous. |
| 1.2 | Store gold in milligrams | ✅ | 1 g = 1,000 mg. Smallest realistic purchase (e.g. ETB 100 ≈ 0.005 g at ~ETB 20,000/g) = 5 mg — integer-representable. | Precision is sufficient. If sub-milligram dust ever matters, that's a production concern, not demo. |
| 1.3 | (Implied) rounding is a solved problem | ⚠️ | Neither document says **where** rounding happens. Gram↔birr conversion and fee calculation each produce fractions. | Define one rule: **all rounding happens exactly once, inside the quote engine**, and the quote stores final integers (grams_mg, price_cents, fee_cents, total_cents). Order execution copies the quote's integers verbatim — it never recomputes. Fee rounding: round half-up to the cent. |

## 2. Ledger design claims

| # | Claim | Verdict | Evidence & notes | Impact on build |
|---|---|---|---|---|
| 2.1 | Double-entry, append-only ledger; balance is a projection, not a column | ✅ | Standard fintech ledger design (same shape as banking cores and e.g. Stripe/Modern Treasury ledgers). Every movement = entries summing to zero per asset. No `UPDATE balance`. | Core of Milestone 2. `ledger_entry` immutable; balances computed by `SUM()` per account (optionally cached, never authoritative). |
| 2.2 | "Postgres with `SERIALIZABLE` on ledger writes" | ⚠️ | SERIALIZABLE works but forces retry-on-40001 logic everywhere and is stricter than needed. The actual invariant (no overdraft, no double-spend) is enforceable with **`SELECT … FOR UPDATE` row locks on the affected `account` rows inside one `READ COMMITTED` transaction** + a sum-to-zero check before commit. | Use row-locking, not global SERIALIZABLE. Simpler, no retry machinery, adequate for both demo and production at this scale. |
| 2.3 | Quote TTL stored in Redis, confirm against quote ID | ⚠️ | The pattern is valid. But storing quotes **only** in Redis loses them on restart and splits money data across two stores. | Store quotes in **Postgres** with an `expires_at` column (validity checked at confirm time). Redis stays for idempotency keys and rate limiting. One authoritative store for anything money-shaped. |
| 2.4 | Idempotency keys on buy/sell | ✅ | Standard: client sends a UUID per order attempt; server upserts on unique key, returns the original result on replay. Prevents double-submission during network flaps — very plausible on Ethiopian mobile networks. | Unique constraint on `order.idempotency_key`. Cheap to build on day one, painful to retrofit. |
| 2.5 | Reserve gate `SUM(user_grams) ≤ vault_grams`, auto-halt buying | ✅ | Arithmetic invariant; trivially checkable inside the same transaction that posts the buy. No timing gap if checked under the same locks as 2.2. | Enforce **synchronously in the buy transaction**, not only via a background job. A background job alone (as the convo described) leaves a race window. |

## 3. Stack sanity for a solo build (5.5 working days remaining)

| # | Claim | Verdict | Evidence & notes | Impact on build |
|---|---|---|---|---|
| 3.1 | Stack: Next.js + NestJS + **FastAPI/LangGraph** + Postgres + Redis | ⚠️ | Three runtimes (Node ×2, Python) for one developer in 5.5 days is unjustified. The AI feature is: one chat endpoint, three read-only tools, one guardrail system prompt. The Google Gen AI **JS/TS SDK** supports Gemini function calling natively — no Python needed. LangGraph adds orchestration ALKEVA doesn't use (no multi-step agent graphs). | **Recommendation: drop FastAPI/LangGraph.** Implement the AI endpoint inside the Node backend. Saves ~1 day of setup/deploy/CORS/auth-passing overhead. Decision confirmed in grill-me session. |
| 3.2 | Next.js + Tailwind + shadcn/ui for a Trust Wallet-style mobile web UI | ✅ | shadcn/ui is desktop-biased but fully styleable; Trust Wallet's card-list layout is a straightforward mobile-first composition. | Feasible. Keep custom components thin; don't fight the library. |
| 3.3 | Amharic-first interface | ⚠️ | Amharic is LTR (no RTL work), but requires an Ethiopic font — **Noto Sans Ethiopic** (free, Google Fonts) — and an i18n layer (e.g. `next-intl`) wired from day one. Retrofitting i18n mid-build is expensive. Machine translation of financial terms into Amharic needs human review. | i18n scaffolding lands in Phase 1, not Phase 8. Translation review workflow = grill-me question (who reviews?). |
| 3.4 | Device biometric unlock on mobile web ("Face ID / fingerprint") | ⚠️ | Possible via **WebAuthn/passkeys**: platform authenticators (Face ID on iOS Safari, fingerprint on Android Chrome) work in mobile browsers. But it is *passkey login*, not an app-style "unlock overlay"; UX differs from native apps, and enrollment requires a user gesture per device. | Build passkey login as the "biometric" feature (C3 in spec). Set client expectation: browser biometric prompt, not a custom Face ID screen. |
| 3.5 | Three.js 3D gold visualisation, mass proportional to holdings | ⚠️ | Feasible with react-three-fiber: a gold bar/coin stack scaled by weight with a synced gram label ≈ 0.5–1 day including polish and mobile perf testing. It is the most cuttable visual item — the spec's own cut list ranks an animated 2D fallback as saving a full day. | Schedule it late (experience phase), behind the money core. Fallback: animated 2D stack, ~2 hours. |
| 3.6 | "Deploy on Day 1; deployment always eats a day if left to Day 8" | ✅ | Standard, correct practice — first deploy surfaces env/secret/build issues while stakes are low; daily pushes stay small. | Phase 1 ends with the app live on a real URL. |
| 3.7 | Badges computed on read, no cron | ✅ | Activity badges (first purchase, N transactions, streaks) are derivable from `order`/`ledger_entry` history at read time. Correct simplification. | No scheduler needed for badges. |
| 3.8 | Email notifications in demo; SMS deferred | ✅ | Email via a transactional provider is a ~1-hour integration. SMS in Ethiopia requires a local gateway/aggregator — real procurement work. | SMS stays on the cut list (spec already cut it first). |

## 4. Market-fact claims (technical/factual, not legal)

| # | Claim | Verdict | Evidence & notes | Impact on build |
|---|---|---|---|---|
| 4.1 | "Gold did not crash during Covid — it rose ~25% in 2020, peaking ~$2,067/oz in Aug 2020" | ✅ | Matches historical record: gold closed 2020 up ~25%, all-time (then) high $2,067–2,075/oz on 6–7 Aug 2020. The client's loss story is consistent with dealer spread/liquidity, not price. | None on code; relevant to demo narrative accuracy. |
| 4.2 | Client's Q24 plan: "AI monitors the market and advises users to reallocate to platinum/diamonds on a drop" | ❌ (technically, ignoring the legal issue) | Even setting law aside: diamonds have **no spot price feed** (non-fungible, no commodity ticker), so "reallocate to diamonds" is unimplementable as described; and an auto-acting AI on holdings contradicts the platform's own AI-read-only rule (spec Rule 1). | AI stays read-only with price **alerts** (F24). Spec §4.1 already constrains this correctly — confirmed at grill-me. |
| 4.3 | Q17: purity assayed by "high performance AI integrated machinery" | ⚠️ | Assay is an operations claim, not software. No software deliverable depends on it. Noted as outside the build. | None. |

## 5. Gemini API — languages, free tier, function calling

*Verified against live sources, 6 Aug 2026.*

| # | Claim | Verdict | Evidence & notes | Impact on build |
|---|---|---|---|---|
| 5.1 | Gemini supports all five launch languages (Q39: Amharic, Tigrigna, Afaan Oromo, Somali, English) | ⚠️ | **Amharic + English: yes** — Amharic is on Google's official Gemini language list and Gemini is best-in-class among APIs for it, though quality is measurably below English (African-language benchmarks: [IrokoBench](https://arxiv.org/abs/2406.03368), [EthioLLM](https://arxiv.org/abs/2403.13737)). **Somali: usually works, officially unsupported. Tigrigna & Afaan Oromo: not on the official list and weak in practice** ([Tigrinya NLP survey](https://arxiv.org/pdf/2507.17974)). | Demo **Amharic + English** as first-class. Treat Tigrigna/Afaan Oromo/Somali as "beta" or post-demo — do not promise them for 13 Aug. Have a native speaker sanity-check key Amharic strings. |
| 5.2 | Gemini API is free for trial use (client Q45) | ✅ (caveats) | Free tier exists covering the Flash family (3.6/3.5 Flash, Flash-Lite) — [pricing](https://ai.google.dev/gemini-api/docs/pricing). Exact limits are per-account in [AI Studio](https://aistudio.google.com/rate-limit); secondary sources cluster at ~10 RPM / ~250 RPD (Flash), ~15 RPM / ~1,000 RPD (Flash-Lite). **Free-tier data may be used for Google training** — don't put real customer data through it. **2.5-series models shut down 16 Oct 2026** — build on 3.5/3.6. | A live demo chat session (2–4 requests/turn) fits comfortably in 10–15 RPM. Rehearsal days could exhaust Flash's ~250 RPD → rehearse on Flash-Lite or attach billing as safety net. Verify real limits in AI Studio once the client's key is in hand. |
| 5.3 | Function calling works for 3 read-only tools | ✅ | Officially supported on all current Flash-family models incl. free tier; parallel + compositional calling; docs' own examples use `gemini-3.6-flash` — [function calling docs](https://ai.google.dev/gemini-api/docs/function-calling). | The read-only tool architecture works as designed, from the **JS SDK** (supports §3.1's drop-Python recommendation). |
| 5.4 | $100/month AI budget is sufficient | ✅ | 3.5 Flash-Lite: $0.30/$2.50 per 1M tokens in/out; 3.6 Flash: $1.50/$7.50. Even 1,000 conversations/day ≈ $20–25/mo on Flash-Lite, ≈$85–100 on 3.6 Flash. Tier 1 billing (no minimum spend) lifts limits to ~150–300 RPM. | Use **3.6 Flash for the demo itself** (best Amharic quality), Flash-Lite for rehearsal/background. Budget holds. |

## 6. Chapa — aggregation, sandbox, webhooks, payouts

*Verified against official docs at developer.chapa.co, 6 Aug 2026.*

| # | Claim | Verdict | Evidence & notes | Impact on build |
|---|---|---|---|---|
| 6.1 | One Chapa integration covers Telebirr + CBE Birr (justification for spec C7 "Chapa only") | ✅ | Official channel list includes Telebirr, CBEBirr, AwashBirr, M-Pesa ET, Amole, Coopay-Ebirr, major banks, cards, PayPal. Hosted checkout: one `POST /v1/transaction/initialize` → single `checkout_url`; inline.js widget defaults to `['telebirr','cbebirr','ebirr','mpesa','chapa']` — [payment methods](https://developer.chapa.co/payment-methods). *(Minor: docs imply rather than state verbatim that the hosted page shows every enabled channel.)* | Spec C7 stands: **one integration, all key channels**. Telebirr/CBE Birr as separate integrations remain unnecessary. |
| 6.2 | Sandbox works without a verified merchant account (spec C9 depends on this) | ✅ | Quick Start states test mode is available before compliance approval. Sign up at dashboard.chapa.co → API Keys → Test toggle; keys prefixed `CHAPUBK_TEST`/`CHASECK_TEST`. Documented test cards (`4200 0000 0000 0000` etc.) and test mobile numbers (`0900123456`…); webhooks fire in test mode — [test vs live](https://developer.chapa.co/integrations/test-mode-vs-live-mode). | **C9 is safe**: demo runs fully in sandbox; live switch = swapping credentials once the merchant account is signed. **Client should create the dashboard account today.** |
| 6.3 | Webhooks are signed and verifiable | ✅ | Two headers per event: `Chapa-Signature` and `x-chapa-signature` (HMAC-SHA256 with a merchant-set secret hash). Events include `charge.success`, `charge.failed`, `payout.success`, `payout.failed`. Docs require re-verification via `GET /v1/transaction/verify/<tx_ref>` before delivering value — [webhooks](https://developer.chapa.co/docs/webhooks/). | Deposit flow = webhook + mandatory server-side verify call before crediting the ledger. Never credit on the redirect/callback alone. |
| 6.4 | Programmatic payouts exist for withdrawals (F8) | ✅ (one gap) | `POST /v1/transfers` with `account_number`, `bank_code`, `amount`, `currency`; destinations from `GET /v1/banks`; payout limits listed for Telebirr/CBEBirr/M-Pesa imply wallet payouts; bulk transfers, transfer-verify, balance, and merchant-side approval hooks all documented — [transfers](https://developer.chapa.co/docs/transfers/). 🔍 **Gaps**: exact wallet `bank_code` values only come from a live `/v1/banks` call, and docs are **silent on whether transfers work in test mode**. | Withdrawal payout is buildable. Plan B if transfers don't run in sandbox: withdrawal approval queue marks payouts "processed (sandbox)" without a live transfer — acceptable for demo. Resolve with a live `/v1/banks` call once test keys exist. |
| 6.5 | Currency/limits fit the product | ✅ | ETB + USD on initialize/transfers. Per-channel ETB limits: Telebirr 1–75,000; CBEBirr 1–150,000 in / 300,000 out; CBE bank transfer up to 9,999,999; cards 10–500,000 (receive only). | Deposit/withdrawal caps must respect **per-channel** limits (e.g. a 200,000 ETB Telebirr deposit is impossible). Surface channel limits in the deposit UI. |

**Follow-ups requiring credentials (not guesses):** run `GET /v1/banks` with test keys for wallet bank codes; empirically test whether `/v1/transfers` works in test mode.

## 7. Price feed APIs — gold + platinum in ETB every ~30s

*Verified against provider pricing pages and live endpoints, 6 Aug 2026.*

| # | Claim | Verdict | Evidence & notes | Impact on build |
|---|---|---|---|---|
| 7.1 | "GoldAPI / Metals-API to start — cheap, fine for a demo" | ❌ | **Neither free tier survives a 30s tick.** GoldAPI free = 100 req/**month** (≈1 poll per 7 hours) and has **no ETB** at any price. Metals-API has no free tier; sub-minute updates require its $149.99 tier — over the $100 budget — [goldapi.io](https://www.goldapi.io/), [metals-api.com/pricing](https://metals-api.com/pricing). | The convo's named vendors are the wrong choice. Use the alternatives below. |
| 7.2 | A free 30s gold+platinum feed exists for the demo | ✅ | Two verified keyless free sources: **gold-api.com** (XAU, XPT, USD, unlimited, no key) and **Swissquote's public quote feed** (live bid/ask JSON for XAU/USD and XPT/USD, ms timestamps) — both confirmed serving live data. | **Demo period = $0**: poll one (other as fallback) every 30s, convert via cached USD→ETB. No SLA on either — the fallback source is not optional. |
| 7.3 | Production within $100/month | ✅ | **metals.dev**: `&currency=ETB` native, one call returns all metals, 60s max data delay on every tier. $19.99/mo = 50k req (~52s polling); $39.99/mo = 100k req (~26s) — [metals.dev/pricing](https://metals.dev/pricing). | Production pick: **metals.dev $19.99–39.99/mo**, keeping the free feeds as outage fallback. Budget holds with big headroom. |
| 7.4 | USD→ETB conversion is solvable | ✅ (nuance) | Free market-rate APIs: `open.er-api.com` (keyless, daily update), Open Exchange Rates (hourly, 1,000 req/mo free). **The official NBE indicative rate has no public API** — it's a daily weighted average published on nbe.gov.et (scrape) or via paid third parties (Fluentax). | FX is repriced daily/hourly, so one cached fetch per hour costs nothing. **Design decision for grill-me: market rate vs NBE indicative rate** — they can differ, and which one prices gold in birr is a business choice the client should own. Store the rate used on every `price_tick` for auditability. |
| 7.5 | Platinum feed is available wherever gold is | ✅ | XPT confirmed on gold-api.com, Swissquote, metals.dev, GoldAPI, Metals-API, Twelve Data. | Platinum stays feasible; its cut-list position is about UI/testing time, not data availability. |

## 8. Day-plan feasibility (re-scored for the real calendar)

The claude.ai 8-day plan assumed a start on Mon 3 Aug. **Nothing has been built and today is Thu 6 Aug** (evening) — of the spec's 8 working days, 3 are already gone. Remaining on the spec's business-day calendar: Fri 7, Mon 10, Tue 11, Wed 12 (+demo-day morning) ≈ **4.5 days**; working the weekend (Sat 8, Sun 9) brings it to **~6.5 days**. The phase plan assumes weekend work. Verdict on "8 days is enough as planned": ⚠️ **stale — must be re-planned**, which is exactly what `Phase_Plan.md` does. Key corrections:

1. **Foundation + money core must compress** (spec allotted 4 days; ~2.5 available). Achievable only because the ledger design arrives pre-decided (this document, §1–2) instead of being designed mid-build.
2. **The cut list activates immediately**, not "when behind": SMS (already cut), badges → if time, platinum → gold-first with platinum behind a flag, withdrawal approval → single-step, 3D → build last with 2D fallback ready.
3. **Never-cut four stands**: ledger correctness, reserve gate, quote expiry, audit log. Verified as the correct minimum for a credible financial demo.
4. **Chapa sandbox credentials are the long-lead item** — request today (spec itself warned this; it is now 3 days later than that warning).

---

## Summary of corrections that change the build

1. **Drop the FastAPI/LangGraph sidecar** — Gemini function calling works from the JS SDK; one less runtime (§3.1, §5.3).
2. **Price feed: not GoldAPI/Metals-API.** Demo on free keyless feeds (gold-api.com / Swissquote) with a fallback source; production on metals.dev with native ETB (§7).
3. **Languages: Amharic + English only for 13 Aug.** Tigrigna/Afaan Oromo/Somali are not demo-quality on Gemini — set client expectations now (§5.1).
4. **Ledger: row locks, not SERIALIZABLE; quotes in Postgres, not Redis; reserve gate enforced inside the buy transaction** (§2).
5. **Rounding happens once, in the quote engine**; orders copy quote integers verbatim (§1.3).
6. **Chapa is confirmed viable in sandbox** — but the dashboard account must be created immediately, and two items need live test keys to resolve (wallet bank codes; transfers-in-test-mode) (§6).
7. **Deposit UI must respect per-channel limits** (Telebirr caps at ETB 75,000/txn) (§6.5).
8. **The 8-day schedule is stale** — 5.5 working days remain; the cut list activates from day one (§8).

*All sections verified. Document complete as of 6 Aug 2026, ~22:30.*
