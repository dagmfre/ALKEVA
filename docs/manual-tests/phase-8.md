# Phase 8 — AI features: joint verification

Manual steps for Dagmfre. Every step below was self-verified live on 2026-08-17
except those marked **[credits]**, which need a working Gemini key — the project
key's prepayment credits are depleted (see §C).

> **24 Oct 2026:** four of the six Phase 8 features were removed from `main` —
> price-move attribution, the AML rules engine, the what-if calculator and KYC
> document reading. Their steps are gone from this file; the code and the
> original test sheet live on the `hackathon-features` branch. What remains is
> the five-language assistant (A) and proof mode (B).

Local setup: `docker compose up -d`, `pnpm db:migrate`, API + web + worker dev
servers running, `SEED_ADMIN_PASSWORD` set.

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
5. `/assistant` empty state names the language it will answer in, and shows four
   suggestion chips including "Prove my last transaction".

## B — Proof mode

6. `/history` → open any settled order's receipt. Below the receipt document
    there is a **Proof** panel.
7. Every ledger leg is listed with a signed amount, your own account labelled
    "Your account" and the platform's by name. Check the count: an order with
    **zero tax and zero reforestation has 5 legs, not 7** — zero-amount entries
    are never posted.
8. The zero-sum block shows `✓ 0.00` for ETB and `✓ 0.000` for the metal.
    Cross-check against the DB:
    ```sql
    select asset, sum(amount) from ledger_entry
     where transaction_id = '<ledger tx from the receipt footer>' group by asset;
    ```
9. "Price locked" shows the quote's unit price and its 30-second validity
    window; "Price source" names the feed, the FX source and the tick time.
10. Someone else's order → `curl -b <your session> localhost:4000/orders/<their
    order id>/proof` → **404**, never 403. A rejected order → `receipt_not_available`.
11. Click **"Explain this in my language"** → lands on `/assistant` with the
    question already sent, in a new thread. **[credits]** The narration quotes
    the same figures as the panel.
12. **[credits]** The money shot: after it explains the proof, ask it to reverse
    the transaction. It must refuse and say it cannot act.

## C — Gemini credits (blocking the [credits] steps)

13. The project's Gemini key currently returns:
    `429 Your prepayment credits are depleted.` The chat path handles this
    correctly — verify by curl while it is still depleted:
    - `POST /ai/chat` → `{"message":"ai_rate_limited","retryAfterSeconds":30}`

    Google's own wording (billing URLs, project ids) must **never** appear in a
    response body — it is logged server-side only.
14. Top up at <https://ai.studio/projects>, then re-run every **[credits]** step
    above. No code change is needed; the paths are live and verified up to the
    provider call.

## D — Regression gates

15. `pnpm typecheck` → clean across all five workspaces.
16. `pnpm i18n:report --strict` → **5/5 locales at 100%** (769 keys).
17. `pnpm verify:contrast` → all pairs PASS; white-on-gold still correctly banned.
18. `pnpm --filter @alkeva/web build` → clean; **shared first load still 103 kB**
    (three.js remains async-only).
19. Money core, after all of the above:
    ```sql
    select asset, sum(amount) from ledger_entry group by asset;      -- 0, 0, 0
    select count(*) from ledger_entry where amount = 0;              -- 0
    select count(*) , count(distinct receipt_serial) from "order"
      where receipt_serial is not null;                              -- equal
    ```
    And the append-only trigger still rejects an UPDATE on `ledger_entry`.
