# ALKEVA — Design Brief

**Read this first, then `brand.md` → `design.md` → `screens.md` → `antipatterns.md`.**
`previews/` holds starting-point HTML for the foundations and three concept screens — treat them as a floor to beat, not a target to match.

---

## The prompt

> Design the mobile-web interface for **ALKEVA**, a gold and platinum trading platform for Ethiopia where the platform itself is the counterparty — it sells you grams it holds in a vault, and it is forbidden from selling a gram it does not hold.
>
> The user is a shop owner in Mekelle checking prices on a three-year-old Android phone in direct afternoon sun. She reads Amharic. She is moving real savings out of cash and into metal, and before she taps anything she wants to know exactly what it costs and whether ALKEVA actually holds the gold.
>
> Design a **dark, achromatic instrument** in which the only saturated colours are the two metals, the primary action, and the current state. Gold is the commodity on the shelf, not the paint on the walls.
>
> Build it on **shadcn/ui**, fully re-tokenised — nothing may ship in shadcn's default look. **Amharic is the original language**, English is the second edition. The system must survive bright sunlight, a mid-range GPU, and strings that are 30% longer than the English ones you are laying out.
>
> This will be demonstrated live to investors and a partner bank on **13 August 2026**. They will not test the buy button. They will look at the reserve ratio, the fee breakdown, and the receipt, and decide whether a real financial system built this.

---

## What to produce, in priority order

**P0 — the demo spine.** These five are what gets shown on stage. If time runs out, these must be finished:

1. **Foundations** — the token set as a rendered specimen: surfaces, the gold and platinum ramps, state colours, the full type scale **shown in both Amharic and English**, spacing and radius.
2. **Trade sheet** — amount stage and quote stage. The fee breakdown and the 30-second countdown ring are the most important components in the product.
3. **Home / market** — balance strip, the two metal price cards, the price chart with range tabs, and the trust panel.
4. **Portfolio** — total value, per-metal holdings with cost basis and gain/loss, and the gemstone tier card.
5. **Receipt** — the serial-numbered document. It must not look like the rest of the app.

**P1 —** history list, account, auth, and the system states (stale price, halted, frozen, empty, loading skeletons).

**P2 —** badge treatments, and the 2D/3D holding visualisation (mass proportional to grams held, with a synced gram label — Discovery Q63). Both are cut-listed; do not spend P0 time on them.

For each component, show every state it actually has. A confirm button with no pending state and a price card with no stale state are not finished components.

---

## Hard constraints — these are not preferences

1. **Dark theme only.** No light mode ships for this demo.
2. **shadcn/ui + Tailwind v4** (CSS-first `@theme`, no config file), React 19, Next.js 15 App Router.
3. **Amharic first.** Every layout is validated in Amharic at 360px width. No ALL-CAPS anywhere — Ethiopic has no uppercase. Never letter-space Ethiopic. Ethiopic never below 15px.
4. **Contrast above the WCAG floor**, measured against the surface each element actually sits on. This app is used outdoors in direct sun. Every colour in `design.md` §1 ships with its measured ratio; keep them.
5. **`tabular-nums` on every money, gram, percentage, and countdown value.** Prices refresh every 30 seconds.
6. **Money is never abbreviated and never rounded for looks.** `24,318.75`, not `24.3k`.
7. **No invented data.** Every number in a mock comes from `screens.md`. No placeholder sparklines, no sample percentages.
8. **Touch targets ≥ 44px**, thumb-reachable primary actions, no hover-dependent affordances.
9. **Full `prefers-reduced-motion` path** for every animation.
10. **`antipatterns.md` is a refusal list**, not advice. Gradient text, glassmorphism, side-stripe borders, glow on gold, and celebration-on-transaction are out regardless of how good they look in isolation.

---

## What already exists

Phase 2 is built and verified — the ledger, quote engine, order execution with every safety gate, and treasury projections all work. **The API is not a mock**; every number in `screens.md` is a real response shape.

The current UI is deliberately disposable: two buttons and a number, built only to prove the money core. Do not preserve any of its appearance. What carries forward is the Amharic string set (already complete for the trade flow, both locales) and the token names.

## What success looks like

A user fluent in the best financial tools in this category sits down, trusts the interface, and never pauses at a subtly-off component. An investor looks at the reserve ratio and the receipt and concludes this is a financial system rather than a prototype. And nobody looking at a screenshot says "AI made that."

## Open questions — flag, don't decide

- **Logo files.** The client describes interconnected gold and silver forms with the ALKEVA wordmark below; no asset file has been delivered. Define the mark's shape language and colour relationship so a supplied file drops in without a re-layout.
- **Dates in Amharic.** Ethiopia uses the Ethiopian calendar in daily life. Receipts and history currently assume Gregorian. This is a client call.
