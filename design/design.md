# ALKEVA — Design System

Dark-only. Mobile-first. **shadcn/ui is the component foundation** — every token below is written in shadcn's CSS-variable vocabulary so the approved design drops straight into `components.json` css-variables mode with no translation step. Tailwind v4 (CSS-first `@theme`, no `tailwind.config.ts`).

Colour is authored in **OKLCH**.

---

## 1. Colour strategy

**Restrained, executed with conviction.** The interface is achromatic ink; the only saturated things in it are the two metals. That is not timidity — it is the system: if something is coloured, it is either an asset, an action, or a state. Nothing is coloured for atmosphere.

Consequence to hold onto: **there is no decorative colour anywhere.** No coloured section headers, no tinted card backgrounds "for warmth", no gradient anything.

### Neutrals — the ink

Imperceptibly warm (chroma ≤ 0.006) so gold sits in the same world without the background itself reading as brown. Not pure black: `#000` plus gold is the jewelry-box cliché, and pure black raises smear on cheap OLED panels during scroll.

| Token | OKLCH | ≈ hex | Use |
|---|---|---|---|
| `--background` | `oklch(0.145 0.004 95)` | `#191816` | App canvas |
| `--card` | `oklch(0.196 0.004 95)` | `#232220` | Cards, list surfaces |
| `--popover` / surface-2 | `oklch(0.238 0.005 95)` | `#2c2a27` | Sheets, dialogs, menus |
| `--muted` | `oklch(0.238 0.005 95)` | `#2c2a27` | Inert fills, skeleton base |
| `--border` | `oklch(0.30 0.005 95)` | `#3b3936` | Hairlines, dividers |
| `--input` | `oklch(0.34 0.005 95)` | `#454340` | Field borders (stronger than dividers) |
| `--foreground` | `oklch(0.968 0.003 95)` | `#f7f5f2` | Primary text, numbers |
| `--muted-foreground` | `oklch(0.735 0.008 95)` | `#b5b0a7` | Labels, secondary text — **6.0:1 on `--card`** |
| subtle-foreground | `oklch(0.62 0.008 95)` | `#918d86` | Timestamps only, ≥14px — **4.9:1 on `--background`** |

There is no lighter grey than `subtle-foreground` in this system. If text needs to be quieter than that, it should be smaller or removed, not greyer. Low-contrast text on a sunlit phone is unreadable, and this app is used outdoors.

### Gold — XAU, primary action, current selection

Anchored on the client's brand gold `#d4a017`, extended into a working ramp.

| Token | OKLCH | ≈ hex | Use |
|---|---|---|---|
| `--gold-300` | `oklch(0.86 0.105 88)` | `#f3cd6a` | Hover on gold text, chart hover |
| `--gold-400` | `oklch(0.79 0.142 85)` | `#eeb52c` | **Gold as text/icon on dark — 7.2:1 on `--card`** |
| `--gold-500` | `oklch(0.723 0.146 84)` | `#d4a017` | **Brand anchor.** Primary fills |
| `--gold-600` | `oklch(0.64 0.132 82)` | `#b8860b` | Pressed state on gold fills |
| `--gold-700` | `oklch(0.52 0.108 80)` | `#8f6a09` | Chart fill floor, disabled gold |

```
--primary:            var(--gold-500)
--primary-foreground: oklch(0.16 0.010 84)   /* near-black warm ink — 9.1:1 on gold-500 */
--ring:               var(--gold-400)
```

**Never put white text on gold.** `#fff` on `--gold-500` is 2.3:1 and fails outright. Gold fills always carry the dark ink foreground.

Use gold as **text** only via `--gold-400`. Use it as a **fill** only via `--gold-500`. Mixing these up is the single most likely contrast bug in this system.

### Platinum — XPT, and the silver half of the identity

Cool, low-chroma, unmistakably a different metal from gold — and deliberately not navy, because navy-and-gold is the fintech reflex this design is avoiding.

