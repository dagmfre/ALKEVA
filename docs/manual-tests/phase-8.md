# Phase 8 — Six AI features: joint verification

Manual steps for Dagmfre. Every step below was self-verified live on 2026-08-17
except those marked **[credits]**, which need a working Gemini key — the project
key's prepayment credits are depleted (see §G).

Local setup: `docker compose up -d`, `pnpm db:migrate` (applies **0010** and
**0011**), API + web + worker dev servers running, `SEED_ADMIN_PASSWORD` set.

---

## A — The assistant answers in five languages

1. `/account` → language menu → switch to **ትግርኛ**. Reload `/assistant`.
   **[credits]** Ask, *in English*: "What is the gold price?" The reply must come
   back in Tigrinya, not English. Repeat for Afaan Oromoo and Soomaali.
   *This is the defect being fixed: the old prompt answered in whatever language
   the question was typed in.*
2. **[credits]** In each language, check every money figure uses Western digits
   0-9 — never Geʽez numerals — and that the price quoted equals the header
   ticker exactly.
3. **[credits]** In Amharic, ask "should I buy gold now?" → it must decline and
   offer facts instead. Ask it to sell 1g → it must say it cannot act.
4. Empty-reply fallback: in each of the five languages the "could not answer"
   string is localized. (Code check: `apps/api/src/ai/ai.tools.ts` →
   `FALLBACK_REPLY` has all five; the old code was an `am ? … : English` ternary.)
5. `/assistant` empty state names the language it will answer in, and shows five
   suggestion chips including "Why did gold move today?" and "Prove my last
   transaction".

## B — Why did it move? (metal vs birr)

6. Home → the **"Why did it move?"** panel under the chart. Ranges 24h/7d/30d/1y
   each change the figures.
7. Read the three numbers: total, world metal price, birr against the dollar.
   **They must reconcile** — metal + currency + the stated interaction = total.
8. Hand-check one against the raw ticks:
   ```sql
   select at, usd_per_oz_micro, etb_rate_micro, etb_cents_per_gram
     from price_tick where asset='XAU' order by at desc limit 1;
   ```
   and the reference tick ~30 days older. `(usd₁−usd₀)/usd₀` must equal the
   panel's metal figure, `(fx₁−fx₀)/fx₀` its currency figure.
9. `curl "localhost:4000/prices/attribution?asset=XPT&range=7d"` → same shape,
   `dominant` is one of `metal` / `currency` / `both` / null.
10. A fresh asset with a single tick returns **nulls, not zeros** (a fabricated
    0% would read as "nothing moved", a different claim).
11. **[credits]** Ask the assistant "why did gold move this month?" → its numbers
    match the panel exactly.

## C — Proof mode

12. `/history` → open any settled order's receipt. Below the receipt document
    there is a **Proof** panel.
13. Every ledger leg is listed with a signed amount, your own account labelled
    "Your account" and the platform's by name. Check the count: an order with
    **zero tax and zero reforestation has 5 legs, not 7** — zero-amount entries
    are never posted.
14. The zero-sum block shows `✓ 0.00` for ETB and `✓ 0.000` for the metal.
    Cross-check against the DB:
    ```sql
    select asset, sum(amount) from ledger_entry
     where transaction_id = '<ledger tx from the receipt footer>' group by asset;
    ```
15. "Price locked" shows the quote's unit price and its 30-second validity
    window; "Price source" names the feed, the FX source and the tick time.
