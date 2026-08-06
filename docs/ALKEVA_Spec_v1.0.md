# ALKEVA — Product Specification

| | |
|---|---|
| **Version** | 1.0 |
| **Date** | 3 August 2026 |
| **Client** | Tekleweyni Berhe (sole owner) |
| **Day-to-day contact** | Goitom Hadush |
| **Author** | Dagmfre Seid |
| **Status** | Ready for signature, subject to section 3 |
| **Supersedes** | v0.2 of 2 August 2026 |
| **Based on** | Client Discovery Form, submitted 3 August 2026 |

> **How to read this document.** Every feature is tagged:
> **CONFIRMED** — agreed, will be built.
> **CONFIRMED, CONSTRAINED** — will be built, but not exactly as described. Reason given.
> **AWAITING ANSWER** — cannot be built until a question is answered.
> **OUT OF SCOPE** — not in this build.
>
> No feature is included on assumption. If it is not written here, it is not being built.

---

## 1. What this build is

**A working ALKEVA platform, ready to demonstrate to investors and partner banks on Thursday 13 August 2026.**

The client confirmed (Q65) that delivery day is a presentation to external investors who have committed ETB 100 million, and to partner banks, and that this presentation drives the decision to authorise full deployment and public launch.

So the target is clear:

```
13 Aug 2026  →  Investor + bank demo        ← this build
      ↓
   decision to authorise
      ↓
  Later date  →  Public launch              ← separate event, section 3
```

Everything is built for real: real ledger, real KYC, real price feed, real payment code. Public launch is a switch that gets flipped once section 3 is satisfied.

---

## 2. What changed from v0.2

| Area | v0.2 | v1.0 | Source |
|---|---|---|---|
| Product name | `[awaiting]` | **ALKEVA** | Q59 |
| Deadline | 10 working days | **13 August 2026 — 8 working days** | Q66 |
| Delivery day | Public launch | **Investor and bank demo** | Q65 |
| Payments | Chapa live | **Built live-ready, runs in sandbox** — no merchant account exists yet | Q26 |
| Revenue model | 3% buy/sell spread | **No spread. Commission and service fees** | Q28 |
| Minerals | Gold only | **Gold and platinum**, tier structure pending | Q19, Q32 |
| Physical delivery | Out of scope | **Request flow built. Fulfilment out of scope** | Q34, Q35 |
| Default language | Amharic + English | **Amharic default** | Q62 |
| Design reference | None | **Trust Wallet** | Q64 |
| AI provider | Addis AI | **Google Gemini** | Q45 |
| Badges | Five placeholder badges | **No wealth ranking.** Activity badges only | Q38 |
| Government dashboard | Not built | **Not built** — confirmed, no written request exists | Q48 |
| Fee | ~~ETB 98,500~~ | **ETB 80,000** | — |

---

## 3. Before the public can use ALKEVA

**The software will be complete on 13 August. Opening it to the public is a separate decision, and it is the client's decision and the client's responsibility.**

Based on the form answers, none of the following exist yet.

| # | Precondition | Client's answer | Status |
|---|---|---|---|
| P1 | Written legal opinion from an Ethiopian financial-services lawyer | No lawyer engaged (Q9) | **Not met** |
| P2 | Mineral supplier and trader licences | Only certificate of competence claimed; "none of the above" also selected (Q6). But Q80 lists NBE, Trade and Mines licences as shareable | **Contradiction — see 4.5** |
| P3 | Licensed arrangement for holding customer funds | Funds settle into ALKEVA's own account (Q27). No bank partner accepted (Q13) | **Not met** |
| P4 | Physical gold in a vault | No gold owned today (Q10). ETB 100m committed but not deployed (Q21) | **Not met** |
| P5 | Live, verified Chapa merchant account | In discussion, not signed (Q26) | **Not met** |
| P6 | Terms of service, privacy policy, risk disclosure | Not mentioned | **Not met** |
| P7 | Named compliance officer and AML process | Tekleweyni Berhe named (Q58) — same person as owner and freeze authority (Q56). No separation of duties | **Partially met** |
| P8 | Vault insurance | Still being determined (Q16) | **Not met** |