| Token | OKLCH | ≈ hex | Use |
|---|---|---|---|
| `--platinum-400` | `oklch(0.86 0.018 240)` | `#cdd4de` | XPT values, XPT chart line |
| `--platinum-500` | `oklch(0.79 0.020 242)` | `#b6bdc8` | XPT fills, secondary mark |
| `--platinum-600` | `oklch(0.68 0.022 244)` | `#98a0ac` | Pressed / muted XPT |

```
--secondary:            var(--platinum-500)
--secondary-foreground: oklch(0.16 0.008 244)
```

### State colours

| Role | OKLCH | ≈ hex | Notes |
|---|---|---|---|
| gain / success | `oklch(0.76 0.115 152)` | `#6cc48b` | 6.5:1 on `--card` |
| loss / destructive | `oklch(0.70 0.160 25)` | `#ee7b62` | 5.5:1 on `--card` |
| `--destructive-foreground` | `oklch(0.16 0.010 25)` | — | Dark ink on red fills |

**There is no yellow or amber in this system.** Amber warnings would collide with the brand gold and dilute the one signal that means "this is the asset / this is the action". Caution states are built instead from:

- **caution** (stale price, quote about to expire, review pending) → `--popover` surface + `--border` outline + `--platinum-400` icon and text. Cool, quiet, clearly not-normal, never mistaken for gold.
- **critical** (trading halted, account frozen, order rejected) → destructive family.

Gain and loss must never rely on colour alone: always pair with an explicit `+` / `−` sign and a directional arrow. Roughly 8% of male users cannot separate this red from this green.

### Charts

The price chart shows **one series at a time** (one metal, one range). It does not need a categorical palette, and giving it one is how charts start looking generated.

```
--chart-1: var(--gold-400)        /* XAU price line */
--chart-2: var(--platinum-400)    /* XPT price line */
--chart-3: oklch(0.76 0.115 152)  /* gain fill */
--chart-4: oklch(0.70 0.160 25)   /* loss fill */
--chart-5: oklch(0.50 0.006 95)   /* reference / average line, achromatic */
```

Grid: horizontal rules only, `--border` at 40% opacity, 3–4 lines maximum. No vertical gridlines. No axis borders. The area under the line is a single-colour fade from the line colour at 18% to transparent — this is the one place a gradient is allowed, because it encodes magnitude rather than decorating.

---

## 2. Typography

**One family per script, weight and size carry hierarchy.** Product register: no display face, no serif, no font pairing for flavour.

- **Latin + numerals:** Inter (already wired via `next/font`, variable `--font-inter`)
- **Ethiopic:** Noto Sans Ethiopic (variable `--font-ethiopic`)
- Stack: `var(--font-ethiopic), var(--font-inter), system-ui, sans-serif` — Ethiopic first so Amharic never falls back to a system face with poor Ethiopic hinting.

### The numeral rule

Every money value, gram value, percentage, and countdown is set in **`font-variant-numeric: tabular-nums`**. This is not a refinement — prices refresh every 30 seconds, and proportional digits make the whole balance shift sideways on each tick. Apply it at the token level (a `.tnum` utility on every numeric component), not per-instance.

Money is right-aligned in any vertical stack so decimal points line up. Money never wraps. Money is never abbreviated: **`24,318.75` — never `24.3k`.** Abbreviating someone's savings reads as evasive.

### Scale — fixed rem, ratio ≈ 1.2

| Step | Size | Weight | Line-height (Latin / Ethiopic) | Use |
|---|---|---|---|---|
| `display` | 2.25rem / 36px | 600 | 1.1 / 1.3 | Total portfolio value, balance hero |
| `title` | 1.5rem / 24px | 600 | 1.25 / 1.45 | Screen titles |
| `heading` | 1.125rem / 18px | 600 | 1.35 / 1.55 | Section headings, card titles |
| `body` | 1rem / 16px | 400 | 1.5 / 1.7 | Default text |
| `label` | 0.875rem / 14px | 500 | 1.45 / 1.65 | Field labels, row labels, buttons |
| `caption` | 0.8125rem / 13px | 400 | 1.45 / — | Timestamps, provenance — **Latin only** |

