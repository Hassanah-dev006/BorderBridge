# BorderBridge

A cross-border trade planning platform for small-scale traders in the East African Community.

Enter a consignment — route, product, quantity, value — and the system returns the documents
you need, whether you qualify for the EAC Simplified Trade Regime, and what the movement
should cost, with the source and verification date of every rule it relied on.

This is release **R1 Core**, the first increment of the roadmap in the project proposal.

---

## Running it

### 1. Install Node.js (once)

Check whether you already have it. Open **Terminal** (press `Cmd + Space`, type `Terminal`,
press Enter) and run:

```bash
node --version
```

If you see something like `v20.11.0` or higher, skip to step 2. If you see
`command not found`, install Node from <https://nodejs.org> — download the **LTS** version
and run the installer. Then close and reopen Terminal and check again.

### 2. Install the project's dependencies (once)

In Terminal, move into this folder and install:

```bash
cd path/to/borderbridge
npm install
```

Replace `path/to/borderbridge` with the real path — or type `cd ` (with the space) and then
drag the `borderbridge` folder from Finder into the Terminal window, which fills in the path
for you.

This takes a minute or two and creates a `node_modules` folder.

### 3. Start it

```bash
npm run dev
```

Then open <http://localhost:3000> in your browser. Press `Ctrl + C` in Terminal to stop it.

### Running the tests

```bash
npm test
```

21 tests cover the eligibility logic, checklist generation and cost calculation.

---

## What it does

| Requirement | Where it lives |
|---|---|
| FR-REQ-01 — state a trade intention | `src/app/page.tsx` |
| FR-REQ-02 — generate a document checklist | `generateChecklist()` in `src/lib/engines.ts` |
| FR-REQ-03 — simplified-regime eligibility | `determineEligibility()` in `src/lib/engines.ts` |
| FR-CST-01 — itemised landed cost | `estimateCost()` in `src/lib/engines.ts` |
| FR-CST-02 — currency conversion | `toUsd()` / `fromUsd()` in `src/lib/engines.ts` |
| FR-CST-03 — per-line rule attribution | every `CostLine` carries `sourceCitation` |
| FR-CST-04 — guidance, not a determination | footer of `src/app/plan/page.tsx` |

### Worked example

Coffee, 200 kg, declared USD 1,200, Rwanda → Uganda:

- **Qualifies** for the Simplified Trade Regime — under the USD 2,000 threshold *and* on the
  common list. Both conditions are reported separately, so a trader learns which one decided it.
- **5 documents**: ID, commercial invoice, Simplified Certificate of Origin, phytosanitary
  certificate (HS 09 is a plant product), and a NAEB coffee export licence.
- **USD 1,385** total — 1,200 goods + 180 transport + 0 duty (EAC preference) + 5 inspection fee.

Raise the value to USD 2,500 and the plan changes: full customs procedure, an EAC Certificate
of Origin and a customs declaration replace the simplified certificate, VAT at 18% applies, and
the total becomes USD 3,145.

---

## How it is put together

```
data/
  catalogue.json   corridors, products with HS codes, cached exchange rates
  rules.json       the regulatory knowledge base
src/
  lib/
    types.ts       domain types, mirroring the class diagram in SRS Appendix B
    repository.ts  data access seam — the only file that knows where rules are stored
    engines.ts     requirements engine + cost engine (pure functions, no I/O)
  app/
    page.tsx       the trade intention form
    plan/page.tsx  the resulting plan
tests/
  engines.test.ts  21 unit tests
```

**Rules are data, not code.** Everything the system tells a trader comes from
`data/rules.json`. Adding a document requirement, changing a duty rate or correcting a
citation means editing that file — no code change, no redeploy of logic. This is constraint
C1 in the SRS, and it exists because tariff schedules and product lists change faster than
software does.

**Every rule carries its source.** `sourceCitation` and `lastVerifiedDate` are mandatory
fields, and they are displayed wherever the rule is shown. A trader who is told they need a
phytosanitary certificate can see which instrument requires it and when that was last checked.
That is what makes the advice contestable at a border rather than something to be taken on
faith.

**Stale content is flagged, not hidden.** Any rule older than the 180-day review interval, or
explicitly marked `needs-verification`, causes its checklist item or cost line to be badged in
the interface, and widens the confidence range on the estimate from ±12% to ±20%. Several
seeded rules are deliberately marked this way, because they are indicative figures that have
not been confirmed against a primary source.

---

## Before this is used by a real trader

The seeded rules in `data/rules.json` are a working starting point, not a verified dataset.
Three categories need confirming against primary sources:

1. **The rates marked `needs-verification`** — Uganda VAT, the customs processing fee, the
   inspection fee and the indicative transport rate. The interface already flags these; they
   need checking against URA and RRA published schedules.
2. **The coffee export licence** — NAEB procedures should be confirmed directly.
3. **The STR common list** — `strListed` is set per product in `catalogue.json` from the
   general shape of the agreed list. The actual list should be transcribed from the EAC
   instrument.

Until then the system behaves correctly but some of what it says is indicative.

---

## Where this goes next

Per the release roadmap in the proposal:

- **R2 Corridor** — border crossing status, community delay reports, shipment tracking
- **R3 Market** — transport matching, buyer and supplier discovery, the other three languages
- **R4 Hardening** — offline support, USSD fallback, usability testing with traders

**Moving to a database.** `src/lib/repository.ts` is the only file that knows rules live in
JSON. Swapping to PostgreSQL means reimplementing that one module behind the same function
signatures; nothing above it changes. JSON was chosen for R1 because it keeps the rules
human-editable and removes database setup from the critical path — not because it is the
long-term answer.