### 3.1 Where responsibility sits

The developer builds the software described in this document.

The client is solely responsible for obtaining every licence, permission, legal opinion and insurance policy listed above, and for deciding when to open the platform to the public.

If the client opens the platform to the public without these in place, the client accepts full responsibility for that decision and its consequences, including any regulatory, civil or criminal liability. The developer's responsibility is limited to the software behaving as described in this document.

Because the business is currently a sole proprietorship (Q3), the owner is personally liable for the business's obligations. This clause is written with that in mind.

---

## 4. Things in the answers that must be resolved

These are not criticisms. They are places where two answers point in opposite directions, and the software cannot be built until one wins.

### 4.1 The AI: advice or no advice?

| Answer | What it says |
|---|---|
| Q42 | Accepted: the AI will **not** give personalised buy or sell recommendations |
| Q24 | "the AI advises users to dynamically reallocate their assets… trigger protective actions to stop or shift investments" |
| Q79 | "offers personalised recommendations for investors" |

**Only Q42 can be built.** Personalised investment advice, and any automatic action taken on a user's holdings, is a licensed activity under the Ethiopian Capital Market Authority.

**What will be built:** the AI explains prices, history, fees, and the user's own position. It can send **price alerts** ("gold is down 5% today"). It cannot say what to do about it, and it cannot move anything.

**Decision needed at the meeting.**

### 4.2 The sell-back float

Q22 says user sell-backs are funded from other users' buy orders — "this accumulated inflow of Birr creates a natural liquidity pool… without the need for a separate, massive corporate cash reserve."

Two problems:

1. **Using new customers' money to pay old customers is the structure regulators look for first.** It works while money is coming in and fails the moment it stops.
2. Q36 promises **instant** sell-back settlement. Instant settlement with no dedicated reserve is the exact combination that produces a run.

**What will be built:** a treasury module that tracks the float separately, a published daily sell-back ceiling (Q37 = agreed), and an automatic halt when the float drops below a set level.

**Decision needed:** what dedicated birr reserve, separate from user inflows, will be held? A number is required.

### 4.3 Licences: which answer is correct?

Q6 selected "Certificate of competence (Ministry of Mines)" **and** "None of the above."
Q80 lists an NBE Licence, Ministry of Trade Licence and Ministry of Mines Licence as documents that can be shared.

**Action:** the client emails copies of every licence held. Nothing in section 3 can be marked met without them.

### 4.4 The business form problem

Q3 says **sole proprietorship**. Q73, Q74 and Q75 all refer to share capital, share issuance and shareholders.

**A sole proprietorship in Ethiopia has no shares.** There is no share capital to divide, no shareholder register, and nothing to issue. External investors cannot buy into one either.

Before the ETB 100 million can be received as investment, the business must become a PLC or a Share Company. This affects section 12.

### 4.5 Acceptance criteria that are not software

Q68 lists success criteria including legal compliance, final authorisation from authorities and banking partners, a growth roadmap, and marketing strategies.

None of these are things a developer can deliver or control. Acceptance in section 10 is limited to the software behaving as described here.

### 4.6 New scope discovered in the answers

| Item | Where | Decision |
|---|---|---|
| Lending against minerals, 70% of investment value | Q50 | **Out of scope.** This is a credit product and needs a separate licence |
| Dashboard for producers / miners | Q79 | **Out of scope** for this build |
| Dashboard for government officials | Q79 | **Not built** — Q48 confirms no written request exists |
| Sentiment analysis tool | Q68 | **Out of scope.** Not defined anywhere |
| Four payment providers | Q25 | **One provider** in this build. See C7 |
| Voice input and output | Q44 | **Out of scope** for this build |

All of these can be quoted separately.

---

## 5. Feature register

### 5.1 Confirmed — building these