16. Someone else's order → `curl -b <your session> localhost:4000/orders/<their
    order id>/proof` → **404**, never 403. A rejected order → `receipt_not_available`.
17. Click **"Explain this in my language"** → lands on `/assistant` with the
    question already sent, in a new thread. **[credits]** The narration quotes
    the same figures as the panel.
18. **[credits]** The money shot: after it explains the proof, ask it to reverse
    the transaction. It must refuse and say it cannot act.

## D — AML risk cases

19. `/admin/cases` (administrator or compliance). Tabs **Open / Resolved**, an
    open count, and a **Run scan now** button.
20. Press **Run scan now** → banner reports findings and cases opened. Press it
    again immediately → **0 new cases** (the `(user, rule, window)` unique index
    makes a re-scan a no-op).
21. Create a structuring pattern to see the flagship rule fire: as a KYC-verified
    account with balance, place **three settled buys in one EAT day, each between
    400,000 and 500,000 ETB**. Run the scan → one case,
    **"Transactions parked under the review line"**, severity **High**, score 85,
    evidence showing the count, the combined total and the smallest order.
22. Role matrix: finance → `/admin/compliance/cases` **403**; compliance → 200;
    an ordinary user → 403.
23. Resolve a case with a note → it moves to **Resolved** showing who resolved it.
    Press resolve twice quickly → the second is **409 case_already_resolved**.
24. **Confirm the engine acted on nobody:**
    ```sql
    select count(*) from "freeze" where created_by = 'rules-engine';   -- 0
    select count(*) from notification where template like 'risk%';     -- 0
    ```
    A flagged user is never notified (tipping-off) and is never auto-frozen.
25. Audit trail:
    ```sql
    select actor_label, action, count(*) from audit_log
     where action in ('risk_case_opened','risk_scan_run','risk_case_resolved')
     group by 1,2;
    ```
    Cases opened by **`rules-engine`** with a null actor id; scans and
    resolutions by `staff:<uuid>`.
26. Worker cadence: with `RISK_SCAN_INTERVAL_SECONDS=300` the worker logs
    `AML risk scan: every 300s (advisory …)` at boot and logs opened cases.
    Set it to `0` → the periodic pass is disabled and the button still works.
27. `/admin/compliance` → the AML CSV still downloads, and there is now a link
    through to the case queue.
28. **[credits]** "Explain this case" on an open case → a plain-language note in
    your own language appears inline. It never says the person is guilty and
    never recommends freezing.

## E — Allocation what-if

29. `/portfolio` → the **"What if the split were different?"** panel.
30. The slider **opens at your current split** and says so — no target is
    suggested. Nothing is called optimal or balanced.
31. Move it: the panel shows grams and birr to buy/sell on each side plus an
    estimated commission. Hand-check the commission against `GET /fees`
    (`commissionPctMilli`) applied to the two legs' notional.
32. Move it back to your current percentage → the trade lines disappear (a
    rounding residue must not render as a trade to make).
33. **"Go to trade"** hands off to the ordinary quote flow. Confirm the panel
    never places an order itself.
34. With zero metal held → the panel says there is nothing to split.

## F — KYC document reading

35. As an **unverified** account, `/kyc` now has three fields: full name,
    document number, expiry.
36. **[credits]** Choose a photo of an ID → "Reading the document…" appears and
    the three fields fill in. Change one deliberately — your edit must survive
    (extraction only ever fills blanks, never overwrites).
37. Submit. `/admin/kyc` → the **Declared / read** column shows both values, and
    the field you changed is marked with ⚠ in the loss colour.
38. Confidence line ("Document read clearly / partly legible / hard to read")
    appears under the comparison.
39. Submit a **PDF** → upload succeeds, no extraction attempted, nothing breaks.
40. Approve the submission → tier flips to 1 as before. **The extraction never
    approves anything**; approval is still the officer's click.
41. `curl -X POST localhost:4000/kyc/extract` with no file → **400 file_required**;
    unauthenticated → **401**.

## G — Gemini credits (blocking the [credits] steps)

42. The project's Gemini key currently returns:
    `429 Your prepayment credits are depleted.` Every AI path handles this
    correctly and identically — verify by curl while it is still depleted:
    - `POST /ai/chat` → `{"message":"ai_rate_limited","retryAfterSeconds":30}`
    - `POST /kyc/extract` → same
    - `POST /admin/compliance/cases/:id/narrative` → same

    Google's own wording (billing URLs, project ids) must **never** appear in a
    response body — it is logged server-side only.
43. Top up at <https://ai.studio/projects>, then re-run every **[credits]** step
    above. No code change is needed; the paths are live and verified up to the
    provider call.

## H — Regression gates

44. `pnpm typecheck` → clean across all six workspaces (including the new
    `packages/risk`).
45. `pnpm i18n:report --strict` → **5/5 locales at 100%** (865 keys).
46. `pnpm verify:contrast` → all pairs PASS; white-on-gold still correctly banned.
47. `pnpm --filter @alkeva/web build` → clean; **shared first load still 103 kB**
    (three.js remains async-only).
48. Money core, after all of the above:
    ```sql
    select asset, sum(amount) from ledger_entry group by asset;      -- 0, 0, 0
    select count(*) from ledger_entry where amount = 0;              -- 0
    select count(*) , count(distinct receipt_serial) from "order"
      where receipt_serial is not null;                              -- equal
    ```
    And the append-only trigger still rejects an UPDATE on `ledger_entry`.
