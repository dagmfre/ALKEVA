# Devpost — Page 1: Project overview & details (PUBLIC)

**Build with Gemini XPRIZE.** Everything on this page appears on the public
project page.

> **How to use this document.** Every answer below is drafted from what ALKEVA
> actually is and does — no invented metrics, no claims the code does not
> support. Fields marked **[CONFIRM]** need a decision or a fact only the team
> holds. Do not submit those as written.

---

## General info

### Project name

```
ALKEVA
```

### Elevator pitch *(200 characters max)*

```
Ethiopians buy vaulted gold by the gram in birr, with a double-entry ledger,
receipts for every trade, and a Gemini assistant that explains the market in
five Ethiopian languages.
```

*(184 characters.)*

Alternative, if a sharper economic framing is wanted:

```
Gold savings for Ethiopia's inflation. Buy vaulted gold from 1 gram in birr,
with an auditable ledger, live pricing, and a Gemini assistant that explains
it in your own language.
```

---

## Project Story — "About the project"

> Devpost renders this as Markdown. Paste from `## Inspiration` down.

```markdown
## Inspiration

Ethiopia's birr has lost a large share of its purchasing power in recent years,
and the country's savers have very few defences. Gold is the instrument people
already trust — but buying it means carrying cash to a jeweller, negotiating an
opaque price, accepting no receipt worth the name, and then storing metal at
home. Anyone with less than the price of a full gram is simply excluded.

ALKEVA started from a question the client, a gold trader in Tigray, asked
directly: why can a farmer with 500 birr not own gold, when someone with 50,000
can? Everything in the product follows from taking that question literally.

## What it does

ALKEVA is a digital gold and platinum trading platform where the operator is
the counterparty — a dealer, not a broker. Users:

- deposit Ethiopian birr through Chapa (telebirr, CBE Birr, bank, card)
- buy gold or platinum **from one gram**, at a live price locked into a quote
  that expires in 30 seconds
- hold it in a vault position they can see, with cost basis and gain/loss
- sell back to the platform, or request physical delivery at the top tiers
- withdraw birr to their own bank or mobile money account
- ask an AI assistant, **in Amharic, Tigrinya, Afaan Oromoo, Somali or
  English**, what the price is, what a fee was, or what their own position is

Behind that sit five rules the code enforces rather than promises:

1. **The AI never writes.** It has three read-only tools. It cannot trade,
   approve, freeze, or move money — the module's import graph physically cannot
   reach a service that writes money.
2. **Balances are never edited.** Every movement is a pair of immutable
   double-entry ledger rows; a balance is a projection, never a stored number a
   bug or an admin can overwrite.
3. **Quotes expire.** Users confirm against a quote ID, never a live price.
4. **No one moves money alone.** Privileged actions require a second approver
   and are always audit-logged.
5. **Never sell a gram the vault doesn't hold.** The reserve gate runs *inside*
   the buy transaction, and there is no admin override.

## How we built it

A TypeScript monorepo: Next.js 15 for the web app, NestJS for the API, a
standalone price worker, PostgreSQL, and Redis.

**The ledger is the spine.** Money is integers everywhere — birr in cents,
metals in milligrams — and rounding happens exactly once, in the quote engine.
Postgres triggers enforce the invariants: ledger rows are append-only (UPDATE
and DELETE are rejected at the database), and a deferred constraint trigger
rejects any transaction whose entries do not sum to zero per asset. Concurrency
is handled with ordered `SELECT … FOR UPDATE` row locks rather than serializable
isolation, so a burst of simultaneous confirmations produces one order, not
several.

**Pricing** comes from a worker that ticks every 30 seconds: metal spot from a
primary feed with an automatic fallback, multiplied by a cached USD→ETB rate,
converted to integer birr cents per gram. Every tick records which feed and
which FX source produced it, so any receipt can be traced back to the exact
market data behind it. The tick is published on Redis and pushed to every open
browser over Server-Sent Events, so the ticker, the chart, the trade ticket and
the AI all quote one identical number.

**The assistant** runs on the Gemini API with three read-only tools. Tool
results are pre-formatted so the model quotes figures rather than computing
them — an LLM doing arithmetic on someone's balance is a bug waiting to happen.

**Payments** go through Chapa. The webhook is treated as a trigger and never as
truth: it only ever prompts a server-side verification against Chapa's API, and
a single idempotent code path does the crediting.

## Challenges we ran into

**Sandbox reality.** Chapa's test mode returns `data: [null]` from the transfer
verification endpoint, so no sandbox transfer could ever settle through the
normal path. Separately, transfer references are capped at 36 characters — ours
were 37, so *every* real transfer failed. Both were only findable by running
real money movements against the live sandbox.

**One price, everywhere.** Early on, a chart bucket average could render where
the live price belonged. The fix was structural rather than cosmetic: the hook
that serves chart data no longer exposes a "current" value at all, so the
mistake cannot be made again.

**Language is not a translation layer.** Amharic and Tigrinya use Ethiopic
script, which cannot be uppercased or letter-spaced and needs more line height.
Storing the user's language as a Postgres enum meant every new language was a
schema migration — and `ALTER TYPE … ADD VALUE` cannot be followed by a write to
that value in the same transaction, which is exactly what a migrate-then-seed
deploy does. Locale is now text validated at the boundary, so adding a language
is a translation file and nothing else.

**A real browser, late.** For a long stretch nothing had been *seen* rendered —
only type-checked and curl'd. Driving a real browser found layout defects that
no amount of passing types would have caught.

## Accomplishments that we're proud of

- The ledger has held zero-sum across every asset through every test: no money
  created, none destroyed, enforced by the database rather than by discipline.
- Five Ethiopian languages ship at 100% key coverage, including the AI.
- ALKEVA is a **copyright-registered work** with the Ethiopian Intellectual
  Property Authority (registration 8/1/00317).
- Ten rejection reasons — insufficient funds, expired quote, reserve halt,
  tier cap, frozen account, KYC required — are each a recorded, machine-readable
  outcome a user can actually read, not a generic error.

## What we learned

Financial correctness is mostly about where you put the enforcement. Every
guarantee that lived in application code eventually found a path around itself;
every guarantee pushed into the database or into the type system stayed true.
The reserve gate works because it is inside the transaction. The zero-sum
invariant holds because a trigger rejects the write.

We also learned that "explain it in the user's language" is a more useful AI
product than "tell the user what to buy" — and a far more defensible one for
something touching people's savings.

## What's next for ALKEVA

Live Chapa keys and the regulatory work to operate as a real dealer; native
speaker review of the three newest translations before launch; physical
delivery fulfilment; and more Ethiopian languages — Sidaama, Wolaytta and Afar
are each now one translation file away.
```