| # | Feature | Source |
|---|---|---|
| F1 | Registration and login, account recovery | Q1 |
| F2 | Identity verification: Fayda, passport, driving licence, kebele ID | Q51 |
| F3 | Live gold and platinum prices from international market APIs, converted to ETB | Q19, Q20 |
| F4 | Price history chart: 24h, 7d, 30d, 1y | — |
| F5 | Deposit birr — Chapa integration, live-ready | Q25, Q26 |
| F6 | Buy minerals at spot price, platform is the counterparty | Q12, Q28 |
| F7 | Sell back to the platform | Q36 |
| F8 | Withdraw birr, with approval chain | Q27 |
| F9 | Commission and service fee engine | Q28, Q29 |
| F10 | Quoted price with expiry, confirmed against a quote ID | — |
| F11 | Portfolio view: grams held, ETB value, gain/loss | — |
| F12 | Full transaction history with serial-numbered receipts | — |
| F13 | **3D visualisation** — size and mass change in proportion to real-time weight, with a synced gram label | Q63 |
| F14 | Double-entry ledger, immutable, append-only | — |
| F15 | Reserve gate — buying halts when inventory cannot back it | — |
| F16 | Treasury module — float tracking, sell-back ceiling, automatic halt | Q22, Q37 |
| F17 | Holding tiers with limits | Q32 |
| F18 | Physical delivery **request** flow, for holdings above the threshold | Q34, Q35 |
| F19 | Device biometric unlock | — |
| F20 | Automatic account freeze on suspicious activity | Q55 |
| F21 | Human review above ETB 500,000 | Q57 |
| F22 | AML flagging and exportable report | — |
| F23 | AI assistant, Gemini, Amharic and English | Q45 |
| F24 | Price alerts, non-advisory | Q24, subject to 4.1 |
| F25 | Activity badges, no public wealth ranking | Q38 |
| F26 | Admin console for three roles: administrator, legal compliance, finance | Q47 |
| F27 | Audit log, append-only | — |
| F28 | Email and SMS notifications | — |
| F29 | Terms and privacy acceptance flow, client supplies text | — |
| F30 | Amharic-first interface, Trust Wallet visual reference | Q62, Q64 |
| F31 | ALKEVA branding — interconnected gold and silver marks | Q59, Q60 |

### 5.2 Confirmed, but constrained

| # | As described | What will be built | Why |
|---|---|---|---|
| C1 | AI gives personalised recommendations | AI explains and alerts. It does not recommend or act | Section 4.1 |
| C2 | Suspicious activity freezes the account | A rules engine freezes. The AI explains the freeze | An AI must not have authority over money or access. Its decisions cannot be audited |
| C3 | Face ID and fingerprint | Phone's own biometric unlock. Nothing stored on our servers | Stored biometrics are an irreversible liability |
| C4 | Government and producer dashboards | Not built. The permission system is ready for them | Q48 confirms no written request. Section 4.6 |
| C5 | Gold, platinum and other minerals | **Gold and platinum** at launch. Others fit without migration | Each mineral needs a source, a price feed and a purity standard |
| C6 | Physical delivery | The **request** flow is built: eligibility, form, tracking status. Warehouse, courier and handover are operations, not software | Q35 |
| C7 | Telebirr, CBE Birr, Chapa and bank transfer | **Chapa only** in this build. Chapa aggregates Telebirr and CBE Birr | Four separate integrations do not fit in eight days. The others are quoted separately |
| C8 | Instant sell-back | Instant, up to a published daily ceiling. Above it, next business day | Section 4.2 |
| C9 | Live payments on demo day | Chapa runs in **sandbox** on 13 August. Switching to live is a credentials change, roughly one hour | No merchant account exists yet (Q26) |
| C10 | Tiers priced in US dollars | Tiers stored in ETB with a USD reference | Ethiopian users transact in birr. USD-denominated balances create a foreign exchange problem |

### 5.3 Still awaiting an answer

| # | Question | Blocks | Needed by |
|---|---|---|---|
| A1 | What exact commission and service fee percentages? | F9 — the fee engine cannot be built without numbers | Day 3 |
| A2 | What dedicated birr reserve is held for sell-backs? | F16 — the halt threshold | Day 3 |
| A3 | Tier structure: is it holding limits, or mineral types, or both? Q32 mixes them | F17 | Day 3 |
| A4 | Does the AI advise, or explain only? | F23, F24 | **At the meeting** |
| A5 | Copies of all licences held | Section 3, P2 | Before public launch |
| A6 | Equity and revenue share terms | Signature | **At the meeting** |

