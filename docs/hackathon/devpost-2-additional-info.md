# Devpost — Page 2: Additional info (JUDGES & ORGANIZERS ONLY)

**Build with Gemini XPRIZE.** Not shown on the public project page, except
where noted.

> **How to use this document.** This page asks for financial and factual
> declarations. Everything below is drafted to be **truthful** — where the
> honest answer is zero, it says zero. Fields marked **[CONFIRM]** are facts
> only the team holds, or judgement calls the owner must make.
>
> **Do not inflate any number on this page.** Judges cross-check revenue
> against the P&L and the Google Cloud invoice you upload. A zero with a clear
> explanation scores better than a figure that does not reconcile.

---

## Section A — Basic declarations

### Upload a file
Zip containing: the repo archive, `docs/deploy/OPERATIONS.md`, and the
copyright certificate. Limit 35 MB. **[CONFIRM]**

### What date did you start this project? (MM-DD-YY)

```
08-06-26
```

Development began 6 August 2026 (first commit and planning documents that day;
the full progress log with timestamps is in `CLAUDE.md`). All code was written
between 6 and 16 August 2026, inside the hackathon window.

> **[CONFIRM — read this before answering.]** The rules require that all
> development happen during the hackathon, and Section F asks separately about
> resources that existed before **19 May 2026**. Answer both consistently. Our
> reading: the *code* is entirely within the window; the *business relationship*
> and the *copyright registration* are separate matters, disclosed in Section F.

### Submitter type

**[CONFIRM — Individual / Team / Organization]**

This decision has consequences. ALKEVA has an owner (Tekleweyni Berhe Asgedom,
named on the copyright registration) and a developer (Dagmfre Seid). If both
are submitting, this is a **Team**. If the client submits alone, he must be able
to speak to how it was built. If a registered company exists, choose
**Organization** and supply the EIN equivalent.

### Country of residence

```
Ethiopia
```

### Category

```
Money & Financial Access
```

Gold savings denominated in birr, reachable from one gram, in five Ethiopian
languages, is a financial-access product before it is anything else. The other
plausible category is Entrepreneurship & Job Creation, but that would be a
weaker fit for what the platform actually does today.

---

## Section B — Impact

### Explain how your project uses AI to impact the world, specifically in the category you have chosen.

```
Ethiopia's savers are losing purchasing power to inflation and have very few
defences. Gold is the instrument they already trust, but the existing route to
it — cash to a jeweller, an opaque price, no meaningful receipt, metal stored
at home — excludes anyone without a large lump sum and offers no protection
against being quoted a bad price.

ALKEVA lowers that floor to one gram and puts a verifiable record behind every
trade. AI is what makes it usable at that scale. The barrier for a first-time
gold buyer in Ethiopia is not the interface, it is comprehension: what is a
spread, why did I pay 2%, why is my position worth less than I paid an hour
ago, what is the price actually based on. Every one of those questions is
normally answered by a person who is also the counterparty — an obvious
conflict.

Our Gemini-powered assistant answers them instead, in Amharic, Tigrinya, Afaan
Oromoo, Somali or English, from the user's own live data. It explains and it
refuses to advise. It is architecturally read-only: three tools that read
prices, history, and the user's own position, and no path to any service that
moves money. A user can ask "why is my portfolio down?" and get the honest
answer — the commission is priced in immediately — rather than a sales pitch.

The impact claim is narrow and defensible: AI removes the comprehension barrier
that keeps ordinary Ethiopians out of a hedge they already believe in, without
introducing the advice risk that makes AI dangerous near people's savings.
```

### How do you measure impact?

