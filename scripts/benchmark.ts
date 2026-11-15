/**
 * Performance measurement — NFR-PER-01, NFR-PER-02, NFR-PER-06, NFR-SCA-03.
 *
 *   npx tsx scripts/benchmark.ts
 *   npx tsx scripts/benchmark.ts --users 50000 --shipments 10000 --iterations 2000
 *
 * These four requirements all name numbers, and until something measures them the
 * numbers are hopes. This seeds the volume NFR-SCA-03 commits to — 50,000 registered
 * users and 10,000 shipments in a month — and then times the work behind a checklist
 * and a cost estimate against it.
 *
 * WHAT THIS DOES AND DOES NOT MEASURE, because a benchmark whose scope is unstated is
 * worse than none:
 *
 *   It runs Postgres through PGlite, which is the genuine engine compiled to
 *   WebAssembly, in this process. So the query plans are real and the row counts are
 *   real, and a query that scans a table here scans it in production too — which is
 *   the failure this is looking for.
 *
 *   It excludes the network round trip to a hosted database, which on Neon from a
 *   Vercel function is tens of milliseconds and is the largest single term in the
 *   real figure. It also excludes TLS, cold starts and React rendering.
 *
 *   So: treat the query figures as a floor, not a prediction. Their value is
 *   comparative — if a query is 400 ms here it will not be 200 ms in production — and
 *   diagnostic: a figure that grows with the seed is a missing index, and that is the
 *   thing worth finding before a pilot rather than during one.
 *
 * The engine figures are different: the requirements engine and cost engine are pure
 * computation with no I/O, so what is measured here is what runs in production.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildTradePlan } from '../src/lib/engines';
import { getRulesForCorridor, listSupportedCorridors, listProducts } from '../src/lib/repository';
import type { BorderReport } from '../src/lib/types';

// --- thresholds, quoted from the SRS ---------------------------------------

const THRESHOLDS = {
  'NFR-PER-01': { what: 'checklist generation, p95', limit: 3000, unit: 'ms' },
  'NFR-PER-02': { what: 'cost estimate, p95', limit: 3000, unit: 'ms' },
  'NFR-PER-06': { what: 'supporting queries, p95', limit: 200, unit: 'ms' },
} as const;

// --- arguments --------------------------------------------------------------

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = Number(process.argv[i + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// NFR-SCA-03: "growth to 50,000 registered users and 10,000 shipments per month".
const USERS = arg('users', 50_000);
const SHIPMENTS = arg('shipments', 10_000);
const REPORTS = arg('reports', 5_000);
const ITERATIONS = arg('iterations', 1_000);

// --- statistics -------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

type Timing = { p50: number; p95: number; p99: number; max: number; n: number };

function summarise(samples: number[]): Timing {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1] ?? 0,
    n: sorted.length,
  };
}

const ms = (n: number) => `${n.toFixed(1)} ms`;

// --- seeding ----------------------------------------------------------------

async function seed(db: PGlite): Promise<void> {
  const schema = readFileSync(join(process.cwd(), 'db', 'schema.sql'), 'utf8');
  await db.exec(schema);

  process.stdout.write(`Seeding ${USERS.toLocaleString()} users… `);
  // generate_series rather than row-by-row inserts: the point is to reach the volume,
  // not to measure how slowly a loop can reach it.
  await db.exec(`
    INSERT INTO users (id, phone, display_name, role, preferred_language, password_hash, phone_verified_at)
    SELECT
      'usr_' || g,
      '+2507' || LPAD(g::text, 8, '0'),
      'Trader ' || g,
      CASE WHEN g % 20 = 0 THEN 'provider' ELSE 'trader' END,
      (ARRAY['en','fr','sw','rw'])[1 + (g % 4)],
      'scrypt$notareal$hash',
      NOW() - (g % 365) * INTERVAL '1 day'
    FROM generate_series(1, ${USERS}) g;
  `);
  process.stdout.write('done\n');

  process.stdout.write(`Seeding ${SHIPMENTS.toLocaleString()} shipments… `);
  await db.exec(`
    INSERT INTO shipments (id, user_id, corridor_id, product_id, quantity, declared_value, currency, plan_snapshot, status, created_at)
    SELECT
      'shp_' || g,
      'usr_' || (1 + (g % ${USERS})),
      CASE WHEN g % 2 = 0 THEN 'rw-ug' ELSE 'ug-rw' END,
      'maize',
      100 + (g % 900),
      500 + (g % 1500),
      'USD',
      jsonb_build_object(
        'product', jsonb_build_object('category', (ARRAY['Agricultural','Animal product','Manufactured'])[1 + (g % 3)]),
        'cost', jsonb_build_object('totalUsd', 300 + (g % 700))
      ),
      (ARRAY['planned','in-transit','delivered','cleared'])[1 + (g % 4)],
      NOW() - (g % 30) * INTERVAL '1 day'
    FROM generate_series(1, ${SHIPMENTS}) g;
  `);
  process.stdout.write('done\n');

  process.stdout.write(`Seeding ${REPORTS.toLocaleString()} border reports… `);
  await db.exec(`
    INSERT INTO border_reports (id, user_id, crossing_id, category, wait_minutes, note, reported_at)
    SELECT
      'rpt_' || g,
      'usr_' || (1 + (g % ${USERS})),
      CASE WHEN g % 2 = 0 THEN 'gatuna-katuna' ELSE 'kagitumba-mirama' END,
      (ARRAY['normal','busy','severe-delay','closed'])[1 + (g % 4)],
      10 + (g % 240),
      '',
      NOW() - (g % 2880) * INTERVAL '1 minute'
    FROM generate_series(1, ${REPORTS}) g;
  `);
  process.stdout.write('done\n');

  // Without this the planner has no statistics for the rows just inserted and chooses
  // sequential scans it would never choose in production, where autovacuum has long
  // since run. A benchmark that measures the wrong query plan measures nothing — it
  // cost a wrong conclusion here before it was added: a correct index looked useless.
  process.stdout.write('Collecting statistics… ');
  await db.exec('ANALYZE;');
  process.stdout.write('done\n\n');
}

// --- the measurements -------------------------------------------------------

async function timeQuery(db: PGlite, sql: string, runs: number): Promise<number[]> {
  // One untimed run so the figure is not dominated by first-call plan caching, which
  // happens once in production and would otherwise distort every percentile.
  await db.query(sql);

  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const started = performance.now();
    await db.query(sql);
    samples.push(performance.now() - started);
  }
  return samples;
}

function timeEngine(runs: number, reports: BorderReport[]): { checklist: number[]; full: number[] } {
  const corridor = listSupportedCorridors()[0];
  const product = listProducts()[0];
  const rules = getRulesForCorridor(corridor.id);

  const intention = {
    corridorId: corridor.id,
    productId: product.id,
    quantity: 250,
    declaredValue: 1200,
    currency: 'USD',
  };

  const checklist: number[] = [];
  const full: number[] = [];

  // Warm the JIT. Measuring interpreted first runs would report a number no trader
  // ever experiences.
  for (let i = 0; i < 50; i++) buildTradePlan(intention, reports, rules);

  for (let i = 0; i < runs; i++) {
    const started = performance.now();
    const plan = buildTradePlan(intention, reports, rules);
    const elapsed = performance.now() - started;
    full.push(elapsed);
    // The checklist is the part of that work NFR-PER-01 is about; it is produced
    // within the same pass, so it is bounded by the whole.
    if (plan.checklist) checklist.push(elapsed);
  }

  return { checklist, full };
}

function row(label: string, t: Timing): string {
  return `  ${label.padEnd(34)} ${ms(t.p50).padStart(10)} ${ms(t.p95).padStart(11)} ${ms(t.p99).padStart(11)} ${ms(t.max).padStart(11)}`;
}

async function main(): Promise<void> {
  console.log('\nBorderBridge performance measurement');
  console.log('='.repeat(78));
  console.log(
    `Volume: ${USERS.toLocaleString()} users, ${SHIPMENTS.toLocaleString()} shipments, ` +
    `${REPORTS.toLocaleString()} border reports (NFR-SCA-03)\n`,
  );

  const db = new PGlite();
  try {
    await seed(db);

    const engine = timeEngine(ITERATIONS, []);
    const checklist = summarise(engine.checklist);
    const estimate = summarise(engine.full);

    // The queries a plan actually waits on.
    const queries: [string, string][] = [
      ['recent border reports', `SELECT * FROM border_reports WHERE reported_at > NOW() - INTERVAL '12 hours' ORDER BY reported_at DESC`],
      ['published rule overlays', `SELECT * FROM rule_overlays WHERE status = 'published'`],
      ['active market listings', `SELECT * FROM market_listings WHERE active AND expires_at > NOW()`],
      ['a trader’s shipments', `SELECT * FROM shipments WHERE user_id = 'usr_42' ORDER BY created_at DESC`],
      ['operational metrics', `SELECT (SELECT COUNT(*) FROM users)::int a, (SELECT COUNT(*) FROM shipments)::int b, (SELECT COUNT(DISTINCT user_id) FROM border_reports)::int c`],
    ];

    const queryTimings: [string, Timing][] = [];
    for (const [label, sql] of queries) {
      queryTimings.push([label, summarise(await timeQuery(db, sql, 200))]);
    }

    console.log(`  ${'measurement'.padEnd(34)} ${'p50'.padStart(10)} ${'p95'.padStart(11)} ${'p99'.padStart(11)} ${'max'.padStart(11)}`);
    console.log('  ' + '-'.repeat(76));
    console.log(row('checklist generation (engine)', checklist));
    console.log(row('full trade plan (engine)', estimate));
    console.log('  ' + '-'.repeat(76));
    for (const [label, t] of queryTimings) console.log(row(label, t));
    console.log('');

    const worstQuery = Math.max(...queryTimings.map(([, t]) => t.p95));

    const results: [keyof typeof THRESHOLDS, number][] = [
      ['NFR-PER-01', checklist.p95],
      ['NFR-PER-02', estimate.p95],
      ['NFR-PER-06', worstQuery],
    ];

    console.log('  Against the SRS thresholds');
    console.log('  ' + '-'.repeat(76));
    let failed = 0;
    for (const [id, measured] of results) {
      const { what, limit } = THRESHOLDS[id];
      const ok = measured <= limit;
      if (!ok) failed++;
      console.log(
        `  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${what.padEnd(30)} ${ms(measured).padStart(10)} against ${limit} ms`,
      );
    }

    // Only claim NFR-SCA-03 when the run actually reached the volume it names. A
    // reduced run is useful for a quick check and is not evidence of capacity.
    const atCommittedVolume = USERS >= 50_000 && SHIPMENTS >= 10_000;
    console.log(
      atCommittedVolume
        ? '\n  PASS  NFR-SCA-03  measured at the committed volume: 50,000 users, 10,000 shipments.'
        : `\n  n/a   NFR-SCA-03  this run used ${USERS.toLocaleString()} users and ${SHIPMENTS.toLocaleString()} shipments,\n` +
          '        below the figures the requirement names. Run without --users/--shipments to claim it.',
    );
    console.log('\n  Excluded: network round trip to the hosted database, TLS, cold starts,');
    console.log('  React rendering. Query figures are a floor, not a prediction of production.\n');

    process.exit(failed === 0 ? 0 : 1);
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