### 5.4 Out of scope for this build

- Lending or borrowing against holdings
- Producer and government dashboards
- Sentiment analysis tool
- Voice input and output
- Telebirr, CBE Birr and bank transfer as separate integrations
- Physical delivery fulfilment, warehousing, courier
- Native iOS and Android apps
- User-to-user transfers (Q33 confirms not wanted)
- Multi-currency accounts
- Marketing site beyond one landing page
- Penetration testing, formal security audit, load testing
- Writing the terms, privacy policy or risk disclosure
- Licensing applications and regulatory filings

Anything here can be quoted separately.

---

## 6. Architecture

```
        ┌────────────────────────────────────────────┐
        │  ALKEVA mobile web  ·  Amharic first       │
        │  device biometrics only                    │
        └────────────────────┬───────────────────────┘
                             │
                    ┌────────▼────────┐
                    │   API Gateway    │  auth, rate limit, idempotency
                    └────────┬─────────┘
                             │
     ┌───────────────────────┼────────────────────────┐
     │                       │                        │
┌────▼─────┐        ┌────────▼────────┐      ┌────────▼────────┐
│ Identity │        │  TRADING CORE   │      │   COMPLIANCE    │
│  + KYC   │        │  deterministic  │      │  deterministic  │
│          │        │                 │      │                 │
│ Fayda    │        │ quote engine    │      │ rules engine    │
│ documents│        │ fee engine      │      │ ETB 500k review │
│ tiers    │        │ double-entry    │      │ freeze authority│
│ review   │        │   ledger        │      │ AML export      │
└──────────┘        └────────┬────────┘      └─────────────────┘
                             │
     ┌───────────┬───────────┼───────────┬──────────────┐
     │           │           │           │              │
┌────▼────┐ ┌────▼─────┐ ┌───▼────┐ ┌────▼─────┐  ┌─────▼──────┐
│  Price  │ │  CHAPA   │ │TREASURY│ │ Reserve  │  │ AI SIDECAR │
│  feed   │ │ sandbox  │ │ float  │ │  gate    │  │ Gemini     │
│ Au + Pt │ │ → live   │ │ ceiling│ │ + halt   │  │ READ ONLY  │
└─────────┘ └──────────┘ └────────┘ └──────────┘  └────────────┘
```

### Five rules the build will not break

1. **The AI never writes.** It reads. It cannot trade, approve, freeze, or reallocate.
2. **Balances are never edited.** Every change is a pair of immutable ledger entries.
3. **Quotes expire.** The user confirms against a quote ID, not a live price.
4. **No one person moves money alone.** Every privileged action needs a second approver. *Note: Q56 and Q58 name the same person for both. This must change before launch.*
5. **ALKEVA never sells a gram it does not have.** The reserve gate halts buying automatically. No admin override exists.

### Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, React, Tailwind, shadcn/ui |
| 3D | Three.js |
| Core API | NestJS (TypeScript) |
| Database | PostgreSQL |
| AI | FastAPI + LangGraph + Google Gemini |
| Cache / queue | Redis |
| Payments | Chapa |
| Price data | International metals market API |
| Hosting | Cloud, single region |

---

## 7. Data model

| Entity | Purpose |
|---|---|
| `user` | Identity, contact, KYC tier, status |
| `kyc_submission` | Documents, review state, reviewer |
| `ledger_entry` | Immutable. Every gram and every birr movement |
| `account` | A ledger address, per user per asset, plus system accounts |
| `quote` | Price, side, grams, fees, expiry, quote ID |
| `order` | State machine linking quote to ledger entries |
| `fee_schedule` | Commission and service fee rules by tier and asset |
| `payment` | Chapa reference, status, reconciliation state |
| `payout` | Withdrawal request, approval chain, settlement reference |
| `treasury` | Float balance, ceiling, halt state |
| `price_tick` | Historical price, source, timestamp |
| `asset` | Gold and platinum. Others fit without migration |
| `vault_holding` | Physical inventory, reconciled against user grams |
| `delivery_request` | Eligibility, status, tracking |
| `compliance_event` | Rule fired, evidence, action taken |
| `freeze` | Who, why, when, who can lift it |
| `audit_log` | Append-only, every privileged action |
| `badge` / `user_badge` | Activity-based only |
| `ai_conversation` | Chat history, token usage |

