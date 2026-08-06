# Gold trading web app with LLM and biometric security - Claude

Gold trading web app with LLM and biometric security

Share

Use the up and down arrow keys to move between messages.

## You said: Some client today called me and told that he has a big business idea and want me to build him a web app!

Some client today called me and told that he has a big business idea and want me to build him a web app!

Here are all the things that he told me that i remember:

-   He wants an llm powered web app that fetcch live gold current value from an api, users register and can buy/sell. He said: he once owned gold at corona time, and gold's value were in worst and he lost money because this kind of system weren't available!
-   Roles and Dashboards: Admin, users, governmental like mineral minister or national bank
-   llm: google's or Addis AI's llm has multiple local ethiopian languages(tigiregna, amharic, etc..) support so when integrated the llm do auto analysis and provide suggestions for specific user. user can chat to it.
-   Payment integrated so that any users can buy/sell online!
-   High level of security including face id and/or fingerprint. Any kind of suspicious user activity or llm activity will make the account freeze!
-   Delivery: Currently don't worry too much about it. He was saying that trust in the UI/UX must be clearly visible! for example he was saying that a 3d animation visualisation of user's gold should be visible as user's gold amount increases/decreases!
-   Users will get badges as they become the most valaubale or the most frequently experiencing user in the product!
-   Investors: We have a lot of rich investor people for this product
-   Minerals: Mainly gold but consists of different minerals
-   Business: This is a central business that the product's revenue will be directly to the business.
-   Budget: A fixed price for now + a share for me in the business in future(this needs clear clarification!)
-   Timeline: He wants this in a week and this needs deeper analysis and thinking
-   Tasks for me today: A google form that consists all relevant questions needed to be answered by the client before kicking of the development, A document that outlined everything: features, elements of the product, timelines, budgets any rules(this document may will be updated based on the google form's answers when that arrive from the client)

My questions:

-   What are the known business models that are very related to this? Which business model should be selected for this? Explain the high level system architecture and design!
-   Who owns the Physical gold? I am not sure if the business owns physical gold?
-   How do users buy/sell without any physical actiity of gold? how do we handle that? How do we ensure trust here?
-   How do we ensure trust?
-   How should the roles look like? How should i handle the roles?
-   Limit of single transations from current legal policies? Any ethiopian local policy or rules that might affect(+vely or -vely)
-   Do you think this product can be done in a week?
-   He said i will be having shares in this company if i built it good, and that is what i want more than the fixed price, but how can i ensure that?

Please think harder/broader on this project, do a deep research and provide your refelctions and answers to the questions!

Message collapsedShow more

5 days ago

## Claude responded: Short answer first

Architected regulated gold trading platform with legal guardrails and equity protections

Architected regulated gold trading platform with legal guardrails and equity protections

### Short answer first

Three things reshape this project before any code:

**1\. As described, this product is not legally launchable in Ethiopia right now.**  
On July 23, 2026 the NBE reaffirmed that its virtual-asset ban is not limited to cryptocurrencies but covers a wide range of digital representations of value that can be electronically traded, transferred, exchanged, or used for payment and investment purposes, and explicitly includes exchanging virtual assets for fiat, transferring value, and safekeeping/custody services. A gold balance that users buy, sell, and hold inside your app is exactly that shape. [Capitalmarketethiopia](https://www.capitalmarketethiopia.com/national-bank-of-ethiopia-re-emphasizes-strict-ban-on-virtual-assets-and-cryptocurrencies/)[Capital Newspaper](https://capitalethiopia.com/2026/07/26/nbe-tightens-virtual-asset-ban/)

**2\. Your client's founding story is factually wrong.**  
Gold did not crash during Covid. It rose ~25% in 2020 and hit a then-record ~$2,067/oz in August 2020. If he lost money, it was on the **local dealer spread and liquidity**, not the gold price. That changes the product's reason to exist (good news — the real problem is more solvable).

**3\. One week is not the timeline. It's the demo timeline.**

Everything below expands these.

---

### Correct these assumptions before your next call

His assumption

Reality

"Gold crashed in Corona, I lost money"

Gold rose ~25% in 2020. His loss came from jewellery markup / dealer buy-back spread / not being able to find a buyer

"Users buy and sell gold in the app"

That's a regulated activity in Ethiopia twice over: minerals licensing **and** NBE payments/virtual-asset rules

"Addis AI supports Tigrigna, Amharic, etc."

Addis AI's stack is purpose-built for Amharic and Afan Oromo. [Addis AI](https://platform.addisassistant.com/) Tigrigna is not on their platform. Verify before promising

"LLM gives personalized suggestions"

Personalized investment advice is a **licensed activity** under ECMA. The LLM can educate; it cannot advise

"LLM activity freezes the account"

Never. A deterministic rules engine freezes accounts. The LLM explains the freeze in Amharic

"3D animation makes users trust us"

Animation is theater. Trust comes from a named custodian, an audit date, and a working redemption button

"One week"

A demo in a week. A product in 3–6 months. A licensed business in 12–24 months

---

## Q1. Business models

### The seven real models

#

Model

User owns

Who holds gold

Regulatory load

1

**Allocated vaulted bullion** (BullionVault, GoldMoney)

Specific bars/grams in their name

Platform as custodian

High (custody)

2

**Unallocated / pooled digital gold** (SafeGold, MMTC-PAMP, Augmont)

A claim on a pool

Platform

Medium, but toxic — see below

3

**Gold-backed token** (PAXG, Zimbabwe ZiG)

A token

Issuer

**Banned in Ethiopia** unless the central bank issues it

4

**Gold savings / accumulation plan**

Grams accumulated monthly, redeemed as jewellery or coin

Refiner/jeweller

Medium

5

**Regulated gold fund / gold bond**

A security

Fund custodian

Highest, but _legal_

6

**Bullion e-commerce** (physical delivery only)

Physical metal at their door

Nobody — it ships

Lowest

7

**Marketplace / broker** (platform never touches gold or money)

Nothing

Licensed dealers

Lowest

### Why model 2 is a trap

India ran the pooled digital-gold experiment at scale, and in November 2025 SEBI warned that these products are not recognised as securities or regulated commodity derivatives, and that no securities-market investor protection applies. The result was immediate: fintech platforms saw roughly a threefold surge in user withdrawals within days, and the advisory left operators unable to point to any regulator auditing vault inventory or purity. [newsonair](https://www.newsonair.gov.in/sebi-warns-investors-against-unregulated-digital-gold-schemes)[business-standard](https://www.business-standard.com/amp/markets/commodities/digital-gold-fintechs-face-scrutiny-amid-sebi-warning-125111101962_1.html)

That's the failure mode. An unregulated gold-claim product survives right up until a regulator says one sentence about it. Then it has a bank run.

### What Zimbabwe got right (and it's the template)

Zimbabwe's gold-backed digital token worked because the _central bank_ was the issuer. Tokens were issued in milligrams through custodian banks inside the central securities depository, sold through banks in local and foreign currency, subject to a 180-day vesting period, with KYC enforced by financial institutions and the Financial Intelligence Unit acting on suspicious funding. Usability, distribution, wallets, and cards were delegated to commercial banks. [Mining Zimbabwe](https://miningzimbabwe.com/rbz-gold-backed-digital-tokens-pricing-application-redemption-and-more/)[OMFIF](https://www.omfif.org/2023/11/zimbabwe-makes-foray-into-gold-backed-cbdc/)

Note who built what: the state provided the license and the gold; the banks provided distribution; software vendors built the rails. **Nobody did all three.**

### My recommendation

**Build model 1 (allocated), sell it B2B2C to a licensed institution, and structure it as a dealer — not an exchange.**

```
WRONG (what he described)

  Users ────► Order book ────► Users
                  │
            Your company holds
            the gold + the money
            (= unlicensed exchange
               + unlicensed bank)

RIGHT

  Users ──► Your app ──► Quote engine (buy/sell price you publish)
                              │
                              ▼
                    Licensed partner (bank or
                    licensed mineral trader)
                         ├── owns the gold
                         ├── holds customer money
                         └── holds the license

  You own: the platform, the UX, the LLM, the ledger software
```

**Why a dealer, not an exchange:** the moment you run an order book where users trade with each other, you are operating a market. ECMA's Directive No. 1009/2024 governs licensing, operation and supervision of derivatives exchanges and over-the-counter markets. Quoting a buy price and a sell price and being the counterparty on both sides is a fundamentally smaller regulatory object. [Chambers and Partners](https://practiceguides.chambers.com/practice-guides/investing-in-2026/ethiopia/trends-and-developments/O23716)

**Why the timing is genuinely good:** the IMF's Fourth Review confirms the NBE will exit the gold market around end-December 2026, opening the space for private banks, and Ethiopia will phase out the artisanal-miner premium and allow private banks to buy gold, after officially recorded gold exports jumped from just over 4 metric tons in 2023/24 to nearly 39 tons in 2024/25. [The Reporter](https://www.thereporterethiopia.com/48875/)[Birr Metrics](https://birrmetrics.com/central-bank-to-allow-private-banks-to-buy-gold-end-premium-for-artisanal-miners/)

Every private bank in Ethiopia is about to need a retail gold product and none of them will build the software. **That is the actual business.** Not a consumer app your client owns alone.

---

## High-level architecture

### System shape

```
   ┌─────────────────────────────────────────────────┐
   │  Clients: mobile (primary), web                 │
   │  device biometrics only — no face templates     │
   │  ever leave the phone                           │
   └───────────────────┬─────────────────────────────┘
                       │
              ┌────────▼────────┐
              │   API Gateway   │  authn, rate limit, idempotency keys
              └────────┬────────┘
                       │
   ┌───────────────────┼──────────────────────────────┐
   │                   │                              │
┌──▼──────┐   ┌────────▼────────┐   ┌────────────────▼──┐
│ Identity│   │  TRADING CORE   │   │  Compliance       │
│ + KYC   │   │  (deterministic)│   │  (deterministic)  │
│         │   │                 │   │                   │
│ Fayda   │   │ quote engine    │   │ rules engine      │
│ liveness│   │ order FSM       │   │ velocity limits   │
│ tiers   │   │ ledger (2-entry)│   │ CTR/STR triggers  │
└─────────┘   │ settlement      │   │ freeze authority  │
              └────────┬────────┘   └───────────────────┘
                       │
        ┌──────────────┼──────────────┬─────────────────┐
        │              │              │                 │
   ┌────▼────┐   ┌─────▼─────┐  ┌─────▼─────┐   ┌───────▼──────┐
   │ Price   │   │ Payments  │  │ Custody   │   │  LLM SIDECAR │
   │ feed    │   │ Telebirr  │  │ vault     │   │  read-only   │
   │ + FX    │   │ CBE, IPS  │  │ recon job │   │  no writes   │
   └─────────┘   └───────────┘  └───────────┘   └──────────────┘
```

### Five non-negotiable design rules

**Rule 1 — The LLM is never in the money path.**

```
Never:   user ──► LLM ──► executes trade
Always:  user ──► LLM ──► explains, drafts, translates
         user ──► deterministic API ──► executes trade
```

The LLM reads balances and market data. It cannot write to the ledger, cannot approve KYC, cannot freeze or unfreeze. If your client insists otherwise, that single decision makes the product uninsurable and unlicensable.

**Rule 2 — Double-entry, append-only ledger.**  
No `UPDATE balance SET ...`. Every gram and every birr is a pair of immutable entries. Balance is a projection, not a column. This is the difference between a fintech and a spreadsheet with a login page.

**Rule 3 — Quotes expire.**  
The user sees a price with a TTL (say 30 seconds) and a quote ID. They confirm against the quote ID, not against "current price". Otherwise every latency spike is free money for someone.

**Rule 4 — Reserve ratio gate.**  
A job runs continuously: `SUM(user_grams) ≤ vault_grams`. If it drops below 1.0, buying halts automatically. Publish the ratio in the app.

**Rule 5 — Maker-checker on everything privileged.**  
No single employee can create _and_ approve a money movement, a manual gram adjustment, or an account unfreeze.

### Stack (matched to what you already run)

Layer

Choice

Why

Core API + ledger

NestJS + PostgreSQL

Transactional integrity, you already know it

DB

Postgres with `SERIALIZABLE` on ledger writes

Money needs real isolation

LLM services

FastAPI + LangGraph

Your existing pattern; keeps AI in its own process

Price feed

GoldAPI / Metals-API to start

Cheap, fine for a demo

Cache/queue

Redis

Quote TTL, idempotency keys

Audit log

Append-only table + WORM object storage

Regulators will ask

**Licensing warning on price data:** LBMA/ICE require a licence to obtain, use, or redistribute benchmark data, including for pricing and valuation activities and in transactions and financial products. Free API tiers are fine for a prototype. The moment you price real customer transactions off that feed, you need a commercial data licence. Budget for it. [LBMA](https://www.lbma.org.uk/prices-and-data/lbma-precious-metal-prices)

---

## Q2. Who owns the physical gold?

**Nobody has answered this, and it is the single biggest hole in the brief.**

Three possible answers, with very different companies attached:

Who owns it

Business becomes

Market risk

Capital needed

Fit for you

**The business** (dealer/principal)

A bullion dealer with an app

**Huge** — you're short gold

Very high

✗

**The users** (allocated custody)

A custodian + software company

None

Medium

✓ Best

**A third party** (bank/refiner)

A software vendor + distributor

None

Low

✓✓ Best for a solo dev

### Why "the business owns it" is dangerous

If users hold 10kg of gold claims and the company holds 6kg, the company is **short 4kg of gold**. Gold goes up 30%, and the company owes more than it can pay. That is not a technology risk. That is the exact mechanism by which every unbacked gold scheme in history has collapsed.

If your client cannot instantly answer "where is the vault, who insures it, who assays purity, who audits it" — the honest position is that there is no gold yet, and the product is a promise.

### Also: he may not legally be able to buy gold

Under the Mining Operation Proclamation, holders of special small-scale and artisanal mining licences engaged in gold or silver mining must sell their production to the National Bank of Ethiopia. And the Transaction of Minerals Proclamation No. 1144/2019 governs all post-production mineral transactions, requiring a certificate of competence and licences such as mineral supplier and mineral trader licences, issued by the Ministry of Trade and Regional Integration and the Ministry of Mines. [Dmethiolawyers](https://dmethiolawyers.com/mining-laws-in-ethiopia/)[Dmethiolawyers](https://dmethiolawyers.com/major-points-on-transaction-of-minerals-law-of-ethiopia-2/)

**Question for him: which of those licences does the business hold today?** If the answer is none, the sourcing plan doesn't exist yet.

---

## Q3 + Q4. Buying/selling with no physical movement, and trust

### The mechanic

Gold does not move. **The claim moves.**

```
Vault: 100,000 g   (never touched)

Alice buys 5 g  ──►  ledger: vault_pool -5g, alice +5g
Alice sells 2 g ──►  ledger: alice -2g, vault_pool +2g

Physical gold moved: 0 g
```

The metal only moves in two events: **inbound** (business buys bullion into the vault) and **redemption** (user takes delivery).

### What actually creates trust — in priority order

**1\. Redemption that works.**  
This is the only real proof. A user who can convert 20 grams into a physical bar and walk out with it makes everyone else believe. Set a minimum (e.g. 10g), publish the fee, and make the button always visible even when the user is below the minimum.

**2\. An independent trustee holding the gold for users.**  
Not the operating company. This makes the gold bankruptcy-remote — if the company dies, the gold is still the users'. India's better platforms use exactly this structure, and where they don't, SEBI's warning bit hard.

**3\. Published reserve attestation.**  
Monthly, third-party, with a date and an auditor's name. Show `user grams / vault grams` live in the app. The core of SEBI's concern was precisely that no regulator could inspect vaults to verify the presence and purity of the gold — so pre-empt it. [business-standard](https://www.business-standard.com/amp/markets/commodities/digital-gold-fintechs-face-scrutiny-amid-sebi-warning-125111101962_1.html)

**4\. Visible spread.**  
Show "you buy at X, we buy back at Y" **before** confirm, not after. Hidden spreads are how the client lost money on his own gold in the first place. Making it visible is the actual product innovation.

**5\. Serial-numbered receipts.**  
Every transaction produces a certificate with a transaction ID, grams, price, timestamp, and the custodian's name. In Amharic. Downloadable.

**6\. A named institution on the login screen.**  
In Ethiopia this outperforms every UI decision you can make. A bank's logo does more for trust than the best 3D scene you can ship.

### On the 3D visualization

Build it — but understand what it's for. It's **engagement and comprehension** ("my pile got bigger"), not trust. Trust is items 1–6.

Cheap version that gets 80% of the effect: an animated bar/coin stack with a real-time birr value and a 24h change indicator. Save WebGL for v2.

---

## Q5. Roles

### First, a correction

"Admin, user, government" is not a role model. It's three job titles. You need four separate concepts:

```
Identity   → who the person is        (one per human)
Role       → what job they do          (many per identity)
Permission → what actions they can do  (many per role)
Scope      → which records they touch  (data filter)
```

### The role set

Role

Can do

Must never do

**Retail user**

Buy, sell, redeem, chat, view own history

See anyone else's data

**Corporate user**

Same + higher limits, multiple approvers

—

**Support agent**

Read tickets, view masked PII

Move money, unfreeze, see full ID numbers

**KYC officer**

Approve/reject onboarding, request documents

Move money

**AML analyst**

View alerts, freeze accounts, file STRs

Approve their own freeze reversal

**Treasury/vault operator**

Record bullion in/out, run reconciliation

Adjust a user's gram balance

**Approver (maker-checker)**

Second signature on privileged actions

Initiate the action they approve

**Platform admin**

Config, feature flags, user roles

**Mint grams or edit balances — ever**

**Auditor**

Read everything, immutably logged

Write anything

**Regulator/supervisor**

Read aggregate reports

Log into production

### Three rules that matter more than the list

**Rule A — Admin must not be able to create value.**  
The most common catastrophic bug in these systems is an admin panel with a "adjust balance" field. Gram supply changes only via (a) a settled user purchase or (b) a treasury operation with two signatures and a vault receipt attached.

**Rule B — The regulator role is a separate product, not a login.**  
Don't give a ministry an account in your production admin panel. Build a **read-only reporting service** that generates the reports they ask for. Different service, different database replica, no PII beyond what the law requires.

**Rule C — Do not build the government role at all yet.**

This is important and I'd push back on him directly. Building a "Mineral Minister dashboard" before any ministry has asked for one in writing gives you:

-   dead code you maintain forever
-   a security surface with nothing behind it
-   an **implied claim of government partnership you do not have**

In a sector where the National Intelligence and Security Service has alleged that digital payment platforms were being used to settle contraband trade and gold smuggling, implying a government relationship you can't document is a serious risk — not just a marketing exaggeration. [Launch Base Africa](https://launchbaseafrica.com/2026/07/23/from-binance-unblocks-to-total-ban-ethiopia-targets-crypto-wallets-in-expanding-digital-asset-ban/)

Design the permission model so a regulator role _can_ be added in a day. Don't ship it.

---

## Q6. Ethiopian legal reality

### The five walls

**Wall 1 — Virtual assets (the hardest one).**  
The NBE's July 23, 2026 notice states that a broad range of virtual asset activities remain illegal unless expressly authorized, and that the restriction is not limited to cryptocurrencies but applies to any digital representation of value that can be electronically transferred. Prohibited activities explicitly include exchanging virtual assets for fiat, transferring value, providing safekeeping services, and supporting public token offerings. This built on the February 2026 prohibition of birr-paired P2P trading on digital-asset platforms. [Bitcoinke + 2](https://bitcoinke.io/2026/07/ethiopia-expands-virtual-asset-ban/)

**Practical read:** a transferable, tradeable gold balance is at serious risk of falling inside this. A **non-transferable, redeemable-only, allocated custody receipt issued by a licensed institution** is a much better structure. Get a written opinion from Ethiopian financial-services counsel before launch. Not after.

**Wall 2 — Holding customer money.**  
If you hold user balances, you're a payment instrument issuer. Minimum paid-up capital is ETB 50 million in cash, deposited in a blocked account, with a pilot period of 6–9 months before a full licence. A payment gateway operator is ETB 3 million. [Dmethiolawyers](https://dmethiolawyers.com/ethiopias-payment-system-regulation-shaping-the-future-of-payment-transactions/)[Aaclo](https://www.aaclo.com/insight/observations-on-payment-system-operators-directive/)

**Critical for his investor pitch:** only Ethiopian nationals and foreign nationals of Ethiopian origin may engage in payment system operating business — foreign investors cannot, though they can supply technology to licensed operators. If any of his "rich investors" are foreign, this constrains the cap table. [Aaclo](https://beta.aaclo.com/insight/observations-on-payment-system-operators-directive-2/)

**The clean workaround:** don't hold money. Route through a licensed PSP so funds settle into a licensed institution's account, never yours.

**Wall 3 — Minerals licensing.** Covered in Q2. Certificate of competence + supplier/trader licences.

**Wall 4 — Capital markets.** If you promise returns, offer an investment product to the public, or give personalized advice, ECMA's framework applies — including the Public Offering and Trading of Securities Directive No. 1030/2024 and the derivatives/OTC Directive No. 1009/2024. This is the specific reason the LLM must educate, not advise. [Chambers and Partners](https://practiceguides.chambers.com/practice-guides/investing-in-2026/ethiopia/trends-and-developments/O23716)

**Wall 5 — AML/CFT.** Proclamation No. 780/2013, updated by No. 1176/2020, is the backbone; the Financial Intelligence Service collects Suspicious Transaction Reports, and penalties can reach ETB 10 million. The currency transaction reporting threshold is ETB 500,000, and STRs should generally be filed within 48 hours of suspicion arising. [VOVE ID + 2](https://blog.voveid.com/aml-compliance-in-ethiopia-a-2025-guide-for-fintechs-and-regulated-businesses/)

Dealers in precious metals are a designated non-financial business under FATF standards, so this applies to you directly, not just to your bank partner.

### Tailwinds (these are real and they matter)

Tailwind

Why it helps

NBE exiting the gold market end-2026, private banks entering [The Reporter](https://www.thereporterethiopia.com/48875/)

Your distribution partner is being created by policy

Gold exports up from ~4t to ~39t in one year [Birr Metrics](https://birrmetrics.com/central-bank-to-allow-private-banks-to-buy-gold-end-premium-for-artisanal-miners/)

Formalizing gold is a national priority

EthioPay-IPS instant payments launched Dec 2025, connecting 32 banks, 12 MFIs, 3 PSOs and 3 PIIs [Finovate](https://finovate.com/finovate-global-east-africa-investing-in-digital-banks-delivering-on-instant-payments-and-more/)

Cheap, fast settlement rails already exist

Fayda national ID

Cheap, strong KYC

Kenya's Ubuntu Tribe launched fractional mobile gold at KSh20 in June 2026 [Dawan Africa](https://www.dawan.africa/news/new-digital-platform-lets-kenyans-buy-gold-for-as-little-as-ksh20)

Regional proof of demand

### Practical transaction limits to build in on day one

Even before a regulator sets them, hard-code:

-   KYC tiers (Tier 0: view only → Tier 3: full)
-   Per-transaction, daily, and monthly caps per tier
-   Automatic flag at ETB 500,000 aggregate
-   Structuring detection (many transactions just under a threshold)
-   Source-of-funds prompt above a set value
-   A cooling period on first withdrawal after account creation

Retrofitting these is 10× the work.

---

## Q7. Can this be built in a week?

**No.**

Here is what a week actually buys:

### Week 1 — Investor demo (achievable, and genuinely valuable)

-   Live gold price → ETB conversion
-   Mock buy/sell against a **simulated** ledger
-   Portfolio view + the 3D/animated gold visualization
-   Amharic LLM chat that explains gold, price history, and the user's simulated position
-   Watermarked **DEMO — NO REAL MONEY, NO REAL GOLD** on every screen

That's a strong artifact. It raises money and opens bank conversations.

### The honest roadmap

Phase

Duration

What ships

0\. Demo

1 week

Above

1\. Real core

5–7 weeks

Double-entry ledger, KYC, auth, admin, audit log — closed internal testing only

2\. Money + metal

6–8 weeks

PSP integration, custody reconciliation, compliance engine, redemption flow

3\. Hardening

4 weeks

Pen test, load test, DR, runbooks

4\. Licensing

**6–18 months**

Not engineering. Legal, capital, partner bank

**Engineering to a real launch: 4–6 months for one senior developer.** Add a second engineer and it's ~3 months, not 2 weeks — coordination overhead is real on ledger code.

### What to say to him

Frame it as sequencing, not refusal:

> "I can have a working demo in a week that you can show investors and a bank. What I can't do in a week is a system that holds real customer money — that takes months, and rushing it is how these products end up with a hole in the ledger. Let's ship the demo Friday and use it to have the conversations that decide the rest."

**One more thing worth naming plainly:** "one week" + "regulated financial product" + "we have many rich investors" is a pattern. It usually means the deadline exists for a fundraising meeting, not for users. Ask him directly what happens on day 7. The answer tells you what to build.

---

## Q8. Protecting your equity

**Answer: equity that isn't in a signed document with a registered entity behind it does not exist.**

### The Ethiopian constraint you need to know

A PLC requires 2–50 members; a Share Company requires at least five founding shareholders, minimum capital of ETB 50,000, with freely transferable shares. Ethiopia has **no functioning ESOP practice**. There is no cap-table norm, no standard vesting instrument, and share transfers in a PLC mean amending the memorandum and re-registering. [Thomsonreuters](https://anzlaw.thomsonreuters.com/w-016-1313?transitionType=Default&contextData=\(sc.Default\))

Translation: **"I'll give you shares later" is close to unenforceable unless it's written now.**

### Ten clauses to get before you write code

**1\. Never let equity replace cash.**  
The fixed fee must cover your time at your normal rate. Equity is upside, not payment. If he can't pay market rate, the fee should go _up_ to compensate for the risk you're absorbing, not down because of a share promise.

**2\. Sign before you build.**  
Your leverage is at maximum right now. After delivery it is zero.

**3\. Handle the "company doesn't exist yet" problem.**  
Put a binding obligation in the development agreement:

> "Upon incorporation of the Company, the Company shall issue to \[you\] X% of the fully diluted share capital."  
> Plus a deadline and a remedy if incorporation never happens (fee multiplier, or the IP stays yours).

**4\. "Fully diluted." Always.**  
5% of "issued shares" becomes 0.4% the day investors come in. 5% of fully diluted capital doesn't.

**5\. Milestone vesting, not time vesting.**  
For a project engagement, tie tranches to acceptance:

```
Phase 1 accepted  →  X%
Phase 2 accepted  →  X%
Phase 3 accepted  →  X%
```

Time-based vesting assumes an employment relationship you won't have.

**6\. Define "good."**  
"Shares if you build it good" is unenforceable. Replace with written acceptance criteria per phase.

**7\. IP assignment conditional on performance.**  
**This is your real enforcement mechanism.** Until the shares are registered and the fee is paid, you grant a **licence** to use the code. You do not assign ownership. Ownership transfers on the trigger event.

Everything else is a promise. This is a lever.

**8\. Anti-dilution or pre-emptive rights.**  
Otherwise the "many rich investors" issue new shares and your 5% becomes 0.5%.

**9\. Tag-along rights.**  
If they sell the company, you sell at the same per-share price.

**10\. Information rights.**  
Annual audited financials, at minimum. Minority shares in a private Ethiopian company that reports nothing to you are worth approximately nothing.

### Consider asking for revenue share instead — or as well

Minority shares in a private Ethiopian company are **illiquid**. No exchange, no buyer, dividends at the majority's discretion.

A **royalty on platform revenue** (say 2–4% for N years, with a cap) can be worth more, pays sooner, and is far easier to enforce. Ask for both structures priced side by side, then choose.

### Non-negotiable

Get an Ethiopian corporate lawyer to draft this. A few thousand birr against a multi-month build and a share promise is not a close call. I'm not a lawyer and none of the above is legal advice — it's the checklist to hand to one.

---

## The 12 questions that decide whether this project is real

These belong at the top of your Google Form, before any feature question:

**Gold**

1.  Does the business currently own any physical gold? How much, and where is it stored?
2.  Which mineral licences does the business hold — supplier, trader, exporter, certificate of competence?
3.  Who assays purity, and who insures the vault?

**Money**  
4\. Who holds customer funds? Which licensed institution, and is there a signed agreement?  
5\. Has the business spoken to the NBE about this product? Any written response?  
6\. What legal opinion exists on whether this falls under the July 2026 virtual-asset notice?

**Company**  
7\. Does the company legally exist today? Registration number and date?  
8\. Who are the current shareholders and their percentages?  
9\. Are any investors foreign nationals?

**Commercial**  
10\. What is the fixed fee, and what is the payment schedule?  
11\. What exact percentage of fully diluted equity, and on what trigger?  
12\. What happens on day 7 — who is the demo actually for?

If questions 1, 4, and 7 come back empty, you're building a pitch deck in software form. That's a legitimate thing to build — just price it and scope it as one.

---

I can produce both of today's deliverables now: the full Google Form question bank (organized into the sections above, with question types and conditional logic), and the product/scope/timeline/terms document. Tell me which you want first, or say "both" and I'll build them together.

5 days ago

## You said: I am not sure you already know this but one point he explicitly said that i forgot: The platform is not a broker platform with an escrow system that meets buye…

I am not sure you already know this but one point he explicitly said that i forgot: The platform is not a broker platform with an escrow system that meets buyers/sellers ❌

5 days ago

## Claude responded: Answer first

Recalibrated architecture eliminating broker model, clarifying ownership structure implications

Recalibrated architecture eliminating broker model, clarifying ownership structure implications

### Answer first

That confirms the architecture I recommended — but it **removes both of the low-regulation escape hatches** and forces one question to be answered this week instead of next quarter.

"Not a broker" means the platform is the **counterparty**. The user buys _from you_ and sells _back to you_. That's a principal dealer.

Which means: **you must own gold, and you must own it before the user does.**

---

### First, separate two things he may be conflating

"Not a broker with escrow" is a **user-experience** requirement, not a balance-sheet requirement.

```
What he's rejecting (UX):
  User posts "want 5g" → waits → matched with a seller
  → escrow → confirm → settle          ← slow, uncertain

What he wants (UX):
  User taps buy → done in 2 seconds     ← instant, always available
```

That instant experience is **fully compatible** with a licensed bank or refiner sitting behind you as the actual principal. The user never sees them. They see one price, one button, one confirmation.

Structure

User experience

Who owns gold

Who carries risk

Broker/matching

Slow, waits for counterparty

Other users

Nobody

**You as principal**

Instant

Your company

**Your company**

**Licensed partner as principal, you as the app**

**Identical — instant**

Partner bank/refiner

Partner

So the real question to put to him isn't "broker or not." It's:

> **"Does the company want to carry the gold on its own balance sheet, or does it just want the user to never wait?"**

Most clients who say "not a broker" mean the second thing. Ask.

---

### If he genuinely means the company is the principal

Three risks land on the company the moment a user taps buy.

#### Risk 1 — Working capital

Illustrative, at roughly ETB 20,000/gram:

```
1,000 users × 5g average  =  5,000 g held by users
Gold you must own          =  5,000 g
Capital tied up            ≈  ETB 100,000,000
```

That's before payroll, before the vault, before insurance. Ten thousand users and it's a billion birr. **Growth consumes cash instead of producing it** — the opposite of normal software economics. Your client's investors need to understand this before they hear "users."

#### Risk 2 — You are structurally short a rising asset

If a user buys 5g and you haven't yet bought 5g of physical, you owe gold you don't have.

```
Spread income on ETB 100M of turnover @ 4%  =  ETB 4,000,000
Loss on 5,000 g unhedged if gold moves 5%   =  ETB 5,000,000
```

**One bad week erases the spread on the entire book.** And the birr side makes it worse — the birr has depreciated by over 140% against the dollar since exchange-rate liberalization took effect in July 2024. Gold priced in birr has been going almost straight up. Being short it is the wrong side of the trade. [Ethiopianpolicy](https://ethiopianpolicy.com/2025/08/09/ethiopias-forex-crisis/)

#### Risk 3 — You cannot hedge this in Ethiopia

This is the finding that matters most.

Normally a dealer offsets inventory risk with a futures or forward contract. In Ethiopia that instrument does not exist:

-   The IMF describes Ethiopia's financial market as underdeveloped and lacking hedging instruments, with a tightly closed capital and financial account — and notes that the absence of hedging against exchange-rate risk is a reason importers resort to the parallel market. [IMF eLibrary](https://www.elibrary.imf.org/view/journals/002/2025/189/article-A001-en.xml)
-   There is no well-defined legal framework governing forward contracts, and no centralized exchange or clearing house to standardize or enforce them; ECX's forward-pricing functionality remains limited. [MultiLink Consulting](https://multilinkconsult.com/2023/09/20/the-case-for-introducing-derivative-contracts-in-the-ethiopian-commodity-exchange/)
-   ECX trades coffee, sesame, and pulses. Not gold.
-   Offshore hedging (COMEX, LBMA) requires moving USD abroad, which requires NBE permits and must go through authorized dealers. [Privacy Shield](https://www.privacyshield.gov/ps/article?id=Ethiopia-Foreign-Exchange-Controls)

**Conclusion: there is no hedge available. Therefore the only safe design is 100% physically backed, bought at the moment of sale.**

```
User taps BUY 5g
   │
   ├─► Reserve 5g from existing inventory   ← if available
   │
   └─► If inventory < threshold:
         trigger physical purchase order
         and WIDEN THE SPREAD or QUEUE
```

You never sell a gram you don't hold. That single rule replaces an entire risk-management function you cannot build here.

---

### Risk 4 — The one nobody thinks about: the buyback obligation

Being the counterparty on _sells_ is harder than on _buys_.

If you promise instant sell-back, you have promised **instant liquidity in birr** on demand. On a day when the gold price drops and everyone sells at once, you need cash you don't have — because your cash is sitting in a vault as metal.

That is a bank run with extra steps.

**Treasury policy you must design on day one:**

Control

Purpose

Cash float target (e.g. 10–15% of book value in birr)

Absorb normal daily redemptions

Daily sell-back cap per user

Stop a single whale draining the float

Platform-wide daily redemption ceiling

Circuit breaker

Dynamic spread that widens with volatility

Price the risk instead of eating it

Automatic buy-halt when reserve ratio < 100%

Prevents digging deeper

Settlement window disclosure (T+0 up to a limit, T+1 above it)

Honest, and legally much safer than an implied instant guarantee

Disclose these in the terms **before** launch, not during the crisis. A published T+1 above a threshold is a feature. A surprise T+1 is a scandal.

---

### What changes in the architecture

Two new services, and one existing one gets teeth:

```
                    ┌──────────────────┐
   Trading core ───►│ POSITION MONITOR │  net gold position, live
                    │  users_grams vs  │  → halts buy if short
                    │  vault_grams     │  → alerts treasury
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │ INVENTORY /      │  procurement triggers
                    │ TREASURY SERVICE │  cash float tracking
                    │                  │  redemption ceilings
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  SPREAD ENGINE   │  base spread
                    │                  │  + volatility premium
                    │                  │  + inventory skew
                    └──────────────────┘
```

**Spread engine detail** — this is the pricing brain, and it's genuinely the most commercially important component:

```
buy_price  = spot + base_spread + vol_premium + inventory_skew
sell_price = spot - base_spread - vol_premium + inventory_skew

inventory_skew: long on gold  → quote cheaper buys, dearer sells
                short on gold → quote dearer buys, cheaper sells
```

That's how you steer the book back to flat without a derivatives market. It's the _only_ tool you have here, so build it properly rather than hard-coding a 4% spread.

**Everything else from my earlier answer stands unchanged.** Double-entry ledger, quote TTL, LLM out of the money path, maker-checker, reserve gate.

---

### The regulatory position got harder, not easier

The two lowest-load models I listed — pure marketplace and physical-delivery e-commerce — are now off the table. What remains is squarely inside the licensing perimeter:

-   Owning and trading gold → mineral supplier and mineral trader licences under the Transaction of Minerals Proclamation No. 1144/2019, plus a certificate of competence [Dmethiolawyers](https://dmethiolawyers.com/major-points-on-transaction-of-minerals-law-of-ethiopia-2/)
-   Holding customer money → payment instrument issuer, ETB 50 million paid-up capital in a blocked account [Dmethiolawyers](https://dmethiolawyers.com/ethiopias-payment-system-regulation-shaping-the-future-of-payment-transactions/)
-   Issuing tradeable gram balances → the July 2026 NBE notice on digital representations of value [Capitalmarketethiopia](https://www.capitalmarketethiopia.com/national-bank-of-ethiopia-re-emphasizes-strict-ban-on-virtual-assets-and-cryptocurrencies/)

Being the principal is precisely the thing that requires the licences. There's no clever structure that avoids this — only a partner who already has them.

---

### Add these to the Google Form

Replace question 1 with a harder set:

**Inventory & capital**

1.  How much working capital is committed to gold inventory before launch? Specific number.
2.  Who supplies the physical gold, and at what price relative to NBE's published rate?
3.  What is the maximum total user holding the company can back? (This is your launch cap — build it as a hard limit in code.)

**Treasury**  
4\. What birr cash float will be held for buy-backs?  
5\. Is the company willing to publish redemption limits and settlement times in the terms?

**Risk tolerance**  
6\. Does the company accept that it carries full gold price risk with no hedge available in Ethiopia?  
7\. If gold moves 10% against the company in a week, what is the plan?

**Structure**  
8\. Would the company accept a licensed bank or refiner as the principal behind the app, if the user experience stays instant?

Question 8 is the one that decides everything. If he says yes, this becomes a buildable software business. If he says no, it becomes a capital-intensive licensed commodity dealer that happens to have an app — a fundamentally different company with a fundamentally different budget.

---

### What to say to him

> "Understood — no matching, no escrow. That means the platform is the counterparty, so before I design the trading core I need to know: how much gold does the business hold, and how much birr is set aside to buy it back? In Ethiopia there's no way to hedge gold price risk — no futures market, and the capital account is closed — so the only safe design is that we never sell a gram we don't already own. That's a hard architectural constraint, not a preference. Once I know the inventory number, I can size the launch cap and build the position controls around it."

That reframes an uncomfortable question as an engineering input. He'll answer it.

I can still generate the Google Form and the spec document — the principal-dealer structure changes several sections, so tell me when you want them and I'll build them against this version.

5 days ago

Load later messages

## Claude responded: Short answer

Disambiguated maintenance obligations versus optional services, proposed clarifying language

Disambiguated maintenance obligations versus optional services, proposed clarifying language

### Short answer

**No — as written, you're not obligated.** But the wording is softer than it should be, and I'd tighten it before you sign.

### What the contract currently says

Clause 6.1: _"maintenance is **available** on a per-job basis."_

"Available" means offered, not promised. There's no clause saying you must accept work, no response-time guarantee, and no minimum commitment.

**But** a client who wanted to argue could say the price table in 6.2 looks like a standing offer he's entitled to take up. It's not airtight, and you shouldn't rely on "available" doing the work.

### The one thing you ARE obligated to do

**The 14-day warranty (clause 5).**

That's binding, and it should be. If you deliver something with a defect, you fix it. That's just doing the job properly — and it's only 14 days.

```
Warranty  = 14 days = obligation      ✅ keep it
Maintenance = after that = optional    ✅ your choice, every time
```

### The fix — three lines

I've added these to clause 6:

> **6.7** The Developer is under no obligation to accept any maintenance request, and may decline any request without giving a reason.
> 
> **6.8** The prices and delivery windows in clause 6.2 are valid for 12 months from final acceptance. After that they may be revised.
> 
> **6.9** The Developer may stop offering maintenance entirely on 30 days' written notice.

That gives you:

-   **Refuse any single job** — no reason needed, no notice
-   **Change the prices** after a year
-   **Exit completely** with 30 days' notice

The 30-day notice isn't for him. It's for you — it means you leave cleanly rather than just going quiet, which matters in a city this small.

### Why this is also better for him

He should know now that you might not always be around. Then he plans for it — trains his own people, keeps the runbook, doesn't build his business on one freelancer's availability.

A client who's surprised by that in month eight is a client who's angry. A client who knew from day one just hires someone.

You can say it plainly:

> "Maintenance is something I offer, not something I'm locked into. I'll usually say yes. But if I'm on another project or it's outside what I want to work on, I'll tell you straight away so you can find someone else. That's why I want to train your team properly at handover."

That's an honest position and it makes you look more professional, not less.

Want me to rebuild the contract PDF with 6.7–6.9 in it?

20 hours ago

## You said: Now let's dive into technical implementation, now help me understand the system design, flow of implementation because I only have 10 days so I wanna understa…

Now let's dive into technical implementation, now help me understand the system design, flow of implementation because I only have 10 days so I wanna understand how I can decide the big project into sections and sub sections, because I am terrified that I won't finish the mvp, will i(first answer this)

4 hours ago

## Claude responded: Will you finish?

Architected vertical-slice strategy with prioritized cut list for feasibility

Architected vertical-slice strategy with prioritized cut list for feasibility

### Will you finish?

**Yes — but only if you build it in the right order.**

Not because it's a small amount of work. Because the thing that kills 10-day builds isn't volume, it's **rework**. And rework in this project has exactly three sources, all of which are avoidable.

You have two advantages most people don't here:

-   The target is an **investor demo** (Q65), not a public launch. Demo-complete is the bar, not production-hardened.
-   You've built LangGraph pipelines and NestJS services before. Nothing in this stack is new to you.

**What you'll have on 13 August:** a complete, working platform that does everything in the spec, with real data flowing through a real ledger.

**What you won't have:** load testing, a security audit, edge cases at scale, perfect Amharic. Nobody expects those on demo day.

---

### The three things that would make you fail

#### 1\. Building screens before the ledger works

If the ledger design changes on Day 5, every screen touching money gets rewritten. This is the single biggest risk and it's entirely within your control.

**Rule: no UI beyond a button and a number until buy and sell work end to end.**

#### 2\. Floating point money

```
❌ price: number        →  0.1 + 0.2 = 0.30000000000000004
✅ price_cents: bigint  →  integers only
```

Store **ETB in cents** and **gold in milligrams**. Both bigint. Convert only at display time.

If you get this wrong, balances drift by fractions, nobody notices, and it surfaces during the demo when the totals don't match. Fix it on Day 1 or live with it forever.

#### 3\. Deploying on Day 8

Deployment always eats a day. Always.

**Deploy on Day 1**, when there's nothing in it. Then every day is a small push instead of one terrifying one.

---

### The system, as a build order

Don't think in layers (database → API → frontend). Think in a **spine**, then flesh on the bones.

#### The spine

```
price_tick  ──►  quote  ──►  order  ──►  ledger_entry  ──►  balance
    │              │           │              │
  every 30s    30s expiry   state       immutable,
              stored in     machine     never edited
                Redis
```

**Everything else in the product hangs off this line.** Portfolio reads balances. History reads ledger entries. Admin reads orders. The AI reads all three.

Get the spine right and the rest is CRUD and screens.

#### What depends on what

```
                    AUTH + USER
                         │
        ┌────────────────┼────────────────┐
        │                │                │
   PRICE FEED        LEDGER            KYC
        │                │                │
        └────► QUOTE ◄───┘                │
                 │                        │
              ORDER ◄─────────────────────┘   (tier limits)
                 │
     ┌───────────┼───────────┬─────────────┐
     │           │           │             │
  PORTFOLIO   HISTORY     CHAPA       COMPLIANCE
     │           │           │             │
     └──► 3D     └──►receipt └──►withdraw  └──► freeze
                                                 │
                              AI ◄────────────────┘
                          (reads everything, writes nothing)
                                  │
                             ADMIN CONSOLE
```

**Read it left to right.** Anything on the right can't start until what's on its left works.

---

### Sections and subsections

#### Section 1 — Foundation `Day 1`

Sub

What

1.1

Monorepo, Docker Compose, Postgres, Redis

1.2

Schema: `user`, `account`, `ledger_entry`, `price_tick`, `order`, `quote`

1.3

Auth — register, login, JWT, refresh

1.4

Price worker — gold + platinum every 30s, USD→ETB, store tick

1.5

**Deploy to production**

**Done when:** you log in on a real URL and see a live gold price in birr.

---

#### Section 2 — The money core `Day 2`

This is the most important day of the whole build. Take it slowly.

Sub

What

2.1

`LedgerService.postTransaction(entries[])` — rejects anything that doesn't sum to zero per asset

2.2

Balance read, with row locking

2.3

Quote engine — side, asset, grams → price, fee, total, expiry, quote\_id in Redis

2.4

Fee engine — config-driven, so his percentages drop in later

2.5

**Unit tests, ledger only**

**Write these tests yourself. Don't delegate this file to an agent.** It's the one place in the project where tests genuinely pay for themselves in 10 days.

**Done when:** you can post a transaction, read a balance, and an unbalanced transaction is rejected.

---

#### Section 3 — Buy and sell `Day 3`

Sub

What

3.1

Order state machine: `created → quoted → confirmed → settled / failed / expired`

3.2

Buy flow — reserve gate check, then post entries

3.3

Sell flow — float ceiling check, then post entries

3.4

Reserve gate: `vault grams ≥ sum(user grams)`, halts buying

3.5

Idempotency keys on both

3.6

Throwaway UI — two buttons and a number

**Done when:** you buy 5g, sell 2g, and the ledger balances every time.

**This is your first real milestone. If Day 3 ends here, you will finish.**

---

#### Section 4 — What the user sees `Day 4`

Sub

What

4.1

Portfolio — holdings, value, cost basis, profit/loss

4.2

Transaction history with pagination

4.3

Serial-numbered receipts

4.4

Price chart, 4 ranges

4.5

Real UI, Trust Wallet layout

---

#### Section 5 — Money in and out `Day 5`

**Your hardest day.** Two integrations plus file handling.

Sub

What

5.1

Chapa checkout init and redirect

5.2

Webhook receiver + signature verification

5.3

Deposit → ledger credit from `system:external`

5.4

Withdrawal request → approval queue

5.5

KYC document upload and storage

5.6

Tier assignment and limits

> **Start the Chapa sandbox account today.** Not Day 5. Sandbox credentials always take longer to arrive than you expect.

---

#### Section 6 — Admin console `Day 6`

Treat this as a second app sharing the same API.

Sub

What

6.1

Route group + role guard (admin / compliance / finance)

6.2

Users list, KYC approve/reject queue

6.3

Transaction search

6.4

Freeze and unfreeze

6.5

Payout approval

6.6

Treasury view — vault vs user grams, float, halt

6.7

Audit log viewer

---

#### Section 7 — Intelligence and control `Day 7`

Sub

What

7.1

Gemini chat endpoint

7.2

Read-only tools: `getMyPortfolio`, `getPrice`, `getHistory`

7.3

Guardrail prompt — explain, never advise

7.4

Compliance rules: velocity, ETB 500k threshold, structuring

7.5

Auto-freeze → `compliance_event` → AI explains it

7.6

3D visualisation, mass scaled to grams

**On the AI:** give it three read-only tools and nothing else. No write tool exists, so no prompt injection can make it move money. That's your architectural guarantee, not a prompt instruction.

---

#### Section 8 — Ship it `Day 8`

Sub

What

8.1

Amharic pass — extract keys, machine-translate, review by hand

8.2

Badges — computed on read, no cron needed

8.3

Email notifications

8.4

Landing page + terms acceptance

8.5

Realistic seed data

8.6

Empty, loading, and error states

8.7

**Write the demo script and rehearse it twice**

---

### Your cut list

When you're behind — and you will be at some point — drop from the top.

Drop first

Why it's safe

1\. SMS notifications

Email does the job

2\. Badges

Nobody asks about badges in an investor demo

3\. Platinum

Gold only. Schema already supports adding it

4\. Withdrawal approval chain

Single-step approve

5\. AML export

Show the flagged data on screen, skip the file

6\. 3D → animated 2D bar

Saves a full day. Still looks good

7\. KYC review queue

Store the document, auto-approve

8\. Compliance rules

Keep only the ETB 500k threshold

#### Never cut these

-   Ledger correctness
-   The reserve gate
-   Quote expiry
-   The audit log

Those four are what make it a financial platform instead of a nice mockup. They're also what he's showing to a bank.

---

### Working with Claude Code on this

Do yourself

Delegate

Ledger schema and `postTransaction`

CRUD endpoints

Order state machine

Admin console screens

The three AI tool definitions

UI components, forms, tables

Chapa webhook verification

Chart components, i18n extraction

Anything touching money math

Seed data, tests for non-money code

**The rule:** if a bug in it would make the numbers wrong, you write it.

---

### The honest risk

It isn't the code. It's **him**.

Between now and the 13th he will ask for the lending module, the government dashboard, and three more payment providers. Every one of those requests is a day, and there are no spare days.

Your answer, every time, unchanged:

> "Yes, I can add that. It's a separate quote and it moves the 13th. Which would you like?"

Say it warmly. Say it every time. That single sentence is worth more to your delivery date than any of the technical advice above.

---

Want me to write out the ledger schema and `postTransaction` in full next? That's the one piece worth getting exactly right before Day 1, and it's about an hour of your time to review versus a day of rework if it's wrong.
