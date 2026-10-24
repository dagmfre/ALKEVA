# Phase 9 — Design system v2: joint verification

What changed: the whole web app (user app, landing, auth, admin console) moved to design v2 — RabbitX-style terminal layout, FBS black-and-champagne colour, V2 folder-tab navigation. No API, database or money logic changed, apart from two presentation additions to the trade ticket (grams/birr toggle, 25/50/75/Max chips).

**Setup:** local stack running (Docker Postgres + Redis, API, worker). Web: `pnpm --filter @alkeva/web build && pnpm --filter @alkeva/web start` (or `dev` on another port — never build while dev runs). Sign in with the seeded administrator. Use a real browser (Chrome), not headless, so the 3D renders.

Mark each step ✅ / ❌ and note what you saw.

## A. Look and feel (desk, 1440 wide)

1. Sign in. The top bar is near-black; the tab for the page you are on is the page colour with small curved "feet" joining the page below it. Its icon is champagne.
2. Hover each other tab: a soft rounded highlight appears; no tab jumps or shifts.
3. Every number on every screen (prices, grams, birr, times) is in a monospace font with aligned digits; labels and headings are in the rounded sans font. If numbers look like ordinary text, ❌.
4. Wallet ▾ opens Deposit / Withdraw / Identity check. On any of those pages the Wallet tab is the active one.
5. Bell, language and avatar menus open as raised dark menus; the avatar menu shows Account, Admin console (staff only) and Log out.
6. Resize the window between 1024 and 1280: the tab labels hide, icons stay, hovering a tab shows its name as a tooltip. No horizontal scrolling at any width.

## B. Markets (home)

7. The ticker shows Gold and Platinum in birr per gram with a 24h change chip and a small sparkline, then world gold and platinum in USD/oz, then the USD → ETB rate with its source. Clicking Gold or Platinum switches the chart below.
8. Chart: Gold/Platinum selector and 24h/7d/30d/1y ranges slide a raised thumb. Hover the plot: a dashed crosshair, a dot and a tooltip with the time and the price follow the pointer. The live price sits in a coloured tag on the right axis.
9. The bell icon in the chart header opens the price-alert dialog (above/below segmented, birr field). Save one; it appears on Account → Price alerts.
10. Total holdings: total in birr, gain/loss vs. what you paid with ↑/↓, a three-part bar (gold, platinum, cash), the tier gauge, and Buy gold / Buy platinum / Deposit / Withdraw.
11. Recent activity and Vault backing end at the same height. Vault backing shows both metals (in vault, issued, coverage ×) and the cash available for sell-backs.
12. **No panel has a large empty area under its content, and panels side by side end level.** This is the defect this phase exists to fix: check every screen for it.

## C. Trade terminal

13. Top strip: Gold/Platinum selector, live birr price with 24h chip, world spot, USD → ETB, 24h high/low, last tick time and source, all on one row.
14. Middle row: chart · Price ticks · Order, all the same height. Price ticks shows the current price, ≈ USD/oz, a weekend note on Saturday/Sunday, "Received while open" ticks then "5-minute averages".
15. Order panel, Buy: enter 0.1 g. The dashed Estimate box shows price per gram, grams, metal value, "commission shown on the quote".
16. Switch the unit to Birr: the amount converts at the live price; a note says commission is added on the quote and shows ≈ grams. Switch back: converts back.
17. Click 25% / 50% / 75% / Max: the amount fills from your birr balance (Buy) or held grams (Sell). After one quote, Max on Buy should stay within your balance including commission.
18. See the price → the box becomes "Your price" with a countdown ring and every fee line. The confirm button reads "Buy 0.100 g Gold" (champagne). Double-click it → one settled order (History shows one row), receipt link works.
19. Switch to Sell → the side thumb turns bone and the confirm button is bone, not red.
20. Let a quote expire (wait 30 s): the box dims and the button becomes "Request a new price".
21. Your metal: Holdings / Orders / Refused / Receipts with counts. Holdings rows have Buy/Sell buttons that load that metal and side into the order panel.
22. Account panel: tier badge, gauge, cash, metal value, identity status, allocation bar, Deposit / Withdraw.

