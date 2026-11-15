# BorderBridge

**Know what your consignment needs, and what it will cost, before you travel.**

> **Try it: [border-bridge-sigma.vercel.app](https://border-bridge-sigma.vercel.app)** — no installation needed. Plan a
> consignment without an account, or register to track shipments.

A cross-border trade planning tool for small-scale traders on the Rwanda–Uganda
corridor. A trader states what they are moving; BorderBridge works out which documents
that specific consignment needs, what it should cost, which border crossing to use, and
why — citing the rule behind every answer.

Built for the ALU BSc Software Engineering summative, implementing the requirements in
*BorderBridge — Project Proposal and Software Requirements Specification*.

- **Live application:** <https://border-bridge-sigma.vercel.app>
- **SRS document:** _add your Google Drive link here_

---

## Table of contents

1. [What it does](#what-it-does)
2. [Prerequisites](#prerequisites)
3. [Set it up — every step](#set-it-up--every-step)
4. [Running it](#running-it)
5. [Try it — a walkthrough](#try-it--a-walkthrough)
6. [Deploying it publicly](#deploying-it-publicly)
7. [How it is built](#how-it-is-built)
8. [Requirements traceability](#requirements-traceability)
9. [Testing](#testing)
10. [Known limitations](#known-limitations)
11. [Troubleshooting](#troubleshooting)

---

## What it does

| | |
|---|---|
| **Accounts** | Register with a phone number, confirm it by one-time code, sign in, recover a forgotten password, keep a reusable profile |
| **Trade planning** | State a consignment; get a document checklist, a Simplified Trade Regime ruling, and an itemised cost estimate — each line citing the instrument it came from |
| **Border crossings** | A recommended crossing, ranked on official status, community-reported waiting time and road distance, which states which criterion decided it |
| **Community reports** | Report the queue at a crossing; reports lose weight as they age and are discarded after twelve hours |
| **Shipments** | Turn a plan into a trackable shipment whose plan is frozen, tick off documents as you obtain them, and record milestones to delivery |
| **Transport** | Providers publish routes, capacity, permits and rates; traders see those who fit their consignment, ranked by verification, rating and price, and send a request the provider accepts or declines |
| **Marketplace** | Publish what you want to buy or sell; see buyers in the destination market for the consignment you are planning; enquire without either party disclosing a phone number until the owner accepts |
| **Notifications** | Follow corridors, crossings and product categories; be told when the rules on that route change, or when another trader reports a long delay |
| **Administration** | Create, amend and retire rules as versioned overlays with an explicit publication step and an audit log; verify provider accounts; see which rules are overdue for re-verification |
| **Reporting** | Operational metrics, and how close the cost estimates have been against what traders recorded they actually paid |
| **Export** | Print the checklist, save it as a PDF, or copy a plain-text version laid out to survive being pasted into a message |
| **Languages** | English, French, Kiswahili and Kinyarwanda, with the choice kept across sessions and measured coverage per language |

The thing that makes it more than a reference site: it computes against **your**
consignment. Published trade information exists in plenty of places. What does not
exist is something that takes "200 kg of green coffee, Kigali to Kampala, worth USD
1,200" and answers *you qualify for the Simplified Trade Regime, here are your five
documents, it should cost USD 227, use Kagitumba* — and shows its working.

---

## Prerequisites

| Requirement | Version | Check with | Where to get it |
|---|---|---|---|
| Node.js | 18.18 or newer | `node --version` | <https://nodejs.org> — take the LTS build |
| npm | 9 or newer | `npm --version` | Comes with Node.js |
| Git | any recent | `git --version` | <https://git-scm.com> |
| A Postgres database | — | — | Free from [Neon](https://neon.tech) or [Supabase](https://supabase.com) — step 3 below |

No other software is needed. Nothing compiles from source, so installation does not
need Xcode command line tools, Visual Studio build tools or a C compiler.

---

## Set it up — every step

### 1. Get the code

```bash
git clone https://github.com/Hassanah-dev006/BorderBridge.git
cd BorderBridge
```

### 2. Install the dependencies

```bash
npm install
```

Takes about thirty seconds. You will see a `node_modules` folder appear.

### 3. Create a database

The app needs a Postgres database. Either provider below has a free tier that is
ample. **Neon** is the quicker of the two:

<details open>
<summary><strong>Using Neon</strong></summary>

1. Go to <https://neon.tech> and sign up — GitHub sign-in is fastest.
2. Click **Create project**. Name it `borderbridge`. Accept the default region.
3. When the project opens, find the **Connection string** panel.
4. Choose **Pooled connection** from the dropdown.
5. Click the copy icon. You now have a string that looks like:
   `postgresql://user:password@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`

</details>

<details>
<summary><strong>Using Supabase instead</strong></summary>

1. Go to <https://supabase.com> and sign up.
2. **New project**. Name it `borderbridge`, set a database password, pick a region.
3. Wait for provisioning — a couple of minutes.
4. Go to **Project Settings → Database → Connection string → URI**.
5. Select the **Transaction pooler** entry — the one on **port 6543**, not 5432.
6. Copy it and replace `[YOUR-PASSWORD]` with the password you set in step 2.

</details>

### 4. Create your environment file

```bash
cp .env.example .env.local
```

Open `.env.local` in a text editor. Fill in both values:

```
DATABASE_URL=postgresql://...the string you copied in step 3...
SESSION_SECRET=...a long random string...
```

Generate the session secret by running this and pasting the output:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`.env.local` is listed in `.gitignore`, so your credentials never reach GitHub.

### 5. Create the tables

```bash
npm run db:migrate
```

You should see:

```
Applying db/schema.sql ...

Done. 8 tables present:
  border_reports
  checklist_progress
  login_attempts
  otp_codes
  sessions
  shipment_milestones
  shipments
  users
```

Safe to re-run at any time — every statement is guarded with `IF NOT EXISTS`.

### 6. Check everything works

```bash
npm test
```

Expect **238 tests passing, 0 failing**. These need no database: the schema tests run
Postgres in-process through PGlite.

---

## Running it

```bash
npm run dev
```

Open <http://localhost:3000>.

To run the production build locally instead:

```bash
npm run build
npm start
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload, on port 3000 |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm test` | Run the test suite |
| `npm run db:migrate` | Create or update the database tables |
| `npm run lint` | ESLint, as NFR-MNT-02 requires |
| `npm run check` | Lint, typecheck and tests — everything a change must pass |

---

## Try it — a walkthrough

A five-minute path through every major feature. Follow it on the live site at
<https://border-bridge-sigma.vercel.app>, or locally after the setup above — both behave identically:

1. **Plan a trade without an account.** On the home page choose *Rwanda → Uganda*,
   *Coffee, green (unroasted)*, **200** kg, **1400** USD. Submit.
   - You qualify for the Simplified Trade Regime, and the page explains both
     conditions that were tested.
   - Five documents, each with its issuing authority, lead time and legal basis.
   - An itemised cost estimate; the transport line is flagged *unverified* because
     that rule is past its review date.
   - A recommended crossing, and the sentence explaining which criterion decided it.
2. **Register.** Click *Create an account*. Use any phone number, for example
   `0788123456`. The one-time code appears on screen — this prototype has no SMS
   gateway, which the page says plainly. Enter it.
3. **Fill in your profile.** Set your usual route to *Rwanda → Uganda*. Go back to the
   home page: it is now pre-selected, and greets you by name.
4. **Create a shipment.** Plan the same consignment again and press *Create shipment
   from this plan*. The plan is now frozen.
5. **Work the checklist.** Press *I have it* on each document. Watch the progress bar,
   and the "Next:" line naming the single blocking document. When the last mandatory
   one is ticked, the shipment advances to *Documents ready* by itself.
6. **Move it along.** Mark it *in transit*, then *at the border*, then *cleared*, then
   *delivered*. Note that the steps only ever appear in order.
7. **Report the queue.** Go to *Border reports*, submit a report for Gatuna with a long
   wait. Plan the same trade again — the recommendation changes, and the page cites
   your report.
8. **Arrange transport.** Register a second account as a *transport provider*, publish
   an offering on Rwanda → Uganda, then sign back in as the trader, open the shipment
   and choose *Find transport*. The provider appears with a quote computed from their
   published rate. Send a request; as the provider, accept it. Contact details are
   exchanged only at that point.
9. **Rate them.** Mark the shipment delivered, then rate the provider. The rating
   feeds straight back into the ranking for the next trader.
10. **Sign out and back in.** Then deliberately get the password wrong three times to
    see the progressive delay, and five times to see the lockout.

### Seeing the administrator view

There is no self-service route to the admin role, by design — FR-ACC-06 has
administrators verifying other people's accounts, so it cannot be a role anyone awards
themselves. Register normally, then promote that account from your terminal:

```bash
npm run db:admin -- 0788123456
```

Use the number you registered with. It prints the account it changed, or lists the
registered numbers if it cannot find yours. Sign out and back in, and an **Admin** tab
appears.

The same script changes any role, which is useful for testing:

```bash
npm run db:admin -- 0788123456 provider   # make an account a transport provider
npm run db:admin -- 0788123456 trader     # put it back
```

It runs against whatever `DATABASE_URL` points at, so from your own machine it will
promote the account on the deployed site.

---

## Deploying it publicly

[Vercel](https://vercel.com) builds Next.js and has a free tier.

1. Push your code to GitHub, and make sure the repository is **public**.
2. Go to <https://vercel.com> and sign in with GitHub.
3. **Add New… → Project**. Find `BorderBridge` and click **Import**.
4. Before clicking Deploy, open **Environment Variables** and add both:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the same connection string from step 3 above |
   | `SESSION_SECRET` | the same random string, or a fresh one |

   Leave every other setting alone — Vercel detects Next.js by itself.
5. Click **Deploy** and wait a couple of minutes.
6. You will be given a URL. For this project it is <https://border-bridge-sigma.vercel.app>. That is the
   public address.

If you created the database *after* deploying, run `npm run db:migrate` locally — it
points at the same database, so the tables appear for the deployed site too.

### Deploying on Render instead

Render also runs this project — `render.yaml` in the repository supplies the build and
start commands. Sign in at <https://render.com>, choose **New → Blueprint**, point it
at your repository, and paste your `DATABASE_URL` when prompted.

**Read this before choosing Render's free plan for a graded submission.** Two free-tier
behaviours work against you:

1. **Free web services sleep after 15 minutes without traffic.** The next request has
   to wake the instance, and Render's own dashboard warns this can delay it by 50
   seconds or more. A marker clicking your link may well see a blank tab and assume the
   site is down.
2. **A free Render Postgres database expires 30 days after it is created.** After that
   there is a 14-day grace period to upgrade, and then Render deletes the database and
   its data. If you deploy now and are marked five weeks later, the site is live but
   every account and shipment is gone.

Neither applies to Vercel plus Neon, which is why the main instructions use those:
Vercel's free tier does not sleep, and Neon's free database does not expire. If you
prefer Render for the application itself, still put the database on Neon and paste that
connection string into Render — that removes the second problem entirely.

If you do deploy the database on Render, note that free Render Postgres has no backups
and no managed connection pooling.

**Before submitting, open your URL in a private browsing window** and walk through the
registration and planning flow once. A private window proves the site works for someone
who is not you and has no cookies.

---

## How it is built

```
BorderBridge/
├── data/                  Regulatory knowledge base — JSON, not code
│   ├── rules.json           Documents, duties, taxes, fees, thresholds
│   ├── catalogue.json       Corridors, products with HS codes, exchange rates
│   └── crossings.json       Border crossings and seed condition reports
├── db/schema.sql          Tables for user-generated state
├── render.yaml            Render deployment configuration (optional)
├── scripts/migrate.mjs    Applies the schema
├── src/lib/               Logic, no framework, no I/O where avoidable
│   ├── types.ts             Every interface in the system
│   ├── repository.ts        Reads the knowledge base
│   ├── store.ts             Reads and writes user state
│   ├── db.ts                Database connection
│   ├── auth.ts              Hashing, codes, session signing, throttling
│   ├── session.ts           Session cookie handling
│   ├── engines.ts           Requirements and cost engines
│   ├── border.ts            Crossing ranking and report decay
│   ├── transport.ts         Provider matching and ranking
│   ├── market.ts            Marketplace matching and the public-name rule
│   ├── notify.ts            Subscription matching and rule fingerprinting
│   ├── rulewatch.ts         Detects rule changes and notifies subscribers
│   ├── rules-admin.ts       Rule validation, versioning and overlay merging
│   ├── reporting.ts         Operational metrics and estimate accuracy
│   ├── i18n.ts              The dictionary, translation and coverage
│   ├── language.ts          Resolving the language for a request
│   ├── export.ts            The plain-text checklist (FR-REQ-05)
│   └── shipments.ts         Readiness and milestone rules
├── src/app/               Pages, server-rendered
└── tests/                 87 tests
```

### Two decisions worth explaining

**The regulatory knowledge base is data, not code.** Every rule in `data/rules.json`
carries its governing instrument, its last-verified date and a verification status. A
trained non-developer can amend a duty rate without touching TypeScript, which is SRS
constraint C1 and NFR-MNT-03. It also lets the app be honest: a rule past its review
interval causes every figure derived from it to be marked *pending re-verification*
rather than presented as current.

**The logic has no I/O.** `engines.ts`, `border.ts`, `shipments.ts` and `auth.ts` are
pure functions. Pages fetch data and pass it in. That is why the test suite runs in
three seconds with no database and no mocking framework.

---

## Requirements traceability

Which SRS requirement each part of the code realises:

| Requirement | Where |
|---|---|
| FR-ACC-01 register by phone | `store.ts registerUser`, `/register` |
| FR-ACC-02 confirm by one-time code | `auth.ts` OTP functions, `store.ts issueOtp/consumeOtp`, `/verify` |
| FR-ACC-03 authenticate, rate limit, progressive delay | `auth.ts throttle`, `store.ts authenticate`, `/login` |
| FR-ACC-04 recover access | `store.ts resetPassword`, `/recover` |
| FR-ACC-05 reusable profile | `store.ts updateProfile`, `/profile` |
| FR-ACC-06 administrator verifies an account | `store.ts setAdminVerified`, `/admin` |
| FR-REQ-01 state a trade intention | `/` |
| FR-REQ-02 generate the checklist | `engines.ts generateChecklist` |
| FR-REQ-03 simplified-regime ruling | `engines.ts determineEligibility` |
| FR-REQ-05 export the checklist, printable and as text | `export.ts plainTextChecklist`, `/plan/print` |
| FR-CST-01 itemised landed cost | `engines.ts estimateCost` |
| FR-CST-02 currency conversion | `engines.ts toUsd / fromUsd` |
| FR-CST-03 per-line rule attribution | `engines.ts estimateCost`, `/plan` |
| FR-CST-04 limitation statement | `/plan` |
| FR-BRD-01 rank the crossings | `border.ts rankCrossings` |
| FR-BRD-03 report conditions | `store.ts submitReport`, `/report` |
| FR-BRD-05 decay stale reports | `border.ts reportWeight` |
| FR-SHP-01 shipment with frozen plan | `store.ts createShipment` |
| FR-SHP-02 milestones | `shipments.ts`, `/shipments/[id]` |
| FR-TRN-01 provider publishes their offering | `store.ts upsertOffering`, `/provider` |
| FR-TRN-02 match and rank providers for a shipment | `transport.ts matchProviders`, `/shipments/[id]/transport` |
| FR-MKT-01 publish a buy or sell listing | `store.ts upsertListing`, `/market` |
| FR-MKT-02 surface relevant counterparties | `market.ts matchListings`, `/plan` and `/market` |
| FR-MKT-03 enquire without disclosing contact details | `store.ts sendEnquiry`, `/market/enquiries` |
| FR-NOT-01 subscribe to corridors, crossings and goods | `store.ts addSubscription`, `/notifications` |
| FR-NOT-02 notify when the rules change | `rulewatch.ts syncRuleChanges`, `notify.ts diffSnapshots` |
| FR-ADM-01 create, amend and retire rules as versions | `rules-admin.ts`, `store.ts createOverlay`, `/admin/rules` |
| FR-ADM-02 explicit publication step, audit logged | `store.ts publishOverlay`, `store.ts writeAudit`, `/admin/rules` |
| FR-ADM-03 reject a rule with no instrument or date | `rules-admin.ts validateRule` |
| FR-ADM-04 flag rules due for review | `repository.ts isOverdue`, `/admin` |
| FR-RPT-01 operational metrics | `store.ts operationalMetrics`, `/admin/reports` |
| FR-RPT-02 estimate accuracy against outcomes | `reporting.ts accuracyReport`, `/admin/reports` |
| FR-LOC-01 four languages, persisted across sessions | `i18n.ts`, `language.ts`, `/language` |
| NFR-ACC-01 citation at point of use | every checklist item and cost line |
| NFR-ACC-02 mark unverified output | `/plan` amber banner |
| NFR-USA-04 WCAG AA contrast, 44 px touch targets | `tailwind.config.ts` (ratios recorded), `ui.tsx` |
| NFR-SEC-02 memory-hard password hashing | `auth.ts hashPassword` (scrypt) |
| NFR-SEC-05 rate limit with progressive lockout | `auth.ts throttle` |
| NFR-SEC-07 administrative actions audited | `store.ts writeAudit`, rule changes and account verification |
| NFR-SEC-08 sessions expire after 30 days of inactivity | `store.ts getSessionUser` slides the window |
| NFR-PRI-03 export your data, request deletion | `store.ts exportPersonalData`, `/privacy`, `/privacy/export` |
| NFR-PRI-04 contact details not disclosed without consent | enforced in the queries, not in the pages |
| NFR-LEG-01 terms of use and privacy notice | `/privacy` |
| NFR-LEG-02 not a licensed customs agent | `/privacy`, and the footer of every page |
| NFR-LEG-04 channel to report inaccurate content | `/report-content`, queue on `/admin` |
| NFR-MNT-02 linting enforced | `.eslintrc.json`, `npm run check` |
| NFR-SCA-04 a new language needs only translations | `i18n.ts` — demonstrated by FR-LOC-01 |
| NFR-PER-03 works on a slow connection | server-rendered; forms work without JavaScript |
| NFR-PER-04 payload under 500 KB compressed | 96.2 kB of JavaScript and 3.8 kB of CSS on first load |
| NFR-MNT-01 ≥ 80% coverage of domain logic | `engines.ts` 98.9%, `border.ts` 98.1%, `transport.ts` 99.4%, `market`/`reporting`/`shipments`/`export`/`offline` 100% |
| NFR-CMP-03 installable, no app store | `src/app/manifest.ts`, `public/sw.js`, `public/icon-*.png` |
| NFR-REL-02 cached content readable offline | `public/sw.js` network-first with a cache fallback; `offline.ts` sets the policy |
| Constraint C4 offline-first, not offline-tolerant | the three rows above, plus the age banner in `offline-status.tsx` |
| NFR-REL-04 external source failure degrades, not fails | `rates.ts` — timeout, validation, curated fallback, age shown; fault-injected in tests |
| NFR-ACC-03 exchange rate age surfaced | `rates.ts rateNotice`, shown on `/plan` |
| NFR-USA-03 reading level | `readability.ts`, enforced over the dictionary and the screens in `tests/readability.test.ts` |
| NFR-USA-04 WCAG 2.2 AA contrast and 44 px targets | `contrast.ts`, every pair asserted in `tests/contrast.test.ts` |
| NFR-CMP-01 browser targets | `.browserslistrc` (Chromium 61 floor), verified against the build by `npm run verify:targets` |
| NFR-CMP-02 operable from 320 px to 1920 px | `tests/compatibility.test.ts` — tables scroll rather than clip, no fixed width over 288 px |
| NFR-LEG-01 terms accepted, with version and timestamp | `legal.ts`, `terms_acceptances` table, consent at registration, re-consent banner on a version change |
| NFR-MNT-05 structured logs, no personal data | `log.ts` — every field redacted, users referred to by a keyed pseudonym |
| NFR-PRI-05 anonymised research export | `research.ts`, `/admin/research` — primary and complementary suppression, release refused if the risk check fails |
| NFR-PER-01/02/06, NFR-SCA-03 | `npm run bench` — measured at 50,000 users and 10,000 shipments |
| NFR-REL-03 offline writes queued and replayed once | `idempotency.ts`, `idempotency_keys` table, the outbox in `public/sw.js` |
| NFR-USA-07 USSD/SMS fallback | `ussd.ts`, `/api/ussd` — GSM 03.38 safe, 182-septet budget, no session storage |
| NFR-MNT-04 OpenAPI kept current | `openapi.yaml`, with `tests/openapi.test.ts` comparing it against the route handlers |
| NFR-REL-01/05/06 availability, recovery, backups | `scripts/verify-restore.mjs` and `BorderBridge-docs/OPERATIONS-RUNBOOK.md` |
| NFR-USA-01/02, NFR-ACC-06 | `BorderBridge-docs/FIELD-PROTOCOLS.md` — these need participants, not code |

**Every functional requirement in the SRS is now implemented.** One of them,
FR-LOC-01, is complete in its machinery and incomplete in its content — see
*Known limitations* below.

---

## Testing

```bash
npm test
```

459 tests across twenty-five files:

| File | Covers |
|---|---|
| `tests/engines.test.ts` | Eligibility at and across the USD 2,000 threshold, checklist assembly, duty and tax computation, currency conversion |
| `tests/border.test.ts` | Report weight at 0, 6 and 12 hours, expiry at the boundary, ranking order, tie-breaks, product-class exclusion |
| `tests/auth.test.ts` | Password hashing and salting, phone normalisation, one-time codes, session signing and tamper rejection, progressive delay |
| `tests/shipments.test.ts` | Readiness, the blocking document, forward-only milestones |
| `tests/transport.test.ts` | Quoting and minimum charges, capacity fit, exclusion by route and product class, and the verification → rating → price ranking |
| `tests/market.test.ts` | Listing lifetime, the public-name rule, matching buyers in the destination market, and that the listing type cannot carry a phone number |
| `tests/notify.test.ts` | Subscription matching, rule fingerprinting, and that editing explanatory text notifies nobody |
| `tests/rules-admin.test.ts` | That a rule with no citation is refused, that a draft is invisible to the engines, and that the base file is never mutated |
| `tests/reporting.test.ts` | Variance direction, bias, the confidence band each outcome is judged against, and that a thin sample is called anecdote |
| `tests/i18n.test.ts` | That an untranslated string falls back to English rather than rendering empty, and that the coverage figure is measured from the dictionary |
| `tests/export.test.ts` | That citations, verification dates and the limitation statement travel with the export, and that it contains no markdown a message app would mangle |
| `tests/schema.test.ts` | Applies `db/schema.sql` to real Postgres in-process and checks constraints and cascades |
| `tests/offline.test.ts` | Which pages may be stored and which never may, how a cached page's age is worded, and that `public/sw.js` still mirrors the policy it enforces |
| `tests/rates.test.ts` | Fault injection on the exchange-rate adapter: unreachable, timed out, error status, HTML instead of JSON, a zero rate, a missing currency — and an estimate produced in every one |
| `tests/contrast.test.ts` | WCAG 2.2 ratios for every foreground/background pair the interface uses, and that no screen reintroduces a grey too light to read |
| `tests/readability.test.ts` | That trader-facing English stays at grade 9 or below, in the dictionary and in the screens |
| `tests/legal.test.ts` | Who still has to accept the terms, what their own record reads back as, and that registration cannot proceed without acceptance |
| `tests/compatibility.test.ts` | The declared browser floor, and that nothing is clipped or unreachable at 320 px |
| `tests/log.test.ts` | That no phone number, name, credential or free-text note can reach a log line, and that a log call cannot become an outage |
| `tests/research.test.ts` | Suppression of small groups, the subtraction attack that defeats suppressing only one cell, and that no suppressed value survives into the file |
| `tests/idempotency.test.ts` | Who may replay a key, for how long, and that the duplicate is prevented by the database rather than by a read-then-write |
| `tests/ussd.test.ts` | GSM 03.38 transliteration, the 182-septet budget on every screen, and session state derived rather than stored |
| `tests/openapi.test.ts` | That the specification and the route handlers have not drifted apart, in both directions |

Everything a change must pass, in one command:

```bash
npm run check
```

That is lint, then type check, then the test suite — NFR-MNT-02.

One check needs a build and so is a separate command:

```bash
npm run build && npm run verify:targets
```

It reads the built chunks and fails if any contain syntax above the floor in
`.browserslistrc` — optional chaining, nullish coalescing, logical assignment, private
class fields. Android 8 ships Chromium 61 as its system WebView, and a bundle with
optional chaining in it does not degrade on that handset, it throws on parse. The
reference device in Table 2.3 is exactly that handset.

---

## Known limitations

Stated plainly rather than hidden:

1. **One-time codes are shown on screen, not sent by SMS.** An SMS gateway costs money
   per message. The hashing, ten-minute expiry and single-use rules are real; only the
   delivery is stubbed, and the interface says so where the code appears.
2. **One corridor.** Rwanda → Uganda and the reverse. The architecture is
   corridor-agnostic — adding Kenya means adding rows to `data/rules.json` — but only
   the pilot corridor has been researched and cited.
3. **Exchange rates are cached unless a source is configured.** `src/lib/rates.ts` is a
   real adapter: set `EXCHANGE_RATE_URL` and it fetches, validates and uses a live
   table; leave it unset and the curated table in `catalogue.json` is used, which is
   what constraint C8 asks for. Either way the age is shown, and if a configured source
   fails the estimate is still produced and says it came from the saved rate. A payload
   that does not validate completely is discarded completely — a wrong rate is worse
   than an old one.
4. **All eleven SRS modules are built**, and all 33 functional requirements implemented. The traceability table above says which.
5. **Rules are amended as overlays, not by editing the file at runtime.** Constraint C1
   wants a hand-editable knowledge base in version control; FR-ADM-01 wants an
   administrator to amend rules through the interface. A deployed application cannot
   write to its own source, so `data/rules.json` stays the reviewable base and the
   interface writes versioned overlays on top of it. Both requirements survive; the
   cost is that the full picture is two places rather than one.
6. **Two languages are translated for the interface but not for customs wording.**
   The machinery of FR-LOC-01 is complete — every string is a key, a missing
   translation falls back to English, and the coverage figure on `/language` is
   measured rather than claimed. English and French are complete throughout.
   Kiswahili and Kinyarwanda cover navigation and general interface text, and leave
   regulatory and customs terminology in English until a fluent speaker has reviewed
   it. That gap is deliberate: a mistranslated document name could send a trader to
   a border with the wrong paper, which is worse than English they can ask someone
   about.
7. **"Printable PDF" means the browser's print-to-PDF**, against a print stylesheet,
   rather than a server-side PDF library. It adds no dependency, works on a phone,
   and produces a file the trader already knows how to save and share.
8. **A deletion request is recorded, not executed instantly.** Some of what is held
   cannot simply be erased: a border report other traders acted on, and an audit
   entry showing who changed a regulatory rule, are records of events rather than
   facts about a person. The request gives an administrator the obligation and the
   judgement, and the user is told exactly what was done. Pretending otherwise would
   be easier and less honest.
9. **Notifications are polled, not pushed.** With no SMS gateway and no background
   service, the rule comparison runs when a user opens the notifications page. The
   detection, the diff and the fan-out to subscribers are real; only the delivery
   channel is missing, and the interface says so.
10. **Offline reading works; offline writing does not.** Constraint C4 and NFR-REL-02
    are met: the application installs, and any page already opened stays readable with
    no connection, stamped with the time it was loaded. NFR-REL-03 — queuing an action
    taken offline and syncing it later — is not built. That is deliberate rather than
    unfinished. Replaying a write safely needs an idempotency key end to end, and a
    border report or a shipment transition submitted twice on reconnect would corrupt
    exactly the data other traders rely on. Failing honestly while offline is the
    better of the two wrong answers until the key is in place.
12. **The terms and privacy notice are in English and French only.** NFR-LEG-01 asks
    for every supported language. The acceptance machinery is complete — versioned,
    timestamped, recorded against the language read, re-presented when the version
    changes — but Kiswahili and Kinyarwanda fall back to English, for the same reason
    the regulatory content does. These are statements about a trader's legal rights,
    and a translation nobody has checked is worse than an honest gap. `/privacy` says
    so on the page rather than leaving the reader to notice.
13. **Reading level is measured in English only.** `readability.ts` scores
    trader-facing English against Flesch–Kincaid and the test suite holds it at grade 9
    or below. The French, Kiswahili and Kinyarwanda halves of NFR-USA-03 need a fluent
    reader, which is the verification method the SRS names for them and is not
    something a test can stand in for.
14. **Two pages are never stored on the device.** Sign-in, registration, verification
    and recovery carry credentials or a one-time code, and `/privacy/export` carries
    everything the system holds about one person. Section 2.7 assumes a handset may be
    shared with a family member, so Cache Storage outliving a session is a real risk
    rather than a theoretical one. When the signed-in account changes, every stored
    page is discarded.

---

## Troubleshooting

**`DATABASE_URL is not set`** — You have not created `.env.local`, or it is in the wrong
folder. It belongs in the project root, beside `package.json`. Re-read step 4.

**`npm run db:migrate` hangs or times out** — Almost always the wrong connection
string. On Neon use the **pooled** connection; on Supabase use the **transaction
pooler** on port 6543. Check too that the string ends in `?sslmode=require`.

**`password authentication failed`** — On Supabase, the connection string contains the
literal text `[YOUR-PASSWORD]` until you replace it with your actual database password.

**The site builds on Vercel but every page errors** — The environment variables were
not set, or were set after the build. Add them under Settings → Environment Variables,
then Deployments → ⋯ → **Redeploy**.

**`Cannot find module '@/lib/...'`** — Run `npm install` again, and confirm
`tsconfig.json` still contains the `paths` entry for `@/*`.

**Port 3000 is already in use** — `npm run dev -- -p 3001`.

---

## Licence

Coursework submission. The regulatory content is summarised from public instruments of
the East African Community and the revenue authorities of Rwanda and Uganda, each cited
at the point of use. It is guidance, not legal advice, and not a binding determination
by any customs authority.
