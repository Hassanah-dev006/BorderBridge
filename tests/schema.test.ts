/**
 * Applies db/schema.sql to a real Postgres engine and checks that it does what it
 * claims — tables created, re-running is safe, and the constraints actually hold.
 *
 * PGlite is Postgres compiled to WebAssembly, so this runs the genuine engine in
 * process. No server, no DATABASE_URL, no network: these tests run anywhere the rest
 * of the suite does, which is the point — a broken schema is then caught by `npm test`
 * rather than by a failed migration against the live database.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const schema = readFileSync(join(process.cwd(), 'db', 'schema.sql'), 'utf8');
let db: PGlite;

before(async () => {
  db = new PGlite();
  await db.exec(schema);
});

after(async () => {
  await db.close();
});

/** Asserts that a statement is refused by the database. */
async function refuses(sql: string, what: string) {
  await assert.rejects(() => db.query(sql), `${what} should be refused`);
}

describe('db/schema.sql', () => {
  test('creates every table the application uses', async () => {
    const r = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1`,
    );
    const tables = r.rows.map((x) => x.table_name);
    for (const expected of [
      'border_reports', 'checklist_progress', 'login_attempts', 'otp_codes',
      'sessions', 'shipment_milestones', 'shipments', 'users',
    ]) {
      assert.ok(tables.includes(expected), `missing table: ${expected}`);
    }
  });

  test('can be applied twice without error', async () => {
    // Every statement is guarded, so `npm run db:migrate` is safe to re-run.
    await db.exec(schema);
  });
});

describe('constraints', () => {
  before(async () => {
    await db.query(
      `INSERT INTO users (id, phone, display_name, password_hash)
       VALUES ('u-owner', '+250788000001', 'Owner', 'salt:hash')`,
    );
  });

  test('one account per phone number (FR-ACC-01)', async () => {
    await refuses(
      `INSERT INTO users (id, phone, display_name, password_hash)
       VALUES ('u-dup', '+250788000001', 'Duplicate', 'salt:hash')`,
      'a second account on the same number',
    );
  });

  test('role is restricted to the three the system defines', async () => {
    await refuses(
      `INSERT INTO users (id, phone, display_name, password_hash, role)
       VALUES ('u-bad', '+250788000099', 'Bad', 'salt:hash', 'superuser')`,
      'an undefined role',
    );
  });

  test('a report cannot claim an impossible waiting time', async () => {
    await refuses(
      `INSERT INTO border_reports (id, crossing_id, category, wait_minutes)
       VALUES ('r-bad', 'GATUNA', 'normal', 99999)`,
      'a wait of 69 days',
    );
    await refuses(
      `INSERT INTO border_reports (id, crossing_id, category, wait_minutes)
       VALUES ('r-neg', 'GATUNA', 'normal', -5)`,
      'a negative wait',
    );
  });

  test('a shipment status is restricted to the defined milestones', async () => {
    await refuses(
      `INSERT INTO shipments (id, user_id, corridor_id, product_id, quantity, declared_value, currency, plan_snapshot, status)
       VALUES ('s-bad', 'u-owner', 'RW-UG', 'coffee-green', 1, 1, 'USD', '{}', 'teleported')`,
      'an invented status',
    );
  });

  test('deleting a shipment takes its progress with it', async () => {
    await db.query(
      `INSERT INTO shipments (id, user_id, corridor_id, product_id, quantity, declared_value, currency, plan_snapshot)
       VALUES ('s-1', 'u-owner', 'RW-UG', 'coffee-green', 200, 1200, 'USD', '{"checklist":[]}')`,
    );
    await db.query(`INSERT INTO checklist_progress (shipment_id, rule_id) VALUES ('s-1', 'RW-UG-DOC-001')`);
    await db.query(`DELETE FROM shipments WHERE id = 's-1'`);

    const left = await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM checklist_progress`);
    assert.equal(left.rows[0].n, 0, 'orphaned checklist rows were left behind');
  });

  test('a report outlives the account that filed it', async () => {
    // Reports are community data. Deleting an account should not rewrite the record
    // of what the queue was like that morning.
    await db.query(
      `INSERT INTO users (id, phone, display_name, password_hash)
       VALUES ('u-temp', '+250788000002', 'Temp', 'salt:hash')`,
    );
    await db.query(
      `INSERT INTO border_reports (id, crossing_id, user_id, category, wait_minutes)
       VALUES ('r-keep', 'GATUNA', 'u-temp', 'busy', 90)`,
    );
    await db.query(`DELETE FROM users WHERE id = 'u-temp'`);

    const r = await db.query<{ user_id: string | null }>(
      `SELECT user_id FROM border_reports WHERE id = 'r-keep'`,
    );
    assert.equal(r.rows.length, 1, 'the report was deleted with the user');
    assert.equal(r.rows[0].user_id, null, 'the report should be anonymised, not removed');
  });

  test('the plan snapshot round-trips as JSON (FR-SHP-01)', async () => {
    const plan = { recommendedCrossing: 'Gatuna / Katuna', cost: { totalUsd: 1234.56 }, checklist: [{ ruleId: 'X' }] };
    await db.query(
      `INSERT INTO shipments (id, user_id, corridor_id, product_id, quantity, declared_value, currency, plan_snapshot)
       VALUES ('s-2', 'u-owner', 'RW-UG', 'coffee-green', 200, 1200, 'USD', $1)`,
      [JSON.stringify(plan)],
    );
    const r = await db.query<{ plan_snapshot: typeof plan }>(
      `SELECT plan_snapshot FROM shipments WHERE id = 's-2'`,
    );
    assert.deepEqual(r.rows[0].plan_snapshot, plan);
  });
});