## D. Portfolio, History, Receipts, Receipt

23. Portfolio: one summary strip (total, cost basis, gain/loss, gold, platinum, cash) across the full width.
24. Holdings table + allocation + badges on the left; Your metal on the right. Click the gold box: it opens and lifts the bar; the grams and birr value appear. Switch to Platinum: the ingot shows.
25. Tier · Physical delivery · Vault backing end level. Below the delivery tiers, Delivery says Locked and shows a disabled "Unlocks at a higher tier".
26. History: four-figure strip, filters All/Buys/Sells/Refused with counts, day-grouped table, receipt serials in the form ALK-2026-000031.
27. Receipts: list on the left, the selected receipt rendered on the right; clicking another row swaps the preview; search by serial or its last digits.
28. Open a receipt: the document and the Proof panel stand side by side. Proof shows the ledger legs, zero-sum checks and the "How it moved" chips. Print opens a clean ink-on-paper document.

## E. Wallet, Account, Assistant

29. Deposit: large amount field with 1,000 / 5,000 / 10,000 / 50,000 chips, steps beside it, balance and channel limits on the right.
30. Withdraw: amount, bank select, account number and name, steps; the bone "Send" button; your requests listed on the right with dot badges.
31. Identity check: when verified, a verified state plus the timeline (send → review → verified) and what it unlocks.
32. Account: profile strip (tier, identity, staff role, Admin console / Log out); Preferences · Passkeys · Price alerts, each a full-height panel.
33. Assistant: Conversations · chat · What you can ask. New conversation (+) works; sending still works (or shows the honest rate-limit message if Gemini credits are out).

## F. Phone (390 wide — DevTools device mode or a real phone)

34. Top: deep bar with the brand on Markets, the page name elsewhere; clock, bell, language, avatar.
35. Bottom bar: Markets · Trade · Portfolio · History · More. The active tab is the page colour with feet rising into the page. More opens a sheet with Receipts, Assistant, Deposit, Withdraw, Identity check, Account (and Admin console for staff).
36. Trade opens the terminal stacked: market head, chart, order ticket, your metal, account. Fact strips scroll sideways; nothing overflows the screen.
37. On Markets/Portfolio, a Buy button opens the bottom sheet with the same ticket; the receipt link closes the sheet.

## G. Languages

38. Switch to Amharic, Tigrinya, Afaan Oromoo, Somali in turn on Markets, Trade and Welcome. No English fragments in the new UI text, no "MISSING" keys, Ethiopic text is not letter-spaced, nothing overflows its box.
39. Native-speaker review wanted (model translations): the slogan "Weigh it. Own it. Sell it.", the word used for a price "tick", "Allocation", "Cash float".

## H. Signed out

40. `/welcome`: big uppercase hero with both 3D bars and a live gold card; ticker; "How the birr price is made" shows world spot → USD per gram → × rate → birr per gram, ending in the same number as the ticker.
41. `/login`, `/register`, `/forgot-password`: split screen on a desk (brand side with live prices), form only on a phone; the language picker is visible before signing in.
42. `/terms`, `/privacy`, `/copyright` match the new look.

## I. Admin console

43. As administrator open `/admin`: V2 tab bar with the console's own tabs, "Back to the app", language, user menu. Compliance and finance accounts see only their tabs.
44. Overview, Revenue, Treasury: figures in strips, charts fill their panels, no voids. KYC / Payouts / Reviews / Delivery queues: two-step approve/reject still requires two clicks.

## J. Money regression (must not have changed)

45. After a buy and a sell, run against the database:
    `select a.asset, sum(e.amount) from ledger_entry e join account a on a.id = e.account_id group by a.asset;` → every asset 0.
46. Each settled order has exactly one receipt serial; a double-clicked confirm produced one order.