```
Theory of change: if a saver can buy gold from one gram, at a price they can
verify, with an explanation in their own language, then people currently
excluded by lump-sum size and by opacity will hold an inflation hedge they
otherwise would not.

Hypotheses we intend to test:
1. Small-ticket demand is real — a meaningful share of first purchases will sit
   near the one-gram floor rather than at large amounts.
2. Comprehension is a binding constraint — users who engage with the assistant
   before their first trade will complete that trade at a higher rate.
3. Language matters — a majority of sessions will run in a language other than
   English.
4. Trust is built by receipts — repeat purchase rate will rise after a user's
   first successful sell-back, when the exit has been proven.

Outputs measured (all instrumented in the platform today): registrations, KYC
completions, first-trade conversion, median first-purchase size, trades per
user, assistant sessions per trade, language distribution, sell-back completion
rate, and total grams under custody.

Outcomes expected, short term: users holding gold who previously held only
birr. Long term: a measurable savings behaviour change among people outside the
existing gold-buying class, and a price reference transparent enough to be
checked against the market.

How we prove it: the ledger is the evidence base. Because every movement is an
immutable double-entry pair, every one of these figures is auditable rather
than self-reported — we can show the trades, not just claim them.

Current status, stated plainly: the platform is deployed and functional but has
not yet operated with live payment keys, so none of these hypotheses has been
tested against real users. These are the measurements we have built the
instrumentation for, not results we are claiming.
```

**[CONFIRM]** If any real user testing has happened that the developer is not
aware of, add it — with numbers.

---

## Section C — Business model

### Explain the underlying business model of your submission.

```
ALKEVA is a dealer, not a broker or an exchange. The platform is the
counterparty to every trade: it holds the metal, quotes both sides, and earns
the spread plus a configurable commission (currently 2%, set in configuration
rather than hardcoded). Revenue is transactional and realised at the moment of
trade — there is no subscription and no custody fee.

Customers are consumers (B2C): Ethiopian savers, initially urban and
smartphone-equipped, reached through the existing gold-trading business's
customer relationships and through the owner's regional presence in Tigray.

Value created for them: access from one gram rather than a full lump sum; a
price they can verify against a live feed; a receipt with a serial number for
every settled trade; the ability to sell back and withdraw to their own bank or
mobile money account; and, at higher holding tiers, physical delivery.

Retention comes from the position itself — a user holding gold has a standing
reason to return — reinforced by holding tiers that unlock higher limits and
delivery eligibility, and by price alerts that bring users back on movement.

Secondary revenue, not yet built: spread on physical delivery fulfilment, and
custody services for larger holders.
```

### How will you sustain business operations in the future?

```
Operating cost today is approximately USD 25–32 per month: a single Google
Compute Engine e2-small VM running the whole stack (web, API, price worker,
Redis, TLS), managed Postgres on a free tier, and Gemini API usage. That
number is small because the architecture is deliberately consolidated rather
than distributed — the managed-service equivalent of the same workload prices
at USD 80–100 per month.

Resource allocation: the dominant cost is not infrastructure, it is the metal
float and the regulatory work required to operate as a licensed dealer. The
owner's existing gold-trading business supplies the former.

Threats to future operations, honestly stated:
1. Regulatory. Operating as a digital metals dealer in Ethiopia requires
   approvals that are not yet in hand. This is the single largest risk.
2. Payment dependency. Chapa is the only payment rail integrated. Its outage or
   its terms are our outage and our terms.
3. Price feed dependency. Metal spot comes from free public feeds with a
   fallback; a production deployment should move to a paid feed with an SLA
   (~USD 20–40/month).
4. Metal float. The reserve gate means the platform can only sell what it
   holds. Growth is capped by inventory, by design.

How operations change after the hackathon: obtain live payment keys, complete
regulatory groundwork, move to a paid price feed, buy a production domain, and
have the three newest translations reviewed by native speakers before they are
put in front of users.
```

### Explain how your business model shared above is sustainable and viable.

```
Unit economics: revenue per trade is the commission (2%) plus spread. Costs per
trade are payment processing plus a fraction of a fixed USD ~30/month
infrastructure bill. The infrastructure is effectively fixed up to a volume far
beyond what a single VM will reach, so contribution margin per additional trade
is high and the model reaches breakeven at low absolute volume.

Illustrative, and explicitly a projection rather than a result: at an average
trade of 5,000 ETB and a 2% commission, roughly 30 trades per month covers all
infrastructure cost. Everything beyond that is contribution against the fixed
costs of the underlying trading business.

Market: Ethiopia has a population over 120 million and a long-standing cultural
relationship with gold, with mobile money penetration growing quickly through
telebirr. We are not claiming a total addressable market figure — an honest one
would require survey data we do not have.

Traction during the hackathon: none in revenue terms. The platform was built
and deployed in the window; it has not operated with live payment keys, so
there are no paying users and no revenue. We are not going to present test
transactions as traction.

Evidence of product-market fit that does exist: the product was specified
against a real gold trader's requirements, captured in an 80-question discovery
process with the owner of an operating gold business, and the work is
copyright-registered with the Ethiopian Intellectual Property Authority. That
is evidence of commitment and of a real commercial counterparty — not evidence
of demand, and we do not present it as such.

Five-year goal: [CONFIRM — the owner must set this. Do not invent a revenue
target.]
```

