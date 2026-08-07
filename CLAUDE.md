# ALKEVA — Project Guide & Progress Tracker

**One-liner:** Gold/platinum digital trading platform for Ethiopia — the platform is the counterparty (dealer, not broker), with a double-entry ledger, Chapa payments, Gemini AI assistant (Amharic-first), and an admin console. Deliverable: **investor + bank demo on Thu 13 Aug 2026**, real code, Chapa in sandbox.

**Client:** Tekleweyni Berhe (sole owner) · day-to-day contact: Goitom Hadush · Developer: Dagmfre Seid

## Documents

| Doc | Purpose |
|---|---|
| `docs/ALKEVA_Spec_v1.0.md` | Signed-scope spec: feature register F1–F31, constraints C1–C10, cut list §5.4 |
| `docs/Technical_FactCheck.md` | Verified/corrected technical claims (6 Aug 2026) — read before touching ledger, Chapa, Gemini, or price feed |
| `docs/System_Design_and_Architecture.md` | Final architecture, post fact-check + decisions |
| `docs/Phase_Plan.md` | Phase-by-phase division, re-anchored Aug 6→13 |
| `docs/Gold Platform — Client Discovery.md` | Client's raw form answers (Q1–Q80) |
| `docs/Convo_With_Claude.ai.md` | Original exploration — superseded where it conflicts with the fact-check |
| `docs/ALKEVA_Contract.md` | **Empty — contract not yet written** (known gap) |

## The five non-negotiables

1. **The AI never writes.** Read-only tools only. It cannot trade, approve, freeze, or reallocate.
2. **Balances are never edited.** Every change is a pair of immutable ledger entries; balance is a projection.
3. **Quotes expire.** Users confirm against a quote ID, never a live price.
4. **No one moves money alone.** Privileged actions require a second approver (demo: single-step allowed on cut list, audit-logged always).
5. **Never sell a gram the vault doesn't hold.** Reserve gate enforced *inside* the buy transaction. No admin override.

## The per-phase build loop (agreed 6 Aug 2026)

Every phase in `docs/Phase_Plan.md` runs this exact loop:

1. **Plan** — Claude prepares an implementation plan for the phase **in plan mode**; Dagmfre approves it.
2. **Build** — Claude implements the phase.
3. **Self-verify** — Claude verifies its own implementation end-to-end (running code, checking flows — no coded tests).
4. **Joint verification** — Claude hands Dagmfre **step-by-step manual testing instructions**; Dagmfre runs the app and tests each feature himself.
5. **Fix loop** — bugs found in 3–4 are fixed and re-verified; repeat until both are satisfied with the phase.
6. **Handoff** — Claude runs the `/handoff` skill to produce a handoff document; Dagmfre compacts the session; the next phase starts fresh from CLAUDE.md + the handoff.

Rules inside the loop: progress/decisions are logged here as they happen (not at handoff time); a phase is never declared done while a known bug is open; the next phase's plan starts only after the previous handoff.

## Working rules (how this project is built)

1. **Never guess an external API.** For Chapa or any un-indexed/uncertain external docs: ask Dagmfre for docs/context first. (Chapa endpoints verified 6 Aug against developer.chapa.co — see fact-check §6; two items still need live test keys: wallet `bank_code` values, transfers-in-test-mode.)
2. **No coded tests.** No unit/e2e suites. After implementing each feature: verify it manually end-to-end, then hand Dagmfre written manual-testing steps so he can independently confirm the feature is healthy.
3. **Track everything here.** Every working session appends to the Progress Log below with date/time. Every decision goes in the Decision Log. This file is the single source of truth for project state.
4. **Money is integers.** ETB in cents (`bigint`), metals in milligrams (`bigint`). Rounding happens exactly once, in the quote engine.
5. **Cut-list discipline.** When behind, drop from the cut list in `docs/Phase_Plan.md` — never from the five non-negotiables.