---

## Built with *(tags, up to 25)*

```
typescript, next.js, react, nestjs, postgresql, redis, drizzle-orm,
google-gemini, gemini-api, google-cloud, compute-engine, docker, caddy,
tailwindcss, three.js, chapa, server-sent-events, webauthn, next-intl,
supabase, node.js
```

---

## "Try it out" links

| Label | URL |
|---|---|
| Live platform | `https://23-251-133-30.sslip.io` **[CONFIRM — replace with the real domain if bought before submitting]** |
| Source code | `https://github.com/dagmfre/ALKEVA` |
| Copyright registration | `https://23-251-133-30.sslip.io/copyright` |

---

## Project Media

### Image gallery — 3:2 ratio, up to 15, 5 MB each

Suggested set, in order:

1. Landing page hero with the live gold price
2. Trade ticket mid-quote, countdown ring visible
3. A settled receipt with its serial number
4. Portfolio with the 3D bar and tier progress
5. The AI assistant answering in Amharic
6. Admin console — KYC queue or audit log
7. The same screen in two languages, side by side
8. The copyright certificate page

Capture at 1440px width. **[CONFIRM — screenshots to be taken]**

### Video demo link **[REQUIRED]**

Upload to YouTube (unlisted is fine) and paste the URL. Use the 3-minute run
sheet in `docs/deploy/OPERATIONS.md` §8 as the script.

---

## Thumbnail

3:2 ratio, 5 MB max. The landing hero or the ALKEVA mark on the dark gold
ground. **[CONFIRM]**
