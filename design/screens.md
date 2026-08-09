# ALKEVA — Screens

Seven screens plus system states. **Each screen = one full 1440px desktop frame + one 390px mobile variant** (the artifact contract in `README.md`). Every number below is **real output shape from the live API** (Phase 2 + the Phase 3 backend are built and verified), and every Amharic string is the one already shipping in `apps/web/messages/am.json`. Design against these, not against placeholder text — Amharic runs longer than English and the layouts have to survive it.

Reference numbers used throughout (plausible live values):
`XAU 22,525.85 ETB/g` · `XPT 9,091.66 ETB/g` · commission 2% · FX ≈ 161.31 ETB/USD

---

## Global chrome

### Desktop (≥1024px) — sidebar + top bar

**Left sidebar** (~240px, fixed): ALKEVA wordmark at top, then five nav items, icon + label. Active item = gradient gold pill, dark ink:

| Icon | Amharic | English |
|---|---|---|
| home | መነሻ | Dashboard |
| trade | ግብይት | Trade |
| portfolio | ንብረቴ | Portfolio |
| history | ታሪክ | History |
| account | መለያ | Account |

**Top bar**: page context left; right side: ETB balance chip (tabular), locale toggle (አማ · EN), account. On desktop, **Trade navigates to the trading workspace page** — it does not open a sheet.

### Mobile (<1024px) — bottom tab bar

Same five items, fixed bottom, safe-area inset, icon + label. The **Trade** tab opens the trade bottom sheet over the current screen rather than navigating — the price or holding that prompted the trade stays visible behind it.

Header: ALKEVA wordmark left, locale toggle right, no back button on tab roots. Sub-screens (receipt) get a back affordance.

---

## 1. Auth — register / login

**Desktop (1440):** split layout — left panel carries the brand (mark, wordmark, tagline `ዲጂታል የከበሩ ማዕድናት ለኢትዮጵያ` on the warm dark ground); right panel carries the form. **Mobile (390):** single centred column, brand above the form.

Two fields on login (`ኢሜይል`, `የይለፍ ቃል`), three on register (plus `ሙሉ ስም`). Titles: `መለያዎን ይፍጠሩ` / `እንኳን ደህና መጡ`.

This is the first impression for an investor watching the demo. It carries the mark, the tagline (`ዲጂታል የከበሩ ማዕድናት ለኢትዮጵያ`), and the locale switcher — a user who cannot read English must be able to switch **before** authenticating.

Errors are field-level and specific: `ኢሜይል ወይም የይለፍ ቃል ትክክል አይደለም።` Never a generic banner when the API told us which field failed.

---

## 2. Home — the dashboard

The screen the shop owner opens ten times a day, and the first screen the investor sees. It answers "what is gold worth right now" above the fold, in Amharic, without scrolling.

**Desktop (1440):** a real dashboard grid, not a column. Balance strip and the two metal price cards across the top row; below, the **price chart takes ~2/3 of the width at ≥320px tall** with the trust panel and the primary buy action in the right column beside it. Everything above the fold at 1440×900.

**Mobile (390):** the same content, single column, in the order below.

**Order of content:**

1. **Balance strip** — `ETB 130,812.57` · `ወርቅ 5.000 ግ` · `ፕላቲነም 2.000 ግ`. Tabular, high contrast. If all three are zero, this collapses into a single "get started" line instead of three zeros.
2. **Metal price cards** — XAU and XPT. Each: price per gram, 24h delta (`+1.24%` with sign and up-arrow, gain colour), last tick time (`ተዘምኗል 14:32`), source. Tapping a card selects it for the chart.
3. **Price chart** — the selected metal, range tabs `24h · 7d · 30d · 1y`. Drag to read a point (value + timestamp). 1y data is seed-backfilled so all four ranges always have a line; no range is ever empty.
4. **Trust panel** — the reserve statement. Plain sentence plus figures: physical grams in vault, grams issued to users, coverage. **Note for design: demo coverage is enormous** (5,000 g held against ~130 g issued ≈ 38× backed), so do not design a gauge that assumes a 0–200% range. A ratio this large should read as reassuring, not broken.
5. Primary action: **ግዛ** (Buy) — opens the trade sheet with the selected metal.

Stale feed → caution banner above the cards: `የዋጋ ምንጭ ዘግይቷል — የመጨረሻውን የታወቀ ዋጋ በማሳየት ላይ`. Prices stay visible (last known), the buy action stays available (the API refuses stale quotes itself and explains why), and the timestamp becomes the most prominent thing on the card.

---

## 3. Trade — the trading workspace

The most important surface in the product. Two stages; the user must never lose the amount they typed.

**Desktop (1440):** a dedicated page with **three panels side by side** — the Gauld composition (`previews/goodl coloring…jpg` shows exactly this for a gold product):