## Stack (decided 6 Aug 2026)

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js + Tailwind + shadcn/ui | Mobile-web-first, Trust Wallet visual reference, Amharic default (`next-intl`, Noto Sans Ethiopic) |
| API | NestJS (TypeScript) | Ledger, trading, treasury, compliance, admin, **and** the Gemini chat endpoint |
| AI | `@google/genai` JS SDK → Gemini 3.6 Flash (demo) / 3.5 Flash-Lite (rehearsal) | **No Python/FastAPI/LangGraph** — dropped 6 Aug |
| DB | PostgreSQL on **Supabase** | Used as plain managed Postgres (connection string); auth is our own JWT |
| Cache | Redis (Render Key Value) | Idempotency keys, rate limiting. Quotes live in Postgres, not Redis |
| Payments | Chapa — hosted checkout + webhooks + transfers API | Sandbox (`CHAPUBK_TEST`/`CHASECK_TEST`) until merchant account signed |
| Price feed | gold-api.com primary, Swissquote public feed fallback, 30s tick | Production later: metals.dev (~$20–40/mo, native ETB) |
| FX | open.er-api.com USD→ETB, cached hourly | Market rate (not NBE indicative). Rate + source stored on every `price_tick` |
| 3D | Three.js / react-three-fiber | Built late; 2D animated fallback ready |
| Hosting | **Render** (web + api + worker) + Supabase | Paid instances for demo (free tier cold-starts). Keep portable for future VPS/cPanel |

## Decision Log

| Date | Decision | Detail |
|---|---|---|
| 2026-08-06 | **A4 — AI scope: explain + alerts only** | Explains prices/history/fees/own position; non-advisory price alerts. Never recommends, never acts. (Spec §4.1 resolved.) |
| 2026-08-06 | **A1 — Fees: fully config-driven** | Commission as env/config (e.g. `FEE_COMMISSION_PCT`, ~1.5–2%); service fee, tax, reforestation as config keys defaulting to 0. No hardcoded rates. |
| 2026-08-06 | **A2 — Treasury: config-driven** | `TREASURY_FLOAT_ETB` + halt threshold as config, seeded with labeled demo values. Real numbers are a client decision, still open. |
| 2026-08-06 | **A3 — Tiers: status labels + limits** | Gemstone tiers computed from holding value (ETB, USD reference); gate per-txn/daily caps + delivery eligibility. Separate from KYC tiers. Bands config-driven. |
| 2026-08-06 | **Backend: Next.js + NestJS, no Python** | Gemini via JS SDK inside NestJS (fact-check §3.1, §5.3). Saves ~1 day. |
| 2026-08-06 | **Hosting: Render + Supabase** | Future migration to VPS/cPanel possible — no platform lock-in code. |
| 2026-08-06 | **Price: free keyless feeds + market FX** | $0 demo. gold-api.com + Swissquote fallback; open.er-api.com FX. metals.dev for production. |
| 2026-08-06 | **Credentials: Dagmfre creates Chapa test + Gemini keys today** | Swap to client-owned before launch. |
| 2026-08-06 | **Amharic: Dagmfre reviews, client spot-checks ~day 5** | Machine-translate → developer review per batch → one client pass on final UI. |
| 2026-08-06 | **Demo spine: full money loop, live on stage** | register → KYC → deposit (sandbox) → buy → portfolio/3D → sell → withdraw → admin approve → AI explains in Amharic. Seeded accounts carry history/badges/freeze/treasury panels. |
| 2026-08-06 | **Languages for 13 Aug: Amharic + English only** | Tigrigna/Afaan Oromo/Somali not demo-quality on Gemini (fact-check §5.1) — positioned as post-demo. |
| 2026-08-06 | **Ledger mechanics** | Row locks (`SELECT … FOR UPDATE`), not SERIALIZABLE; quotes in Postgres with `expires_at`; reserve gate inside buy transaction (fact-check §2). |

## Open items (client-owned)

- [ ] Real treasury float + halt numbers (A2) — config keys exist, values are placeholders
- [ ] Exact fee percentages confirmed before demo (A1) — currently env placeholder
- [ ] Chapa merchant account signed (live keys) — sandbox until then
- [ ] Contract + equity/revenue-share terms (spec §12) — `ALKEVA_Contract.md` still empty
- [ ] Licences/legal preconditions (spec §3) — client-owned, not software

## Progress Log

*Append-only. Format: `YYYY-MM-DD HH:MM — entry — status`.*