**[CONFIRM]** The five-year target, TAM and market-share figures must come from
the owner. If he does not have them, it is better to say the model is
pre-revenue and describe the path than to publish numbers that cannot be
defended.

---

## Section D — AI usage

### Which AI tools have you leveraged while working on this project?

```
Claude (Anthropic) was used throughout development as a coding assistant — for
architecture decisions, implementation, code review, debugging, and
documentation. Development ran as an explicit human-directed loop: plan,
approve, build, self-verify, joint manual verification, fix, hand off. Every
phase was reviewed and accepted by the developer before the next began.

Claude's design tooling was used to produce the design system and the approved
screen compositions the UI is built from.

Google Gemini is not a build-time tool here — it is a runtime component of the
product, described below.
```

### Please explain how your business operates with AI.

```
Two distinct uses, and we want to be precise about which is which.

In the product: Gemini powers the customer-facing assistant that explains
prices, fees, history, and a user's own position in five languages. That
function would otherwise require multilingual support staff available across
Amharic, Tigrinya, Afaan Oromoo and Somali — for a pre-revenue platform, it
would simply not exist. AI is what makes multilingual explanation viable at
zero marginal cost, and explanation is precisely the barrier keeping
first-time buyers out.

In how the business was built: the entire platform — double-entry ledger,
payments integration, compliance and KYC flows, admin console, five locales —
was built by one developer in ten days working with an AI assistant. That
compression is the AI-native part of the operation. A team of that size does
not otherwise ship a financial platform with database-enforced integrity
invariants in that window.

What AI does not do: it does not decide prices, approve trades, move money, or
make compliance decisions. Those are deterministic code paths and human
approvals, deliberately.
```

### Please explain the extent to which AI is live in production and executes key decisions.

```
AI is live in production and answers real user questions. It executes zero key
decisions, by design and by architecture.

The assistant has exactly three tools, all read-only: get the user's portfolio,
get the current price, get price history. The user's identity is bound from
their session token, so it cannot read another user's data. It cannot place an
order, approve a payout, freeze an account, adjust a balance, or alter the
vault. The module's dependency graph physically cannot reach a service that
writes money — this is enforced by construction, not by prompt instructions.

It is also instructed to explain rather than advise, and it declines
recommendations. This is a deliberate product decision for a platform touching
people's savings: an AI that tells Ethiopian savers what to buy is a liability,
and one that explains what happened is an asset.

The honest summary: AI is live, load-bearing for comprehension and access, and
deliberately excluded from every decision that moves money.
```

### Please explain which product from Google Cloud you used during the hackathon and how.

```
1. Compute Engine — the entire production platform runs on a single e2-small
   instance in europe-west1, with a reserved static IP and a firewall rule for
   HTTP/HTTPS. Five Docker containers run there: the Next.js web app, the
   NestJS API, the price worker, Redis, and Caddy terminating TLS with
   automatic Let's Encrypt certificates. The instance is provisioned by a
   startup script (swap, Docker, log rotation) and the whole stack restarts
   unattended after a reboot.

2. Gemini API (Generative Language API) — the customer-facing assistant,
   described below.

We chose a single consolidated VM over Cloud Run deliberately: the price worker
is a 30-second loop rather than a request, and the API holds open Server-Sent
Events connections with a live Redis subscriber. Both need a process that stays
up. The managed equivalent (Cloud Run × 3 + Memorystore + Cloud SQL) priced at
USD 80–100/month against USD ~20 for the VM, for identical behaviour.
```

**[CONFIRM]** If Vertex AI, BigQuery, Cloud Storage or any other Google Cloud
product was used, add it. Do not list products that were not used — judges
check against the invoice.

### If your project uses an LLM, it must use Gemini API for at least one LLM call. Explain which LLMs are used and specifically how the Gemini API is used.

