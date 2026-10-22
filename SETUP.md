# BorderBridge — code files

Every source file is in this folder, in the exact directory structure the project
needs. Nothing is compiled or minified, so you can open any file and paste it.

Verified before hand-over, on this exact file set:

- `npm test` — **38 tests passing**, 0 failing
- `npx tsc --noEmit` — clean, TypeScript strict mode
- `npx next build` — clean production build, 3 routes
- Live HTTP check of `/plan` — returns a full trade plan, HTTP 200

---

## If you already have the repo on your Desktop

You do. Only **six files** differ from what is in `Desktop/BorderBridge`:

| File | What to do | Why |
|---|---|---|
| `data/crossings.json` | **create** | Border crossings + community reports (5 crossings, 7 seed reports) |
| `src/lib/border.ts` | **create** | FR-BRD-01 ranking, FR-BRD-03 reports, FR-BRD-05 decay |
| `src/lib/types.ts` | **replace** | Adds `BorderCrossing`, `WeightedReport`, `RankedCrossing`, `CrossingRanking`; `TradePlan` now carries `crossingRanking` |
| `src/lib/engines.ts` | **replace** | `buildTradePlan` now calls `rankCrossings(...)` instead of reading a hard-coded default crossing |
| `src/app/plan/page.tsx` | **replace** | New "Which crossing to use" section — recommendation, rationale, alternatives, exclusions, recent reports |
| `tests/engines.test.ts` | **replace** | One assertion updated: it no longer expects a fixed crossing name, because the crossing is now computed |
| `tests/border.test.ts` | **create** | 17 new tests for the border logic |

Everything else in this folder is byte-identical to what you already have, so
you can ignore it.

## If you are starting a fresh project

```bash
mkdir borderbridge && cd borderbridge
```

Then paste the files in this order (create the folders as you go):

1. `package.json`
2. `tsconfig.json`
3. `next.config.js`
4. `next-env.d.ts`
5. `postcss.config.js`
6. `tailwind.config.ts`
7. `.gitignore`
8. `data/catalogue.json`
9. `data/rules.json`
10. `data/crossings.json`
11. `src/lib/types.ts`
12. `src/lib/repository.ts`
13. `src/lib/border.ts`
14. `src/lib/engines.ts`
15. `src/app/globals.css`
16. `src/app/layout.tsx`
17. `src/app/page.tsx`
18. `src/app/plan/page.tsx`
19. `tests/engines.test.ts`
20. `tests/border.test.ts`

> `.gitignore` starts with a dot, so Finder hides it. If pasting it is awkward,
> create it from the terminal instead:
> `printf 'node_modules\n.next\nout\n.env*\n*.tsbuildinfo\n.DS_Store\n' > .gitignore`

## Then run it

```bash
npm install          # ~30 seconds, no native compilation
npm test             # 38 tests
npm run dev          # http://localhost:3000
```

Open <http://localhost:3000>, choose **Rwanda → Uganda**, **Coffee, green
(unroasted)**, quantity **200 kg**, value **1400 USD**, and submit. You should
get a checklist of 5 documents, an itemised cost estimate, and a crossing
recommendation that explains itself — currently Kagitumba / Mirama Hills,
because the seeded community reports put its 6-hour mean wait at about 27
minutes against 91 at Gatuna.

```bash
npm run build && npm start   # production build, when you want to check it
```

Node 18.18 or newer. No database, no API keys, no environment variables — the
regulatory knowledge base is JSON on disk, which is what constraint C1 in the
SRS asks for ("rules as data, not code").

---

## What each file is for

### Configuration

| File | Purpose |
|---|---|
| `package.json` | Dependencies, pinned. Next 14 / React 18 / TypeScript 5.6 — do **not** let these float to Next 15 or React 19, the app targets the pinned pair. |
| `tsconfig.json` | Strict mode, `@/*` path alias to `src/*`, `resolveJsonModule` so the data files import directly |
| `next.config.js` | App Router config plus a webpack alias fallback for `@/` |
| `tailwind.config.ts`, `postcss.config.js` | Tailwind 3 |

### Data — the regulatory knowledge base

| File | Contents |
|---|---|
| `data/rules.json` | Document, duty and fee rules. Every rule carries `sourceCitation`, `lastVerifiedDate` and `verificationStatus`, which is what lets the app mark its own output "pending re-verification" (NFR-ACC-02) instead of presenting stale law as current. |
| `data/catalogue.json` | Corridors and products, with HS codes, STR-listing and EAC-origin flags |
| `data/crossings.json` | Border crossings — official status, opening hours, road distance, which product classes each can clear — plus seeded community reports. Report ages are stored as `hoursAgo` rather than timestamps, so the seed stays meaningful without being rewritten every day. |

### Logic

| File | Contents |
|---|---|
| `src/lib/types.ts` | Every interface in the system, one file, no implementation |
| `src/lib/repository.ts` | The repository interface and its JSON-backed implementation. Swapping in Postgres later means writing one new class, not touching the engines. |
| `src/lib/border.ts` | The border service. `rankCrossings()` implements FR-BRD-01's three criteria in order — official status, then 6-hour weighted mean reported wait, then road distance — with opening hours as the tie-break, and `reportWeight()` implements FR-BRD-05's linear 12-hour decay. `decidingCriterion()` reports *which* criterion separated first from second, because the requirement obliges the system to explain the choice rather than just name a crossing. |
| `src/lib/engines.ts` | The requirements engine (FR-REQ-01…03), the cost engine (FR-CST-01…04) and `buildTradePlan()`, which orchestrates all of them |

### Interface

| File | Contents |
|---|---|
| `src/app/layout.tsx` | Shell and typography |
| `src/app/page.tsx` | The trade-intention form |
| `src/app/plan/page.tsx` | The trade plan — checklist, costs, crossing recommendation. Server-rendered, so it works on a low-end phone over a slow connection, which NFR-PRF-01 requires. |

### Tests

| File | Covers |
|---|---|
| `tests/engines.test.ts` | 21 tests — STR eligibility at and across the USD 2,000 threshold, checklist assembly, duty and fee computation, currency conversion, and that unknown corridors and products throw rather than guess |
| `tests/border.test.ts` | 17 tests — weight at 0 h / 6 h / 12 h, expiry at the boundary, that a stale report cannot move the mean, that an unknown wait never outranks a known short one, ranking order, the distance tie-break, and product-class exclusion |

Thresholds are exported as named constants (`REPORT_WINDOW_HOURS`,
`RANKING_WINDOW_HOURS`) and the tests assert against those same constants, so a
test failing means the behaviour drifted from the SRS, not that a magic number
changed in two places.

---

## Two things worth knowing

**The clock is injected everywhere.** Every function that cares about time takes
`now: Date = new Date()` as a parameter. That is why the tests are deterministic
and why they will still pass next year.

**The recommended crossing is computed, not configured.** `catalogue.json` still
carries an `isDefault` flag on each crossing from the earlier version; nothing
reads it any more. The crossing now comes out of `rankCrossings()`, which is
what FR-BRD-01 actually specifies. You can delete the flag if you want, or leave
it — it is harmless.