---

## 8. Roles

Three staff roles at launch, per Q47.

| Role | Can do | Must never do |
|---|---|---|
| **Administrator** | Configuration, user management, role assignment | Create grams or edit any balance |
| **Legal compliance** | KYC approval, freezes, AML reports | Approve reversal of their own freeze |
| **Finance** | Treasury, reconciliation, payout approval | Adjust a user's balance |
| Retail user | Deposit, buy, sell, withdraw, request delivery, chat | See another user's data |
| Auditor *(read-only, available)* | Read everything, immutably logged | Write anything |

**The rule that matters most:** no admin account can create value. Gram supply changes only through a settled order or a treasury operation with two signatures and a vault receipt. There is no "adjust balance" field.

**Separation of duties gap:** Q56 and Q58 name Tekleweyni Berhe as both the freeze authority and the compliance officer, and Q69 names him as sign-off. One person holding all three is a control failure that any bank partner or auditor will flag. Recommend splitting before launch.

---

## 9. Timeline — 8 working days

**Deadline: Thursday 13 August 2026** (Q66).

Day 0 is the day the signed agreement and all credentials are received.

```
Mon 3 Aug   ── contract, credentials, blocker answers
Tue 4 – Wed 5   ── M1  Foundation
Thu 6 – Fri 7   ── M2  Trading core          ← Payment 1
Mon 10 – Tue 11 ── M3  Experience, KYC, AI   ← Payment 2
Wed 12 – Thu 13 ── M4  Money, admin, demo    ← Payment 3
```

### What was cut to fit 8 days instead of 10

Three payment integrations, voice, producer and government dashboards, sentiment analysis, delivery fulfilment, and native apps. All listed in 5.4 and quotable separately.

### Milestone 1 — Foundation (Tue 4 – Wed 5 Aug)

- Repository, environments, CI, deployment
- Full database schema
- Registration, login, sessions, recovery
- Live gold and platinum prices, ETB conversion, history stored
- ALKEVA design system, Amharic-first, Trust Wallet reference

**Done when:** a user can register, log in, and see live gold and platinum prices in birr.

### Milestone 2 — Trading core (Thu 6 – Fri 7 Aug)

- Double-entry ledger, serializable writes
- Quote engine with expiry
- Fee engine (needs A1 by Day 3)
- Buy and sell flows end to end
- Reserve gate and treasury float halt
- Holding tiers and limits

**Done when:** a user can buy and sell. Every movement is in an immutable ledger. Balances always reconcile. Buying stops when reserves run out.

> **Payment 1: ETB 28,000**

### Milestone 3 — Experience and identity (Mon 10 – Tue 11 Aug)

- Portfolio screen with grams, ETB value, gain/loss
- 3D visualisation, mass proportional to real weight, synced gram label
- Price history chart
- Transaction history with serial-numbered receipts
- Trust panel: reserve ratio, spread and fees shown before every confirm
- KYC: document upload, review queue, tier assignment
- AI assistant in Amharic and English
- Price alerts
- Delivery request flow

**Done when:** ALKEVA looks and works like a finished product, and identity verification runs end to end.

> **Payment 2: ETB 28,000**

### Milestone 4 — Money, control and demo (Wed 12 – Thu 13 Aug)

- Chapa integration, live-ready, running in sandbox
- Withdrawal flow with approval chain
- Compliance rules, ETB 500,000 review, AML export
- Automatic freeze with AI explanation
- Activity badges
- Admin console for the three roles
- Notifications, terms acceptance, landing page
- Production deployment, monitoring, backups
- Seed data and a written demo script
- Live walkthrough

**Done when:** delivered, deployed, and ready to present to investors and banks on 13 August.

> **Payment 3: ETB 24,000**

### What "8 days" means

The clock pauses if:
- A blocking answer from 5.3 is late by more than 24 hours
- Credentials or accounts are not provided when needed
- A milestone payment is more than 3 working days late
- A change is requested outside this specification