```
Gemini is the only LLM in the product. There is no other model in the runtime.

Model: gemini-3.6-flash, called through the official @google/genai JavaScript
SDK from our NestJS API. The API is the guarded boundary — the browser never
holds a Gemini key and never calls Google directly.

How it is used: the assistant runs stateless. We pass store:false and replay
conversation history from our own database on every turn, rather than relying
on server-side chaining. That was a deliberate choice — chaining would have
required store:true, which means user balances sitting in Google-side
retention, and the free tier's short retention meant a replay path had to exist
anyway.

Tool calling drives the useful part. Gemini is given three read-only function
declarations — get_portfolio, get_price, get_price_history — and decides which
to call. Tool results are pre-formatted into final display strings before they
reach the model, so it quotes figures rather than computing them: an LLM doing
arithmetic on someone's gold balance is a defect waiting to happen.

The system instruction carries the guardrails: explain, never advise; answer in
the user's language (all five are named explicitly); and, when the account is
frozen, state the live reason rather than pretending everything is normal.

Error handling is a state machine rather than a try/catch: rate limits surface
as a localized, retryable message; an invalid history replay degrades once to
text-only rather than letting one corrupted row permanently break a
conversation; transient failures retry once.
```

---

## Section E — Repository and evidence

### URL to your GitHub repo

```
https://github.com/dagmfre/ALKEVA
```

**[ACTION REQUIRED]** The repo must be public with a licence, **or** private and
shared with `testing@devpost.com` and `judging@hacker.fund`. It is currently
private and **not yet shared**. Do this before submitting, then tick the
confirmation box.

> Note: if made public, confirm no secrets are in git history. `.env` files are
> gitignored, but a history audit is worth the ten minutes.

### Upload evidence of the project running

Required:

1. **Google Cloud billing invoice PDFs** for the competition period.
   Console → Billing → Invoices. If usage is zero-dollar or on credits, export
   the zero-dollar monthly invoice or the cost-table statement.
   → *Note: the `alkeva` project was created 16 Aug 2026, so the invoice will
   cover days, not months. That is the truthful record; submit it as is.*
2. **Gemini observability dashboard screenshots.**
   Console → APIs & Services → Generative Language API → Metrics.
   → *[CONFIRM] The Gemini key currently in production belongs to a different
   Google Cloud project. Either move the key into the `alkeva` project before
   capturing (recommended — it also fixes billing attribution) or screenshot
   the project the key actually belongs to. The dashboard must match the key.*
3. **Supporting material:** container logs showing the live price worker,
   ledger integrity query output (zero-sum across all assets), screenshots of
   the admin audit log.

---

## Section F — Pre-existing resources

### Are you using any pre-existing business resources (anything that existed before May 19, 2026)? If yes, list each and explain how it is applied.

```
Yes. Listed in full:

1. The client's existing gold-trading business. The owner, Tekleweyni Berhe
   Asgedom, operates an established gold trading business in Tigray, Ethiopia.
   It supplies the domain expertise the platform was specified against, the
   metal float that backs the vault, and the initial customer relationships.
   No code or software came from it.

2. The commercial relationship between the owner and the developer, which
   predates the hackathon. The platform was commissioned work.

3. The ALKEVA name and brand mark, supplied by the owner.

No pre-existing codebase, software, employees, audience, follower base, mailing
list, or partnership was used. All source code in the repository was written
between 6 and 16 August 2026.

[CONFIRM — the owner must verify each item, and add anything the developer
cannot see: prior customer lists, existing social accounts, partnerships, or
any earlier prototype.]
```

> **Also disclose the copyright registration.** ALKEVA is registered with the
> Ethiopian Intellectual Property Authority (registration 8/1/00317,
> application CMP/W/12588/2018 E.C). **[CONFIRM the Gregorian registration
> date.]** If it predates 19 May 2026, it belongs in the list above. If it was
> filed during the hackathon period, say so — it is a strength either way, and
> concealing the date is the only version that hurts.

---

## Section G — Financials

> Every figure here is verifiable against the Google Cloud invoice and the P&L.
> Keep them consistent.

### Total Revenue during the Hackathon period (USD)

```
$0
```

### Revenue by Month (USD)

```
May: $0, June: $0, July: $0, August: $0
```

### Explain the revenue shared above.

