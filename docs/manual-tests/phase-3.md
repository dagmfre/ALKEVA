# Phase 3 — Manual Testing Steps (for Dagmfre)

What the user sees. Every step says what you should see — anything else is a bug: report the step number and we fix before the phase closes.

**Setup:** `docker compose up -d`, then `pnpm db:migrate && pnpm db:seed`, then three terminals — `pnpm dev:api`, `pnpm dev:worker`, `pnpm dev:web`. Open **http://localhost:3000**.
psql shell: `docker exec -it alkeva-postgres psql -U alkeva -d alkeva`.

> **Test both compositions.** This is a responsive website, not a phone app in a browser. The primary composition is the **1440px workspace** (rail + top bar + panel grid) — record the demo there. Below 1024px the same screens become the phone layout (compact header + bottom tab bar); check it in Chrome DevTools → device toolbar → **iPhone 14 Pro (393px)**. Section J needs a real phone.
>
> If you only have time for one pass before recording, run **section M** — it is the demo itself.

---

## A. First impression & the auth gate

1. Open `http://localhost:3000` while signed out → you land on **/login**, not a flash of the app. The ALKEVA mark (two interlocking rings, one gold one silver) and the language toggle are both visible **before** you sign in.
2. Tap the language toggle → the whole page switches between አማርኛ and English and stays switched after a reload. Amharic is the default on a fresh browser.
3. Sign in as your Phase 2 test account → you land on Home.
4. Now type `/login` into the address bar while signed in → you bounce straight back to Home.

## B. Home — the money is legible