1. **Left — selection & context (~280px):** asset toggle (ወርቅ / ፕላቲነም), side toggle (ግዛ / ሽጥ), available balance, current spot price for the selection.
2. **Centre — the order (~520px):** the amount stage, then the quote stage in place — amount field with unit and quick chips, live estimate, then the binding quote: full fee breakdown, the 30-second countdown ring, and the **gradient gold confirm CTA** full-width at the panel's foot. The two stages swap inside this panel; the left and right panels stay put.
3. **Right — the live chart (~flexible):** the selected metal's price chart with range tabs, so the trader watches the market while the quote counts down.

**Mobile (390):** the existing **bottom sheet** over whatever screen prompted the trade — same two stages stacked, chart omitted (it is visible behind the sheet).

### Stage A — amount

- Asset toggle `ወርቅ` / `ፕላቲነም`
- Side toggle `ግዛ` (Buy) / `ሽጥ` (Sell)
- Amount field, `inputMode="decimal"`, unit inside the field (`ግራም`)
- Quick chips: 1 g · 5 g · 10 g · max
- Below the field, live: "≈ 112,629.25 ETB at the current price" — an estimate, clearly not a quote
- Available balance shown inline so the user knows their ceiling before being refused

### Stage B — the quote (the trust artefact)

A binding 30-second price. Everything visible, nothing behind a disclosure:

```
ዋጋ በግራም      22,525.85
ግራም                5.000
ንዑስ ድምር       112,629.25
ኮሚሽን            2,252.58
─────────────────────────
የሚከፍሉት        114,881.83  ETB
```

Zero-value lines (tax, reforestation) are **omitted**, not shown as `0.00`.

- **Countdown ring** with seconds: `ዋጋው በ23 ሰከንድ ያበቃል`. Under 5s the ring turns destructive.
- At zero: confirm disables, ring is replaced by `ዋጋው አብቅቷል — አዲስ ዋጋ ይጠይቁ` and a "new price" action. The breakdown stays on screen so the user can compare the new quote to the old one.
- Confirm is a single deliberate action, full width, gold fill with dark ink. **It is intentionally not disabled while in flight** — the API is idempotent per quote and the demo shows that double-taps produce exactly one order. Design a pressed/pending state that makes a second tap feel harmless rather than blocking it.

### Outcomes

| Result | Treatment | String |
|---|---|---|
| Settled | Quiet confirmation, receipt link. **No celebration.** | `ትእዛዙ ተፈጽሟል ✓` |
| Review (≥500k) | Neutral, informative — this is not an error | `ትእዛዙ ለግምገማ ቀርቧል — ትላልቅ ግብይቶች በቁጥጥር ቡድናችን ይመረመራሉ` |
| Rejected | Critical, names the rule | see the rejection table below |

### Rejections — every one needs a design

These are not edge cases; they are how the platform explains its own safety rules, and several will be demonstrated live on stage. All 17 strings exist in both locales under `trade.errors.*`.

| Code | Amharic | Treatment |
|---|---|---|
| `quote_expired` | ዋጋው አብቅቷል። አዲስ ዋጋ ይጠይቁ። | inline, offers new quote |
| `insufficient_balance` | በቂ የብር ቀሪ ሂሳብ የለም። | inline, offers deposit |
| `insufficient_metal` | ለሽያጭ በቂ ማዕድን የለም። | inline |
| `reserve_halt` | ግዢ ለጊዜው ቆሟል — የካዝና ክምችት ገደብ ላይ ደርሷል። | **critical banner** — a platform-level state |
| `float_halt` | ሽያጭ ለጊዜው ቆሟል — የገንዘብ መጠባበቂያ ጥበቃ በሥራ ላይ ነው። | critical banner |
| `sellback_ceiling` | የዛሬው የመልሶ ሽያጭ ጣሪያ ደርሷል። ነገ ይሞክሩ። | caution, names tomorrow |
| `tier_txn_cap` / `tier_daily_cap` | …የአንድ ግብይት ገደብ ይበልጣል። / …የቀን ገደብ ደርሷል። | caution + link to tier |
| `account_frozen` | መለያዎ ታግዷል። እባክዎ ድጋፍን ያነጋግሩ። | critical, blocks the sheet |
| `stale_price` | የዋጋ መረጃ ዘግይቷል — እባክዎ ትንሽ ቆይተው ይሞክሩ። | caution |

`reserve_halt` and `float_halt` deserve special care. They are the two rules that make ALKEVA a real custodian, and a bank will ask about them. When they fire, the message should read as **the system protecting the user**, not as the app failing.

### Demo faucet

