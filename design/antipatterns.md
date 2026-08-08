# ALKEVA — Anti-patterns

A match-and-refuse list. If a proposed design contains any of these, rewrite the element with different structure rather than softening it.

---

## 1. The two reflexes this project must beat

Anyone — human or model — asked to design a gold-trading app produces one of two things. Both are wrong here, and the second is the harder trap.

**First-order reflex: the luxury vault.** Black background, gold gradients, thin serif display type, shimmer on the balance, a rotating 3D coin. It is what the category trains you to make. It makes ALKEVA look like a jewelry boutique, and no partner bank wires money to a boutique.

**Second-order reflex: the anti-luxury terminal.** Having rejected gold-and-black, the next instinct is monospace, green-on-black, dense grids, candlestick charts, Bloomberg cosplay. It signals "for professionals" and excludes the shop owner who is the actual user.

The way out of both: ALKEVA is **a custody instrument**, not a luxury good and not a trading terminal. Gold is the commodity on the shelf, not the paint on the walls. The interface is a quiet achromatic instrument in which the only coloured things are the two metals, the primary action, and the current state.

Test before committing: *if someone could guess this design from the words "gold trading app" alone, restart.*

---

## 2. Absolute bans — structural

- **Gradient text.** `background-clip: text` over a gradient. Gold shimmer on the balance is the single most likely slop move in this project.
- **Decorative gradients generally.** The only gradient permitted anywhere is the area fill under the price chart line, where it encodes magnitude.
- **Glassmorphism.** Blurred translucent cards, `backdrop-filter` as decoration. Also costs frames on the target hardware.
- **Side-stripe borders.** `border-left: 4px solid gold` on cards, alerts, or list rows. Never intentional.
- **Glow / outer shadow on gold elements.** Gold does not emit light. A glowing balance is a casino.
- **The hero-metric template.** Big number + small label + three supporting stats + gradient accent card. SaaS cliché.
- **Identical card grids.** Repeated icon + heading + text cards at equal size. History is a divided list; the fee breakdown is one definition list.
- **Nested cards.** Always wrong.
- **Tiny uppercase tracked eyebrows** above section headings. Doubly banned here: Ethiopic has no uppercase, so the pattern cannot exist in the primary language.
- **Numbered section markers** (01 / 02 / 03) as scaffolding.
- **Arbitrary z-index** (`999`, `9999`). Use the semantic scale in `design.md` §6.
- **Text that overflows its container.** Amharic is longer than English; test every label in Amharic at 360px width.

---

## 3. Money and data

- **Abbreviating money.** `24.3k ETB` for a balance. Say `24,318.75`. Abbreviating someone's savings reads as evasive.
- **Rounding for looks.** Money is integer cents end to end; the UI shows exactly what the ledger holds.
- **Proportional numerals.** Every money, gram, percentage, and countdown value is `tabular-nums`. Prices tick every 30 seconds; proportional digits make the whole balance shuffle sideways on each tick.
- **Odometer / rolling / counting-up numbers.** A number mid-animation is a number you cannot read. Money crossfades.
- **Fake precision.** Do not render `14,206.5039` because a float produced it. The quote engine rounds exactly once; the UI displays that number and no other.
- **Fabricated data.** No placeholder sparklines, no invented percentages, no "sample" chart shapes. If data is missing the design shows a skeleton or an empty state. This is a financial product; an invented number in a demo screenshot is a liability.
- **Colour-only gain/loss.** Always sign + arrow + colour. ~8% of male users cannot separate this red from this green.
- **Hiding costs behind a disclosure.** Every fee line is visible before the confirm tap. No "see details" for the thing the user is agreeing to pay.
- **Green/red everywhere.** Gain and loss colour appears on the delta value itself, never as row backgrounds, borders, or card tints.

---

## 4. Amharic and internationalisation

- **ALL-CAPS or small-caps anything.** Ethiopic has no uppercase. A caps pattern designed in English leaves a hole in the primary language.
- **Letter-spacing on Ethiopic.** Breaks the script. Tracking is `0` in Amharic, always.
- **Ethiopic below 15px.** Glyphs carry far more internal detail than Latin; below 15px they turn to mush on a mid-range screen.
- **Latin line-heights on Amharic.** Ethiopic needs roughly +0.2 over the Latin value. A 1.1 display line-height that looks tight and designed in English clips ascenders in Amharic.
- **Designing in English and translating after.** The Amharic string is usually longer. A layout tuned to "Buy" breaks at "ግዛ ወርቅ በአሁኑ ዋጋ".
- **English leaking into the Amharic UI.** Error codes, status labels, month names, "ETB" where `ብር` belongs. Every new string lands in both message files in the same commit.
- **Ethiopic numerals for currency.** Modern Ethiopian finance uses 0–9.
- **Flag-palette shorthand.** Green/yellow/red as a stand-in for "Ethiopian". The cultural reading comes from language and typography, not from a flag.

---

## 5. Product-register discipline

- **Fluid `clamp()` type in app UI.** Fixed rem scale. Users view at a consistent DPI; fluid headings that shrink inside a sheet look worse, not better.
- **Display or serif fonts in labels, buttons, and data.** One family per script, weight and size carry hierarchy.
- **Decorative motion.** Motion conveys state only. No page-load choreography — the user opened the app to check a price.
- **Staggered section reveals on scroll.** The uniform entrance reflex.
- **Spinners centred in content.** Skeletons that match the final layout.
- **"No data" empty states.** Empty states teach the next action.
- **Modal as first thought.** Exhaust inline and progressive alternatives. The trade sheet is a sheet because it must keep context visible, not because modals are the default.
- **Reinventing standard affordances.** Custom scrollbars, novel form controls, invented gestures.
- **Inconsistent component vocabulary.** If the confirm button looks different in two places, one of them is wrong.
- **Shipping half the states.** Every interactive component needs default, hover, focus-visible, active, disabled, loading, and error before it is done.

---

## 6. shadcn-specific

- **Shipping the default slate/zinc theme.** The out-of-the-box shadcn palette is itself a recognisable generated-app tell. Every component is re-tokenised to the ALKEVA palette before it ships.
- **Default border radii and shadows.** Depth in this system is surface + hairline, not shadow.
- **Installing components that never get used.** Each addition is a maintenance surface.
- **Fighting the primitives.** Where Radix behaviour is correct (focus trap, escape handling, aria wiring), keep it. Restyle, do not rebuild.

---

## 7. Tone

- **Celebration on a transaction.** No confetti, no 🎉, no streaks, no "Nice trade!". She moved her savings; she wants confirmation and a receipt.
- **Gamification of any kind.** Badges are activity-only and never rank users by wealth — the client explicitly rejected wealth ranking as a personal-safety risk (Discovery Q38).
- **Hype vocabulary.** "Unlock", "supercharge", "seamless", "revolutionary". No emoji in product copy.
- **Trading-floor language.** "Position", "P&L", "portfolio performance". This is custody: "your grams", "held in the vault", "receipt".
- **Blaming the user in errors.** The message names the rule and the next step. `float_halt` is the platform protecting its ability to pay, and should read that way.

---

## 8. The final check

Two questions before anything is called done:

1. Would a user fluent in the best tools in this category sit down and **trust** this interface — or pause at every subtly-off component?
2. Could someone look at a screenshot and say "AI made that" without hesitating?

If the answer to either is wrong, the fix is structural, not cosmetic.