**Ethiopic floor is 15px.** Ethiopic glyphs carry far more internal detail than Latin at the same size; below 15px they turn to mush on a mid-range screen. Any caption that must exist in Amharic is set at 15px, not 13px — the Amharic layout is allowed to be slightly taller than the English one.

`letter-spacing`: Latin display may tighten to `-0.01em`. **Ethiopic letter-spacing is always `0`.** Never track Ethiopic text.

No ALL-CAPS anywhere, in either language — Ethiopic has no uppercase, so a caps pattern cannot survive translation.

`text-wrap: balance` on titles and headings; `text-wrap: pretty` on paragraphs.

---

## 3. Shape, spacing, elevation

```
--radius: 0.875rem      /* 14px — cards, sheets */
  sm 0.5rem   (badges, chips, small controls)
  md 0.75rem  (inputs, buttons)
  lg 0.875rem (cards)
  xl 1.25rem  (bottom sheets — top corners only)
  full        (tab pills, tier chips, asset toggle only)
```

Spacing is a 4px base scale. Page gutter 16px. Card padding 16px, 20px for the primary card on a screen. Section rhythm 24px between related blocks, 32px between unrelated ones — vary it; even spacing everywhere reads as a wireframe.

**Elevation is surface + hairline, not shadow.** On a dark canvas, drop shadows are nearly invisible and cost paint time. Depth comes from stepping `--background` → `--card` → `--popover` with a 1px `--border`. The only shadow in the system is on the bottom sheet, and it exists to separate the sheet from the scrim, not to look raised.

Bottom sheets: `--popover` surface, `--radius-xl` on top corners only, scrim `oklch(0 0 0 / 0.6)` — no backdrop blur (it costs frames on the target hardware and glassmorphism is banned).

**Cards are not the default answer.** The transaction history is a divided list, not a stack of cards. The fee breakdown is a definition list inside one card, not four cards. Nested cards never occur.

---

## 4. Motion

Durations 150–220ms. Easing `cubic-bezier(0.16, 1, 0.3, 1)` (expo-out). No bounce, no elastic, no spring overshoot.

Motion conveys state and nothing else. There is **no page-load choreography** — the user opened the app to check a price.

The one piece of expressive motion in the product is the **quote countdown ring**, and it earns it: it is a real 30-second deadline on a binding price, and the ring is the most legible way to show time draining. It runs continuously while a quote is live.

Money values **crossfade** when they change (120ms). They never roll, tick, or odometer — a number mid-animation is a number you cannot read, and this is someone's balance.

`prefers-reduced-motion: reduce`:
- countdown ring → static arc, seconds count in text
- sheets → instant, no slide
- crossfades → instant swap
- skeletons → static muted blocks, no shimmer sweep

---

## 5. Components

### shadcn base (install these)

`button` · `card` · `tabs` · `sheet` · `dialog` · `drawer` · `input` · `label` · `badge` · `skeleton` · `separator` · `progress` · `alert` · `sonner` (toast) · `chart` · `scroll-area` · `dropdown-menu` · `avatar` · `tooltip` · `form`

Every one of them is re-tokenised to the palette above. **Nothing ships in shadcn's default slate/zinc look** — that default is itself a recognisable generated-app tell.

Every interactive component needs all seven states before it ships: `default · hover · focus-visible · active · disabled · loading · error`. Focus-visible is a 2px `--ring` offset ring and is never removed — this app is used with a bluetooth keyboard by admins.

Minimum touch target 44×44px, including icon-only buttons and the locale switcher.

### ALKEVA composites