Each pause moves the 13 August date by the same amount. Given the fixed investor date, **every hour of delay matters.**

---

## 10. Price and payment

**Fixed fee: <del>ETB 98,500</del> &nbsp;&nbsp;ETB 80,000**

**No payment is required to begin.** Work starts on signature. The first payment falls due only after the client has seen a working trading core.

| Stage | Share | Amount | When |
|---|---|---|---|
| On signing | 0% | ETB 0 | Nothing due |
| Milestone 2 accepted | 35% | ETB 28,000 | Fri 7 Aug |
| Milestone 3 accepted | 35% | ETB 28,000 | Tue 11 Aug |
| Milestone 4 accepted | 30% | ETB 24,000 | Within 3 working days of 13 Aug |
| **Total** | **100%** | **ETB 80,000** | |

**Included:** everything in 5.1, 5.2, 6, 7, 8, delivered across the four milestones.

**Not included:** third-party costs, paid directly by the client — hosting, price data API and its commercial licence, Gemini API usage above the free tier, domain, SMS credits, Chapa transaction fees, KYC vendor fees. Q45 budgets USD 100 per month for price feeds; expect ETB 6,000–15,000 per month once live.

**Acceptance:** each milestone is accepted when the "Done when" outcome works in the deployed environment. Acceptance is confirmed in writing within 24 hours. If nothing is received within 48 hours, the milestone is treated as accepted and the payment falls due. **Acceptance covers the software only** — see 4.5.

**Payment terms:** due within 3 working days of acceptance. Work pauses if a payment is more than 3 working days late.

**Warranty:** 14 calendar days after final acceptance. Defects against this document are fixed free. New features, changed requirements and third-party outages are not defects.

**Intellectual property:** all source code, designs and documentation remain the property of Dagmfre Seid until the final payment clears **and** the terms in section 12 are signed and, where applicable, registered. On those events ownership transfers in full. Until then the client holds a non-transferable licence to operate the software.

---

## 11. Maintenance

Available after the 14-day warranty. Confirmed wanted (Q78).

**There is no monthly fee and no retainer.** The client pays only when a job is requested and delivered. In a month with no requests, nothing is owed.

### 11.1 The two levels

Both levels cover the **existing platform only** — everything described in sections 5.1 and 5.2.

| Level | Delivered within | Price |
|---|---|---|
| **Easy** | 6 business days | **ETB 6,000** |
| **Medium** | 10 business days (2 weeks) | **ETB 13,500** |

### 11.2 What falls into each level

**Easy — ETB 6,000**

- Bug in an existing screen or flow
- Text, label or Amharic translation correction
- Configuration change: limits, tiers, thresholds, fee percentages
- Adding or removing a field on an existing form
- Report or export formatting fix
- Layout or visual correction
- A round of dependency and security patches
- Restoring the platform from a backup

**Medium — ETB 13,500**

- Any bug touching the ledger, balances, or money
- Repairing a third-party integration after the provider changes something — Chapa, the price feed, Gemini
- Performance or load problem
- Reworking how an existing flow behaves end to end
- Correcting data across many records, with a full audit trail
- Fixing a security vulnerability found in the delivered code

**Neither — a separate quote**

Anything not already in the platform. New features, new payment providers, new minerals, the lending module, producer or government dashboards, native apps, voice, or a design overhaul. Everything listed in section 5.4.

### 11.3 How it works

1. The client describes the problem in writing.
2. The developer confirms the level and the delivery date, in writing, within 2 business days.
3. Work starts once the level is agreed and access is provided.
4. The job is delivered inside the window.
5. The invoice is issued on delivery and paid within 3 working days.

**Fixed price, not hourly.** If a job takes two days instead of six, the price is the same. If it takes longer than expected, the price is still the same. The client always knows the cost before work starts.

**If the level is disputed:** it is Easy, unless the work touches the ledger, payments, or security, in which case it is Medium.

**The clock starts** when the level is agreed *and* access has been provided. Delays in either move the delivery date by the same amount.

**Urgent work** — a platform outage or anything blocking money movement — is not covered by these windows. It is quoted at the time.

### 11.4 Security patches

Because there is no retainer, **the client is responsible for asking for them.**