```
Zero. The platform operated on Chapa sandbox keys throughout the hackathon
period and never processed a live payment. No customer was charged, no
commission was earned, and no trade involved real money.

The revenue model is live in code and fully exercised end to end — commission
is calculated, fees are itemised on every receipt, and settlement posts to the
ledger — but exclusively against sandbox transactions. Presenting those as
revenue would be misrepresentation.

Price per customer when live: 2% commission on trade value, charged per
transaction, no subscription.
```

### Related-Party Revenue (USD)

```
$0
```

No revenue of any kind was earned, related-party or otherwise.

### Total Expenses during the Hackathon period (USD)

```
[CONFIRM — take from the Google Cloud invoice. Expected order of magnitude:
under $5, since the project was created on 16 August 2026 and has run for days,
not months. Add the domain if one was purchased.]
```

### Explain the expenses above.

```
Expenses were almost entirely infrastructure — Google Compute Engine (one
e2-small instance, a static IP, and a 20 GB disk) plus Gemini API usage.

Breakdown by category:
- COGS: ~100% of total expenses. Infrastructure is a direct cost of serving the
  product.
- Sales and marketing: 0%. No advertising, no promotion, no customer
  acquisition spend of any kind.
- Research and development: 0% in cash terms. Development was the founder's and
  developer's own time; no salaries, contractors, or tooling were paid for
  during the period.
- General and administrative: 0%.

Driver for the single expense category: a deliberately consolidated
architecture. Running the whole stack on one VM instead of managed services
holds infrastructure at roughly USD 20–30/month rather than USD 80–100.

Third-party services used (Supabase Postgres, Chapa payments, Brevo email) were
all on free tiers and cost nothing during the period.

[CONFIRM exact figures against the invoice before submitting.]
```

### Total COGS (USD)

```
[CONFIRM — equals total expenses; effectively all cost is infrastructure.]
```

### Explain the expenses associated with your COGS.

```
Google Compute Engine e2-small instance, reserved static IPv4, and a 20 GB
balanced persistent disk in europe-west1, plus Gemini API calls serving the
customer assistant. These are the direct costs of keeping the platform
available and answering users.
```

### Total marketing and customer acquisition expense (USD)

```
$0
```

### Explain the marketing and customer acquisition expenses.

```
None. No advertising, no promotional activity, no sales expenditure, and no
customer acquisition spend during the hackathon period. The platform was built
and deployed but has not been marketed — it is not yet operating with live
payment keys, so acquiring users would have been premature.
```

### Additional Expenses

```
[CONFIRM — e.g. domain registration if purchased (~$10–15/year). Otherwise:
None.]
```

---

## Section H — Users and learning

### Number of users acquired during the hackathon

```
[CONFIRM. The honest answer is very likely 0 real users. Accounts exist in the
database, but they are development and verification accounts created by the
developer to test flows — not acquired users. If the owner demonstrated the
platform to anyone who registered themselves, count only those.]
```

### Number of those users paying

```
0
```

No payment rail was live. No user paid anything.

### Share a verifiable public testimonial

```
[CONFIRM — leave blank unless a genuine public post exists. This field is
optional. Do not manufacture one.]
```

### Level of learning derived from the project

```
Significant
```

---

## Section I — Agentic Economy Prize (optional, external)

```
[CONFIRM — recommend opting OUT.]
```

This is a separately-judged prize administered by Circle. It requires a Circle
wallet integration, a public repo verifying it, a wallet address, and a
block-explorer transaction URL. **ALKEVA has no Circle integration and no
blockchain component.** Opting in without one would mean submitting fields that
cannot be answered truthfully.

---

## Pre-submission checklist

- [ ] Repo shared with `testing@devpost.com` and `judging@hacker.fund`, or made
      public with a licence — then tick Devpost's confirmation box
- [ ] Git history audited for secrets if going public
- [ ] Google Cloud invoice PDF downloaded
- [ ] Gemini observability screenshots captured **from the project the key
      actually belongs to**
- [ ] P&L completed using the Devpost template (all zeroes except
      infrastructure cost)
- [ ] Demo video recorded and uploaded — script in `OPERATIONS.md` §8
- [ ] Screenshots captured at 1440px, 3:2 ratio
- [ ] Every **[CONFIRM]** in both documents resolved
- [ ] Submitter type decided, and consistent across both pages
- [ ] Copyright registration date verified in the Gregorian calendar