| Component | What it is | Notes |
|---|---|---|
| `MetalPriceCard` | Live price per gram for one metal | Price, delta vs 24h (sign + arrow + colour), tick timestamp, source. Shows a **caution** state when the feed is stale. |
| `PriceChart` | One metal, one range | Range tabs 24h / 7d / 30d / 1y. Line + area fade, 3 horizontal rules, no vertical grid, touch-drag readout. |
| `BalanceStrip` | ETB, XAU g, XPT g | Tabular, right-aligned, the highest-contrast numbers on the home screen. |
| `AssetToggle` | XAU ⇄ XPT | Pill segmented control; selected = gold fill for XAU, platinum fill for XPT. The control itself teaches the two colour identities. |
| `QuoteCountdownRing` | 30s quote deadline | Ring + seconds. Crosses to destructive under 5s. At 0 the confirm button disables and the ring is replaced by "request a new price". |
| `FeeBreakdown` | Definition list: unit price × grams → subtotal, commission, tax, reforestation → **You pay / You receive** | The trust artefact. Every line always visible before confirm — never behind a disclosure. Zero-value lines are hidden, not shown as 0.00. |
| `TrustPanel` | Reserve ratio + vault backing | The bank-facing component. Physical grams held vs grams issued to users, as a ratio and a plain sentence. Uses `--gold-400` for the ratio figure. |
| `TierCard` | Gemstone tier + progress to next | See the tier note below. |
| `OrderRow` | One transaction in history | Side, asset, grams, total, status, time. Divided list row — not a card. |
| `ReceiptDocument` | Serial-numbered receipt | Reads as a document, not an app screen: tighter type, ruled rows, serial prominent, price provenance (source + tick timestamp) at the foot. |
| `BottomTabBar` | Home · Trade · Portfolio · History · Account | Fixed, safe-area inset, 5 items, icon + Amharic label. |
| `SystemBanner` | Stale price, halt, frozen, review pending | caution or critical treatment per §1. Never dismissible when it reflects a live restriction. |
| `AmountField` | Grams or birr entry | `inputMode="decimal"`, tabular, unit suffix inside the field, quick-amount chips beneath. |

### The gemstone tier collision — read this

Holding tiers are named **Gold · Tanzanite · Ruby · Sapphire · Emerald** (Discovery Q32). The lowest tier is called "Gold", and gold is also an asset and the brand colour. A user holding gold at the Gold tier will otherwise see the word twice meaning two different things.

Resolution: **tier identity is a gemstone facet mark, never a colour fill.** Tier appears in exactly one place (the TierCard, plus a small chip in Account), it uses its own faceted-shape mark and a text label, and it never borrows the gold fill used for assets and actions. Tier gemstone hues appear one at a time — the palette never shows five gem colours at once, which would turn the app into a rainbow.

---

## 6. Layout

- Single column, 16px gutters, content max-width 480px centred (desktop shows the phone layout centred on the canvas — this is a mobile product and pretending otherwise costs time we do not have).
- Fixed bottom tab bar; every screen scrolls under it with bottom padding equal to the bar height + safe-area inset.
- Trade is a **bottom sheet**, not a route — it opens over the context the user was reading (a price, a holding) so the number that prompted the trade stays visible.
- z-index scale, semantic only: `dropdown 10 · sticky 20 · sheet-scrim 30 · sheet 40 · dialog 50 · toast 60 · tooltip 70`. Never `999`.
- Skeletons for loading, never centred spinners. Empty states teach the next action ("You hold no gold yet — buy from 1 gram"), never "No data".

---

## 7. Accessibility floor

- Body text ≥ 4.5:1, large text ≥ 3:1, verified against the actual surface it sits on (`--card`, not `--background`) — every value in §1 is stated with its measured ratio.
- Never colour-only: gain/loss carry sign + arrow; status carries a label, not just a dot.
- Focus-visible always present, 2px `--ring`, 2px offset.
- Targets ≥ 44×44px.
- Full `prefers-reduced-motion` path per §4.
- Both locales must pass at 200% browser zoom without horizontal scroll.