- 2026-08-06 21:45 — Read all docs deeply (spec, discovery form, claude.ai convo); found contract empty, timeline 2 days stale, blockers A1–A6 unrecorded — done
- 2026-08-06 22:15 — `docs/Technical_FactCheck.md` written: 8 sections, 3 live-research passes (Gemini, Chapa, price APIs). Key corrections: drop Python sidecar; GoldAPI/Metals-API rejected for free keyless feeds; Amharic+English only for demo; row-locks not SERIALIZABLE; Chapa sandbox confirmed viable — done
- 2026-08-06 22:37 — Grill session complete: A1–A4 resolved (all config-driven), stack/hosting/feed/credentials/Amharic/demo-spine decided — logged in Decision Log above — done
- 2026-08-06 22:40 — CLAUDE.md created (this file): non-negotiables, working rules, stack, decision log, open items — done
- 2026-08-06 22:50 — `docs/System_Design_and_Architecture.md` written: monorepo layout, data model, trading spine, Chapa flows, price/FX pipeline, compliance engine, AI contract, roles, deploy topology — done
- 2026-08-06 23:00 — `docs/Phase_Plan.md` written: Phases 0–7 re-anchored Thu 6→Thu 13 Aug (weekend worked), per-phase done-when + manual-test lists, cut list, payment re-anchoring flag. Weekday correction: today is **Thu** 6 Aug, ~4.5 business days (+weekend) remain — done
- 2026-08-06 23:00 — **Planning complete. Next session: Phase 0 (credentials + repo scaffold), pending Dagmfre's review of the three new docs** — ready
- 2026-08-06 23:10 — Per-phase build loop documented (plan → build → self-verify → joint manual verification → fix loop → /handoff → compact). Phase 1 plan approved (adds decision: **Drizzle ORM** for schema/migrations; Phase 0 confirmed fully done — repo, Render, Supabase, Chapa test keys, Gemini key all exist) — done
- 2026-08-07 00:15 — Monorepo scaffolded (pnpm workspaces: apps/web+api+worker, packages/db+shared, docker-compose, .env.example); `.claude/` untracked from git — done
- 2026-08-07 00:30 — packages/db complete: full 23-table Drizzle schema (bigint money), migration 0000, custom migration 0001 (append-only triggers on ledger_entry+audit_log, deferred zero-sum-per-asset constraint trigger, asset-match trigger), idempotent seed. **Trigger tests passed live**: unbalanced commit rejected, UPDATE/DELETE rejected, asset-mismatch rejected — done
- 2026-08-07 00:45 — NestJS API running (SWC ESM runtime): zod-validated env, argon2id auth with rotating refresh cookies, roles guard, /prices/latest+history, /healthz, throttling. Smoke-tested: register/me/refresh-rotation/logout, wrong-password 401, duplicate 409 — done
- 2026-08-07 00:55 — Price worker running: 30s tick, gold-api.com primary → Swissquote fallback (**fallback verified live** for XAU+XPT), hourly-cached FX (open.er-api.com), integer ETB-cents-per-gram math (sanity-checked vs spot×FX), staleness handling — done
- 2026-08-07 01:05 — Web app running: Next.js 15 + Tailwind 4, next-intl cookie-locale (Amharic default, Noto Sans Ethiopic), register/login, live dashboard (30s refresh, stale warning), /api rewrite proxy keeping cookies first-party (onrender.com is on the Public Suffix List — direct subdomain cookies would be cross-site). **Bug found+fixed in verification**: refresh cookie Path=/auth was stranded behind the proxy prefix → Path=/. Full cookie lifecycle re-verified through the proxy — done
- 2026-08-07 01:10 — render.yaml blueprint + `docs/deploy/render-setup.md` (Dagmfre's dashboard steps) + `docs/manual-tests/phase-1.md` (26-step joint verification). **Awaiting: Dagmfre runs deploy steps + manual tests; fix loop; then /handoff closes Phase 1** — ready for joint verification
- 2026-08-07 15:23 — /handoff run: handoff doc written to `%TEMP%\ALKEVA_Handoff_Phase1_to_Phase2.md`. **Note: joint-verification results (26 steps + Render deploy) were not reported in-session — next session must confirm them first; any failure enters the fix loop before the Phase 2 plan** — done