5. Home shows, in order: **total holdings** (large, tabular), a row of Gold / Platinum / Birr, two price cards, a chart, the vault panel, and a gold **Buy** button. The bottom bar has five items: መነሻ · ግብይት · ንብረቴ · ታሪክ · መለያ.
6. Watch a price card for ~30 seconds → the price updates in place. **Nothing else on the screen jumps or shifts** when it does (this is the tabular-numerals rule; if digits wobble, that's a bug).
7. Tap the Platinum card → it becomes selected (gold hairline), and the chart *and* vault panel below both switch to platinum. The Buy button relabels to ፕላቲነም ግዛ.
8. Chart: tap **24h · 7d · 30d · 1y** in turn → each draws a line. **None is empty** (the 1y range is seed-backfilled).
9. Vault panel: three figures — in vault, issued, coverage. Coverage reads as a multiple like `38.9×`, not a percentage bar. Hand-check against psql: `SELECT * FROM vault_holding;` and the treasury endpoint.

## C. The trade sheet — the core

10. Tap **Buy** → a sheet slides up from the bottom over Home. You can still see the price behind it.
11. Asset toggle (ወርቅ / ፕላቲነም) and side toggle (ግዛ / ሽጥ) both respond. Type `5` in the amount field, or tap the **5 ግ** chip.
12. Under the field: `≈ <amount> በአሁኑ ዋጋ`, and to the right of "መጠን" your available birr. Both update as you type.
13. Tap **ዋጋ ይመልከቱ** → the quote stage appears with the full breakdown: price per gram, grams, subtotal, commission, and **የሚከፍሉት** in large type. Check on a calculator: price × grams = subtotal, and commission = 2% of subtotal, **exactly**.
14. The ring at top right counts down from 30. Below the breakdown, a line naming the price source and the exact time it was taken.
15. **Watch the ring cross 5 seconds** → ring and seconds turn red.
16. Let it reach 0 → the breakdown dims but **stays on screen** (so you can compare), the button becomes **አዲስ ዋጋ ጠይቅ**, and the text says the price expired.
17. Get a fresh quote and tap **አረጋግጥ** → "ትእዛዙ ተፈጽሟል", the grams you bought, and a **ደረሰኝ ይመልከቱ** button. **No confetti, no celebration** — that is deliberate.
18. Go to Home → your balances have changed by exactly the amounts on the quote.

## D. Idempotency (button-mashing)

19. Get a new quote, then **tap አረጋግጥ 5+ times as fast as you can.** The button stays enabled on purpose.
20. You get one success. psql:
    `SELECT count(*) FROM "order" WHERE created_at > now() - interval '2 minutes' AND status='settled';` → **1**
    `SELECT count(*) FROM ledger_transaction WHERE created_at > now() - interval '2 minutes';` → **1**
    Money moved exactly once.

## E. Rejections — every one is legible and localized

Each of these shows a clear message **in the current language** and leaves balances untouched.

21. **Not enough birr:** try to buy more than you can afford (keep it under 500,000 birr total) → "በቂ የብር ቀሪ ሂሳብ የለም።"
22. **Not enough metal:** switch to ሽጥ and sell more grams than you hold → "ለሽያጭ በቂ ማዕድን የለም።"
23. **Reserve halt** (psql, then restore):
    `INSERT INTO vault_holding (asset, kind, grams_mg, reference) VALUES ('XAU','outtake',4996000,'TEST-SHRINK');`
    Try to buy 2 g → a **red** banner: "ግዢ ለጊዜው ቆሟል — የካዝና ክምችት ገደብ ላይ ደርሷል።" and beneath it the explanation that ALKEVA does not sell a gram it does not hold.
    Restore: `INSERT INTO vault_holding (asset, kind, grams_mg, reference) VALUES ('XAU','intake',4996000,'TEST-RESTORE');`
24. **Float halt:** `UPDATE treasury_config SET halt_threshold_cents = 2000000000 WHERE id = 1;` → any sell shows the red float-halt banner. Restore to `150000000`.
25. **Frozen account:** `UPDATE "user" SET status='frozen' WHERE email='<your test email>';` → any order is refused with the frozen message. Restore to `'active'`.
26. **Over 500k:** faucet up to ~600k, then buy ~30 g gold → **not an error**. A calm "ትእዛዙ ለግምገማ ቀርቧል" telling you compliance will check it and that no money moved. psql: `SELECT rule_key, action FROM compliance_event ORDER BY created_at DESC LIMIT 1;` → `txn_over_500k | review`.

## F. Stale price

27. Stop the worker (Ctrl+C), wait 3+ minutes, reload Home → a **cool grey-blue** banner appears saying the feed is delayed. **The prices stay on screen** (last known) and the timestamp on each card is now the important part. Requesting a quote refuses with the stale-price message. Restart the worker → normal within ~30s.

> The caution banner is deliberately *not* yellow anywhere in this app — yellow would collide with the brand gold. Caution is cool grey-blue, critical is red.

## G. Portfolio

28. Open ንብረቴ → total value, then gain/loss beneath it with a **sign and an arrow**, not just colour.
29. **Right after a buy you will be down by roughly the commission.** That is correct. Below the number there is a sentence explaining exactly that. Confirm it reads calmly and is not alarming.
30. Each metal card shows grams, current value, cost basis, gain/loss. Hand-check cost basis: it is the sum of what you actually paid (fees included) for the grams you still hold.
31. Tier card: a faceted gem mark, the tier name, a progress bar, your holdings in USD, and what the next band unlocks. **The tier mark is never gold-filled** — gold is reserved for the asset and the primary action.

## H. History & receipts

32. Open ታሪክ → transactions grouped by day (ዛሬ / ትናንት / date), newest first, as a divided list.
33. Settled rows are tappable; **rejected rows show their reason inline** — you should be able to understand every refusal without tapping.
34. Tap a settled row → the receipt. It should read like a **document**, not an app screen.
35. The receipt has: serial `ALK-2026-NNNNNN` in gold, date and time, metal, quantity, price per gram, subtotal, commission with its exact percentage, total, then **price source with the feed name and the exact tick timestamp**, then the order and ledger IDs.
36. Cross-check the serial in psql: `SELECT receipt_serial, status FROM "order" ORDER BY receipt_serial DESC LIMIT 5;` → only settled orders have one, and they are unique.
37. Try a rejected order's receipt directly (`/receipt/<rejected order id>`) → "ለዚህ ትእዛዝ ደረሰኝ የለም።" Not a crash.

## I. Account

38. Open መለያ → language toggle, tier, identity check, email, and a log-out button. Tap log out → back to /login, and Home is no longer reachable.

## J. Amharic and the real phone

39. **On a real phone** (Android Chrome and iOS Safari if you have both), sign in and walk the whole journey in **Amharic**: price → quote → buy → portfolio → history → receipt.
    - No English leaks anywhere.
    - No tofu boxes (□) — every Amharic glyph renders.
    - Nothing is cut off; no sideways scrolling on any screen.
    - The bottom bar sits above the home indicator, not under it.
40. Repeat the journey in **English**. Both must fit — Amharic strings are longer, so this is where a too-tight layout shows up.
41. Set the browser zoom to 200% on any screen → still no horizontal scrolling, in both languages.
42. If your phone has "reduce motion" enabled, the countdown ring shows the number without the sweeping animation. Everything still works.

## K. Ledger reconciliation (the regression check that matters)

43. psql, after all the above:
    `SELECT asset, sum(amount) FROM ledger_entry GROUP BY asset;` → every row **0**.
    `SELECT count(*) FROM ledger_entry WHERE amount = 0;` → **0**.
    `UPDATE ledger_entry SET amount = 1 WHERE amount <> 1;` → **fails**: `ledger_entry is append-only`.
44. `GET /treasury/summary` → `float.cashCents` = opening float + Σ buy subtotals − Σ sell subtotals; `reserves[XAU].issuedMg` = total user gold in mg.

## L. Production (once Render is green)

45. Repeat steps 5–18 and 32–36 against `https://alkeva-web.onrender.com`, on your phone, in Amharic.

## M. Desktop workspace (the 1440 composition)

46. At **1440px wide**, signed in: a fixed rail on the left (ALKEVA · XAU · XPT, two sections — ገበያ / ሂሳብ — six destinations, tier chip pinned at the bottom) and a top bar carrying the page name, the clock in EAT, **both metals with their 24-hour change**, your birr balance and your name. The current destination is the only gold thing in the rail.
47. Home fills the width as a grid: holdings · gold · platinum on the first row, the chart (8 columns) beside the vault panel and the gold Buy button, recent activity across the bottom. **Nothing is a centred phone column.**
48. The chart has a **labelled price axis** with the current price in a gold tag on it, a time axis, and መክፈቻ / ከፍተኛ / ዝቅተኛ / የአሁኑ above it. Switch 24h → 7d → 30d → 1y: axis labels change with the range and stay round numbers.
49. Click **ግብይት** in the rail → the trading workspace: position on the left, the ticket in the middle, the live chart on the right. Get a quote → the countdown ring, the sunk fee breakdown and the glossy gold **አረጋግጥ** are all in the middle panel while the chart keeps ticking beside them.
50. Confirm → the middle panel becomes the settled panel with **ደረሰኝ ይመልከቱ**. Open it: the receipt is a 640px document centred on the canvas, with **አትም** and **አጋራ** in the header. Press **አትም** → the print preview is black-on-white with no navigation. Cancel it.
51. Open **ደረሰኞች** in the rail → every settled order by serial. Only settled orders appear.
52. **ንብረቴ** at 1440: total metal value with the gain/loss to its right, the gold/platinum allocation bar, the tier card, the holdings table, cash + the two actions, and the vault strip across the foot.
53. Resize the window to ~390px without reloading → the rail and top bar disappear, the tab bar appears, every grid becomes one column, and no screen scrolls sideways.

## N. Demo run sheet (video recording)

Record at **1440×900**, browser zoom 100%, Amharic. Have psql open in a second window for step 6. Total ≈ 6 minutes.

1. **Cold open — the price is real.** Home. Point at the ticker: gold and platinum per gram, the 24-hour change, and the feed name + timestamp on each price card. Say the price comes from a named feed every 30 seconds and is stored with its FX rate.
2. **The vault claim.** Hover the vault panel: in vault, issued to users, coverage `38.9×`. Say the sentence out loud — *ALKEVA does not sell a gram it does not hold* — and that it is enforced inside the buy transaction, not by a policy document.
3. **The trade.** Rail → ግብይት. Choose ወርቅ, ግዛ, **5 ግ**. Get a quote. Let the ring run a few seconds. Read the breakdown line by line: price per gram × grams = subtotal, commission at its exact percentage, total. Point at the provenance line under the button.
4. **Button-mashing (the idempotency proof).** Tap **አረጋግጥ** four or five times fast. One settled order. Say: the button is deliberately never disabled, and the server is idempotent per quote.
5. **The receipt.** ደረሰኝ ይመልከቱ → serial `ALK-2026-NNNNNN`, the full breakdown, and the price source with the exact tick timestamp and the USD/ETB rate. This is the artefact a bank asks for.
6. **The ledger.** Switch to psql: `SELECT asset, sum(amount) FROM ledger_entry GROUP BY asset;` → every row **0**. Then `UPDATE ledger_entry SET amount = 1;` → **rejected, append-only**. Say: balances are never edited, they are a projection of immutable pairs.
7. **A refusal, deliberately.** Back in the app, try to sell more grams than you hold → the refusal is legible, in Amharic, and the balance is untouched. (For the reserve halt, use step 23's psql lines before recording so the halt is armed.)
8. **The portfolio, including the honest loss.** ንብረቴ → you are down by exactly the commission you just paid, with the sentence explaining it. Say that hiding this would be the easy choice and the wrong one.
9. **Language.** Toggle አማ · EN in the top bar → the whole workspace switches. Toggle back to Amharic.
10. **The phone.** Resize to 390px (or hold up a phone on the same network) → the same product, one column, tab bar, trade as a bottom sheet. Close on the phone view.

> Two things to avoid on camera: do **not** press the dashed የሙከራ ብር ያግኙ button (it is visibly demo scaffolding — top the account up before recording), and do not resize mid-quote, since the countdown keeps running while the layout reflows.

---
**Result:** note each failed step number and report back. Phase 3 closes when A–M pass locally; L closes the deploy carry-over.