Recommended: one Easy-level patch job every three months. Four per year, ETB 24,000 total.

If patches are not requested, the developer is not responsible for problems arising from software left un-updated.

### 11.5 When maintenance pauses

No maintenance work is carried out while ALKEVA is open to the public without the licences and legal opinion in section 3. Work resumes once those are in place. Nothing is charged during a pause.

---

## 12. Equity and revenue share

**AWAITING (A6). To be settled at the meeting of 3 August 2026.**

The form answers did not address this. Q73, Q74 and Q75 describe what is offered to external investors, not what is offered to the developer. Q76 declined shared legal costs.

Two facts shape what is possible:

1. **The business is a sole proprietorship (Q3).** It has no shares. Nothing can be issued today.
2. **It must become a PLC or Share Company** before the ETB 100 million can be received as investment. Investors cannot buy into a sole proprietorship.

So the agreement has two parts.

### Part A — Revenue share, effective immediately

A percentage of ALKEVA's net platform revenue, paid monthly, starting from the first month the platform earns revenue, for a defined term. This works today, without a company, and does not depend on incorporation.

### Part B — Equity, on incorporation

A written, signed commitment that on conversion to a PLC or Share Company, a defined percentage of **fully diluted** share capital is issued to the developer, before or alongside the external investment round.

The commitment must specify:

1. The exact percentage of fully diluted capital
2. The deadline for incorporation and registration
3. What happens if incorporation never occurs
4. Pre-emptive rights, so later investment does not dilute the holding away
5. Tag-along rights, so a sale includes this holding at the same price
6. Information rights — monthly revenue statements, needed to calculate Part A anyway

Because the business is a sole proprietorship, the owner is personally bound by this agreement. It should be notarised and registered at the Documents Authentication and Registration Service.

The fee in section 10 stands independently. Equity and revenue share are upside. They are not payment.

---

## 13. Assumptions

1. The client obtains every licence, opinion and insurance in section 3 before public launch.
2. The client supplies terms of service, privacy policy and risk disclosure text.
3. Chapa runs in sandbox on demo day. Live credentials are a later switch.
4. Gold and platinum only. Other minerals are a later phase.
5. Mobile web. Native apps are a separate quote.
6. Goitom Hadush answers blocking questions within 24 hours.
7. All credentials are provided on Day 0.
8. No lending, producer or government module is required in this build.
9. Delivery fulfilment is an operations task, not a software one.
10. Acceptance is judged on the software only.

---

## 14. Change control

1. The change is described in writing.
2. It is priced in hours and in calendar impact.
3. It is approved in writing before work starts.
4. This document moves to the next version.

With a fixed investor date of 13 August, this is the mechanism that protects the date. Every change either moves the date or removes something else.

---

## 15. Risk register

| Risk | Impact | Handling |
|---|---|---|
| Section 3 preconditions unmet at public launch | Regulatory exposure for the client, personally | Section 3.1 |
| Sell-backs funded from new user deposits | Failure the moment inflows stop | Section 4.2, treasury module, published ceiling |
| No Chapa merchant account by 13 Aug | Live money cannot be shown | Sandbox demo, C9. One-hour switch later |
| Fee percentages not supplied by Day 3 | Fee engine slips | A1 |
| One person holds all control roles | Any bank or auditor will flag it | Section 8 |
| AI scope reopened to give advice | Licensed activity, unlicensed | Section 4.1, decided at the meeting |
| Users buy more than the vault holds | Business short a rising asset with no hedge | Reserve gate, F15, no override |
| Scope grows before 13 Aug | Date missed, investors not shown | Section 14 |
| Business never becomes a PLC | Equity impossible | Section 12, Part A works regardless |

---

## 16. Sign-off

By signing, both parties agree that this document defines the work, that anything not written here is not included, and that section 3.1 has been read and understood.

**Client**

Name: ______________________  Role: ______________________

Signature: ______________________  Date: ______________

**Developer**

Name: Dagmfre Seid

Signature: ______________________  Date: ______________

---

*Version 1.0, 3 August 2026. Sections 4.1, 5.3 and 12 must be resolved at the meeting before this document is signed.*