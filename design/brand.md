# ALKEVA — Brand

**Register:** product (design serves the task; the user is moving real money).
**Platform:** **desktop-first responsive web application.** The primary composition is a 1440px workspace (sidebar + top bar + panel grid); every screen also ships a complete 390px mobile variant (bottom tab bar, single column). Neither is a courtesy — but the desktop frame is designed first and the mobile variant derives from it.
**Theme:** dark only, on warm gold-tinted surfaces. No light mode ships for the demo.

---

## What ALKEVA is

A gold and platinum trading platform for Ethiopia. **The platform is the counterparty, not a broker** — when you buy 5 grams, ALKEVA sells you 5 grams it holds in a vault, and it is not allowed to sell a gram it does not hold.

That single fact is the whole brand. ALKEVA is not a market where you meet other traders. It is a dealer that must prove, continuously, that the metal behind your balance exists.

Users buy gold because they do not trust that birr will hold its value. So the product's job is not to feel exciting or expensive. **Its job is to be more trustworthy than the cash under the mattress it is replacing.**

## The scene

> A shop owner in Mekelle stands in her doorway at two in the afternoon, sun straight onto the screen of a three-year-old Android phone. She has 40,000 birr in a tin box and she is deciding whether it is safer as grams. She reads Amharic. She wants to know two things before she taps anything: exactly what it will cost her, and whether ALKEVA actually has the gold.

Everything below follows from that sentence.

- **Sun on a cheap screen** → contrast well above the WCAG floor, large type, no thin weights, no low-contrast "moody" dark styling. Dark mode here is a battery and glare decision, not an aesthetic one.
- **Real money she can't afford to lose** → every cost visible before the irreversible tap; every refusal names the rule that fired.
- **She reads Amharic** → Amharic is the original interface. English is the second edition.
- **She's standing up, one-handed, outdoors** → thumb-reachable primary actions, ≥44px targets, no hover-dependent affordances, no multi-step flows that lose state.

## Who else looks at this

The 13 August demo is for **investors and a partner bank**. They will not test the buy button — they will look for whether this is a real financial system. The reserve ratio, the fee breakdown, the audit trail, and the serial-numbered receipt are the screens that matter to them. Those must look like a bank built them, not like a startup mocked them.

## The central idea

**Rich gold brand, exact gold data.** *(Position revised by the owner, 9 Aug 2026 — the earlier draft was austere; the owner chose the richer direction of the `previews/goodl coloring…` inspiration.)*

ALKEVA should be unmistakably a precious-metals product at a glance: warm gold-tinted dark surfaces, a glossy gradient gold primary action, gold present with confidence. The brand does not apologise for its commodity.

What keeps it a custodian rather than a boutique is not the absence of gold — it is the discipline underneath: every number is exact and legible, every cost is visible before the tap, every refusal names its rule, contrast is measured not eyeballed, and nothing shimmers, glows, or celebrates. Where gold touches *data* — a value, a delta, a chart line — it means the asset, the action, or the selection, never mood.

## The marks

The client's identity is **interconnected gold and silver forms** with the ALKEVA wordmark below (Discovery Q60). No asset files have been delivered — the design system should define the marks as shapes and colour relationships that a final logo can slot into, not depend on a specific file.

The interconnection is not arbitrary decoration: **gold and silver are the two things ALKEVA actually trades.** Gold = XAU. Silver/platinum-white = XPT. The identity and the product are the same two materials, so the palette does double duty — brand colour *is* asset colour. Use that. A gold value on screen and the gold in the logo should be the same gold.

## Voice

Plain, exact, and slightly formal — the register of a bank teller who respects you, not a fintech app that wants to be your friend.

- **Say the number.** "You pay 24,318.75 ETB" — not "Almost there!" or "Great choice."
- **Name the rule when refusing.** "Selling is paused — cash float protection is active." The user should learn how the system works from its refusals.
- **Never celebrate a transaction.** No confetti, no "🎉", no streaks. She moved her savings; she wants confirmation, not applause. A settled order gets a quiet, unambiguous confirmation and a receipt.
- **No hype vocabulary.** No "unlock", "supercharge", "seamless", "revolutionary". No emoji in product copy.
- **Custody language over trading language.** "Your grams", "held in the vault", "receipt" — not "position", "portfolio performance", "P&L".

## Amharic is first

Amharic (አማርኛ) is the default locale, not a translation layer. Design every screen in Amharic first and check that English fits the same box afterwards — Amharic strings usually run longer, and a layout tuned to English breaks when Amharic arrives.

Script facts that are design constraints, not preferences:

- **Ethiopic has no uppercase.** Any pattern built on ALL-CAPS or small-caps labels simply does not exist in the primary language. Do not design one for English and leave Amharic with a hole.
- **Never letter-space Ethiopic.** Tracking breaks the script's rhythm and legibility.
- **Ethiopic glyphs are denser and taller** than Latin. They need a larger minimum size and more line-height than the same content in English.
- **Numerals stay Western** (0–9). Ethiopic numerals are not used for currency in modern Ethiopian finance.

## Anti-references — what this must not look like

| Not this | Why |
|---|---|
| **Binance / Bybit / crypto exchange** | Candlesticks, order books, neon greens, leverage energy. ALKEVA is savings, not a trading floor. A user who feels like a day-trader here is being mis-sold. (Its *layout bones* — sidebar, panel grid, chart given room — are fine; see the structure inspiration. Its energy is not.) |
| **Luxury jewelry-box** | Thin serif display, shimmer sweeps, glow, rotating 3D coins, gradient *text*. The warm surfaces and gradient CTA are brand (owner's call); the boutique theatrics on top of them are still out. |
| **Generic AI-fintech dashboard** | Big hero metric, gradient card, rainbow chart, identical icon-heading-text card grid. Instantly reads as generated. |
| **Bloomberg / terminal cosplay** | Monospace everything, dense green-on-black grids. Signals "for professionals", excludes the actual user. |
| **Robinhood gamification** | Confetti, streaks, celebratory animation on trades. Actively irresponsible for a product replacing someone's cash savings. |

## Design principles

1. **Prove, don't promise.** Any screen that shows metal can show where the metal is. Reserve ratio, vault backing, and provenance are interface elements, not footnotes.
2. **The number is the interface.** Grams and birr are the content; everything else is chrome that serves them. Money is never abbreviated, never rounded for looks, never animated in a way that makes it unreadable mid-change.
3. **Amharic is the original.** If a pattern cannot be done well in Ethiopic, it is not the pattern.
4. **No surprises with money.** Every cost is on screen before the irreversible tap. Every rejection names its rule and says what to do next.
5. **Built for daylight and cheap phones.** High contrast, large targets, few web fonts, no effect that costs a frame on a mid-range Android.
