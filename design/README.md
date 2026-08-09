# ALKEVA — Design Brief

**Read this first, then `brand.md` → `design.md` → `screens.md` → `antipatterns.md`.**
Look at the two inspiration images in `previews/` before designing anything (see "The two inspirations" below). The HTML files in `previews/` are references for tokens and mobile-variant composition — a floor to beat, not a target to match.

---

## The artifact contract — read before the prompt

The previous run of this brief failed in a specific way, and this contract exists so it cannot happen again:

> **Deliver each screen as one full frame: a complete page at 1440px desktop width, plus a 390px mobile variant of the same screen. No explanatory prose between components. No annotation paragraphs. No small UI fragments embedded in text. A page that reads as documentation of the design — headings, rationale sentences, 300px component chips — is a failed deliverable, no matter how correct its reasoning is.**

You are not being asked to prove you followed the rules. You are being asked to ship the screens. A frontend developer must be able to open each frame and build the real page from it directly.

---

## The prompt

> Design the interface for **ALKEVA**, a gold and platinum trading platform for Ethiopia where the platform itself is the counterparty — it sells you grams it holds in a vault, and it is forbidden from selling a gram it does not hold.
>
> **This is a desktop-first responsive web application** (Next.js 15 + Tailwind 4 + shadcn/ui). The primary composition is a **1440px desktop workspace**: a fixed left sidebar for navigation, a top account bar, and a multi-panel content grid that actually uses the width — a large chart, side-by-side panels, a real trading workspace. **Every screen also ships a 390px mobile variant** (bottom tab bar, single column) because many users open it on a phone browser — but the desktop frame is designed first and the mobile variant is derived from it, never the reverse. No native chrome, no iOS/Android conventions, no phone bezel anywhere.
>
> The user is a shop owner in Mekelle checking prices on her phone in direct afternoon sun, and an investor at a partner bank opening the same product on a laptop. She reads Amharic. Both need to know exactly what a trade costs and whether ALKEVA actually holds the gold.
>
> The look is **rich, branded gold on warm dark surfaces** — see the two inspiration images. The dark surfaces carry a warm gold tint (never neutral slate, never pure black), the primary CTA is a glossy vertical gold gradient with dark ink text, and gold is present enough that a screenshot is unmistakably a precious-metals product. Restraint still applies where it protects the user: money is never animated illegibly, refusals are named, nothing celebrates a transaction, and every contrast ratio in `design.md` is measured, not eyeballed.
>
> Build it on **shadcn/ui**, fully re-tokenised — nothing may ship in shadcn's default look. **Amharic is the original language**, English is the second edition. The system must survive bright sunlight, a mid-range GPU, and strings that are 30% longer than the English ones you are laying out.
>
> This will be demonstrated live to investors and a partner bank on **13 August 2026**. They will look at the reserve ratio, the fee breakdown, and the receipt, and decide whether a real financial system built this.

---

## The two inspirations — structure from one, coloring from the other

Both images are in `previews/`. Each contributes exactly one thing:

1. **`perfect ui structure, details, perfect elements - lacks coloring and branding.jpg`** (a crypto dashboard) — take the **structure**: fixed left sidebar with an active-item pill, top bar with account/balance/avatar, content as a multi-panel grid, the chart given real space, order form beside market data. Ignore its coloring entirely.
2. **`goodl coloring and branding - ignore anything else.jpg`** (a gold trading product — this is literally ALKEVA's category) — take the **coloring and brand richness**: warm gold-tinted dark surfaces, the glossy gradient gold CTA with dark text, gold used confidently as the brand's presence. Note its trading page: metal selector · order form with fee summary · live gold chart, three panels side by side. Ignore its decorative 3D crystals and background imagery.

Neither image is the design. ALKEVA's tokens in `design.md` §1 are the palette; the inspirations set the composition and the level of brand richness.

---

## What to produce, in priority order

Every item below = **one 1440px desktop frame + one 390px mobile variant**, per the artifact contract.

**P0 — the demo spine:**

1. **App shell + Home / dashboard** — sidebar, top bar; content: balance summary, the two metal price cards, the price chart with range tabs given generous width, and the trust panel (vault backing). This is the screen investors see first.
2. **Trade — the trading workspace.** On desktop this is a **dedicated page with three panels side by side**: metal/side selection + available balance · the order form with amount, live estimate, then the binding quote with its full fee breakdown, 30-second countdown ring, and the gradient gold confirm CTA · the live price chart for the selected metal. On mobile it is the existing bottom sheet. The fee breakdown and countdown ring are the most important components in the product.
3. **Portfolio** — total value with gain/loss, per-metal holdings with cost basis, gemstone tier card. Two-column on desktop.
4. **Receipt** — the serial-numbered document. Centred, documentary, unlike the rest of the app — this one stays a narrow column even on desktop, because it is a document.
5. **Foundations** — the token set as a rendered specimen (this one page is allowed to be a specimen sheet: swatches, ramps, type scale in both scripts, spacing, radii, the gradient CTA in all its states).

**P1 —** History (a real table on desktop, divided list on mobile), Account, Auth, and the system states (stale price, halted, frozen, empty, loading skeletons).

**P2 —** badge treatments, 2D/3D holding visualisation. Cut-listed; do not spend P0 time here.

For each screen, show every state it actually has — but as state variants of the full frame, not as fragments in prose.

---

## Hard constraints — these are not preferences

1. **Dark theme only.** No light mode ships for this demo.
2. **shadcn/ui + Tailwind v4** (CSS-first `@theme`, no config file), React 19, Next.js 15 App Router.
3. **Amharic first.** Every layout is validated in Amharic — at 1440px and at 390px. No ALL-CAPS anywhere — Ethiopic has no uppercase. Never letter-space Ethiopic. Ethiopic never below 15px.
4. **Contrast above the WCAG floor**, measured against the surface each element actually sits on. Every colour in `design.md` §1 ships with its computed ratio; keep them. Dark ink on gold, always — white on gold is 1.8–2.4:1 and banned.
5. **`tabular-nums` on every money, gram, percentage, and countdown value.** Prices refresh every 30 seconds.
6. **Money is never abbreviated and never rounded for looks.** `24,318.75`, not `24.3k`.
7. **No invented data.** Every number in a mock comes from `screens.md`. No placeholder sparklines, no sample percentages.
8. **Touch targets ≥ 44px** on the mobile variant; no hover-only affordances for anything a phone user needs.
9. **Full `prefers-reduced-motion` path** for every animation.
10. **`antipatterns.md` is a refusal list**, not advice. Gradient *text*, glassmorphism, shimmer, glow, and celebration-on-transaction remain out. The sanctioned gradient is the primary CTA fill and the chart's area fade — nowhere else.

---

## What already exists

Phase 2 (the money core) and Phase 3's backend are built and verified — ledger, quote engine, order gates, portfolio, history, receipts. **The API is not a mock**; every number in `screens.md` is a real response shape. A first UI implementation exists but was built mobile-only — it is being rebuilt to this brief; do not preserve its layout.

## What success looks like

An investor opens the desktop app and sees a financial workstation a bank could have built — rich, gold, unmistakably branded, and structurally serious. A shop owner opens the same URL on her phone and gets a complete single-column product, not a shrunken desktop. And nobody looking at a screenshot of either says "AI made that."

## Open questions — flag, don't decide

- **Logo files.** The client describes interconnected gold and silver forms with the ALKEVA wordmark below; no asset file has been delivered. Define the mark's shape language and colour relationship so a supplied file drops in without a re-layout.
- **Dates in Amharic.** Ethiopia uses the Ethiopian calendar in daily life. Receipts and history currently assume Gregorian. This is a client call.