`የሙከራ ብር ያግኙ` — visible only while `DEMO_FAUCET_ENABLED`. It must look unmistakably like scaffolding (dashed outline, muted, labelled as demo), never like a real deposit. It disappears entirely when Chapa lands in Phase 4.

---

## 4. Portfolio

**Desktop (1440):** two columns — total value and the per-metal holding panels in the wider left column; tier card and cash balance in the right column. **Mobile (390):** single column in the order below.

1. **Total value** — display size, `130,812.57 ETB`, with gain/loss beneath: `−2,252.58 · −1.96%` (sign + arrow + colour).
2. **Per-metal holdings** — grams, current value, cost basis, gain/loss. Gold row uses gold-400 for its value; platinum uses platinum-400.
3. **TierCard** — gemstone tier with progress to the next band.

**The first-loss problem — design for this explicitly.** A user who buys and immediately opens Portfolio sees a loss exactly equal to the commission they just paid (buy 5 g at 114,881.83, hold 5 g worth 112,629.25, down 2,252.58). That is correct and honest, and it is also the first thing a brand-new user sees. The design must make it legible rather than alarming: gain/loss is stated calmly, at a smaller weight than the holding itself, with the commission explicable. Do not hide it, do not make it red-and-huge.

**Tier bands** (USD reference, stored ETB — Discovery Q32):

| Tier | Band | Note |
|---|---|---|
| Gold | < $1,000 | entry tier — see the naming collision in `design.md` §5 |
| Tanzanite | $1,000 – 5,000 | |
| Ruby | $5,000 – 15,000 | |
| Sapphire | $15,000 – 30,000 | |
| Emerald | $30,000+ | delivery eligible |

The card shows current tier, progress to the next band, and what the next band unlocks (higher caps, and at Emerald, physical delivery). Tier is a **facet mark plus a label** — never a coloured fill that competes with the asset colours.

---

## 5. History

**Desktop (1440):** a **real table** — columns: date/time, side + asset (`ግዛ ወርቅ`), grams, total ETB, status, receipt link. Row height ≥48px, day-group headers as full-width subhead rows, rejected rows carry their reason in the status column.

**Mobile (390):** a **divided list, not a stack of cards.** Newest first, grouped by day. Each row: side + asset, grams, total ETB, status, time. Tapping opens the receipt.

Statuses that must be visually distinct: settled · review · rejected. Rejected rows show their reason inline — a user should be able to scroll their history and understand every refusal without tapping.

Empty state teaches: "You have no transactions yet — buy from 1 gram" with the buy action, not "No data".

---

## 6. Receipt

**This should not look like the rest of the app.** It is a document — the artefact a user screenshots and sends to their family, and the one an investor will ask to see. Tighter type, ruled rows, generous margins, mark at the top.

**Desktop (1440):** the document stays a **centred ~640px column** on the canvas — it is a document, not a dashboard; stretching it wide would destroy it. **Mobile (390):** the same document at full column width.

Contents:
- **Serial number**, prominent — format `ALK-2026-000148`
- Date and time, both locales
- Side, asset, grams
- Full price breakdown, identical line-for-line to the quote the user confirmed
- **Price provenance** — the source and the exact tick timestamp the price came from. This is the line that separates ALKEVA from a spreadsheet: the price was not invented, it came from a named feed at a named moment.
- Order ID and ledger transaction ID, small, monospace-adjacent (this is the one acceptable use of a technical treatment — it is a reference, not UI)

---

## 7. Account

Locale switcher (`ቋንቋ` — አማ / EN, the most-used control here), tier chip, KYC status, email, log out (`ውጣ`).

Quiet by design. Nothing to explore, everything easy to find. **Desktop:** a single settings column (~640px) in the content area — this screen earns no grid.

---

## System states — design all of these

| State | Where | Treatment |
|---|---|---|
| Loading | every screen | skeletons matching final layout; never a centred spinner |
| Stale price | home, trade | caution banner, last-known prices stay visible |
| Trading halted (reserve/float) | home, trade | critical banner, persistent, non-dismissible |
| Account frozen | everywhere | critical, blocks trade entry with support contact |
| Offline | everywhere | last-known values with an explicit "not live" marker |
| Empty portfolio / history | those screens | teaches the first action |
| 200% zoom | all | no horizontal scroll, both locales |

---

## Two open questions for the client

Flagging rather than deciding — both need Goitom before they ship:

1. **Dates in Amharic.** Ethiopia uses the Ethiopian calendar in daily life. Receipts and history currently assume Gregorian. Gregorian with Amharic month names is the safer demo default, but this is a client call.
2. **Logo files.** Discovery Q60 describes interconnected gold and silver forms; no asset file has been delivered. The design should define the mark's shape language and colour relationship so a supplied file can drop in without a re-layout.
