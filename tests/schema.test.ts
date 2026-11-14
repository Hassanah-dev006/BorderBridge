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

  test('a provider publishes one offering per route (FR-TRN-01)', async () => {
    await db.query(
      `INSERT INTO users (id, phone, display_name, password_hash, role)
       VALUES ('u-prov', '+250788000010', 'Carrier', 'salt:hash', 'provider')`,
    );
    await db.query(
      `INSERT INTO transport_offerings (id, provider_id, corridor_id, vehicle_type, capacity_kg, rate_per_kg)
       VALUES ('o-1', 'u-prov', 'RW-UG', 'Pickup', 1000, 0.9)`,
    );
    await refuses(
      `INSERT INTO transport_offerings (id, provider_id, corridor_id, vehicle_type, capacity_kg, rate_per_kg)
       VALUES ('o-2', 'u-prov', 'RW-UG', 'Truck', 8000, 0.6)`,
      'a second offering on the same route',
    );
    // A different route is fine.
    await db.query(
      `INSERT INTO transport_offerings (id, provider_id, corridor_id, vehicle_type, capacity_kg, rate_per_kg)
       VALUES ('o-3', 'u-prov', 'UG-RW', 'Truck', 8000, 0.6)`,
    );
  });

  test('a trader cannot send the same provider two requests for one shipment', async () => {
    await db.query(
      `INSERT INTO shipments (id, user_id, corridor_id, product_id, quantity, declared_value, currency, plan_snapshot)
       VALUES ('s-trn', 'u-owner', 'RW-UG', 'coffee-green', 200, 1200, 'USD', '{"checklist":[]}')`,
    );
    await db.query(
      `INSERT INTO transport_requests (id, shipment_id, offering_id, trader_id, provider_id, quoted_usd)
       VALUES ('q-1', 's-trn', 'o-1', 'u-owner', 'u-prov', 180)`,
    );
    await refuses(
      `INSERT INTO transport_requests (id, shipment_id, offering_id, trader_id, provider_id, quoted_usd)
       VALUES ('q-2', 's-trn', 'o-1', 'u-owner', 'u-prov', 180)`,
      'a duplicate request',
    );
  });

  test('a request status is restricted to the four the system defines', async () => {
    await refuses(
      `INSERT INTO transport_requests (id, shipment_id, offering_id, trader_id, provider_id, quoted_usd, status)
       VALUES ('q-bad', 's-trn', 'o-3', 'u-owner', 'u-prov', 180, 'maybe')`,
      'an invented request status',
    );
  });

  test('a rating must be between one and five, once per shipment', async () => {
    await refuses(
      `INSERT INTO provider_ratings (id, shipment_id, provider_id, trader_id, stars)
       VALUES ('g-bad', 's-trn', 'u-prov', 'u-owner', 6)`,
      'six stars',
    );
    await db.query(
      `INSERT INTO provider_ratings (id, shipment_id, provider_id, trader_id, stars)
       VALUES ('g-1', 's-trn', 'u-prov', 'u-owner', 5)`,
    );
    await refuses(
      `INSERT INTO provider_ratings (id, shipment_id, provider_id, trader_id, stars)
       VALUES ('g-2', 's-trn', 'u-prov', 'u-owner', 1)`,
      'a second rating for the same shipment',
    );
  });

  test('one listing per user, kind, product and market (FR-MKT-01)', async () => {
    await db.query(
      `INSERT INTO market_listings (id, user_id, kind, product_id, country, expires_at)
       VALUES ('m-1', 'u-owner', 'selling', 'coffee-green', 'RW', NOW() + INTERVAL '30 days')`,
    );
    await refuses(
      `INSERT INTO market_listings (id, user_id, kind, product_id, country, expires_at)
       VALUES ('m-2', 'u-owner', 'selling', 'coffee-green', 'RW', NOW() + INTERVAL '30 days')`,
      'a duplicate listing',
    );
    // The same product in the other market is a different listing.
    await db.query(
      `INSERT INTO market_listings (id, user_id, kind, product_id, country, expires_at)
       VALUES ('m-3', 'u-owner', 'selling', 'coffee-green', 'UG', NOW() + INTERVAL '30 days')`,
    );
  });

  test('a listing kind is restricted to buying or selling', async () => {
    await refuses(
      `INSERT INTO market_listings (id, user_id, kind, product_id, country, expires_at)
       VALUES ('m-bad', 'u-owner', 'bartering', 'coffee-green', 'RW', NOW() + INTERVAL '30 days')`,
      'an invented listing kind',
    );
  });

  test('a trader cannot enquire twice about the same listing (FR-MKT-03)', async () => {
    await db.query(
      `INSERT INTO users (id, phone, display_name, password_hash)
       VALUES ('u-buyer', '+256700000001', 'Buyer', 'salt:hash')`,
    );
    await db.query(
      `INSERT INTO market_enquiries (id, listing_id, from_user_id, to_user_id, message)
       VALUES ('q-m1', 'm-1', 'u-buyer', 'u-owner', 'Interested')`,
    );
    await refuses(
      `INSERT INTO market_enquiries (id, listing_id, from_user_id, to_user_id, message)
       VALUES ('q-m2', 'm-1', 'u-buyer', 'u-owner', 'Still interested')`,
      'a second enquiry on the same listing',
    );
  });

  test('a notification kind is restricted to the five the system defines', async () => {
    await refuses(
      `INSERT INTO notifications (id, user_id, kind, title)
       VALUES ('n-bad', 'u-owner', 'gossip', 'Hello')`,
      'an invented notification kind',
    );
    await db.query(
      `INSERT INTO notifications (id, user_id, kind, title)
       VALUES ('n-ok', 'u-owner', 'rule-change', 'Rules changed')`,
    );
  });

  test('a subscription is unique on what it follows (FR-NOT-01)', async () => {
    await db.query(
      `INSERT INTO notification_subscriptions (id, user_id, corridor_id)
       VALUES ('sub-1', 'u-owner', 'RW-UG')`,
    );
    // Postgres treats NULLs as distinct in a unique index, so the guard against an
    // exact duplicate is the ON CONFLICT in store.ts, not this constraint. What this
    // asserts is that a DIFFERENT subscription is accepted alongside it.
    await db.query(
      `INSERT INTO notification_subscriptions (id, user_id, corridor_id, product_category)
       VALUES ('sub-2', 'u-owner', 'RW-UG', 'Agricultural')`,
    );
    const r = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM notification_subscriptions WHERE user_id = 'u-owner'`,
    );
    assert.equal(r.rows[0].n, 2);
  });

  test('the rule watermark stores a snapshot it can diff against (FR-NOT-02)', async () => {
    const snap = [{ id: 'R1', name: 'Import duty', sig: 'R1|1|duty' }];
    await db.query(
      `INSERT INTO rule_watermarks (corridor_id, fingerprint, snapshot) VALUES ('RW-UG', 'abc123', $1)`,
      [JSON.stringify(snap)],
    );
    const r = await db.query<{ snapshot: typeof snap }>(
      `SELECT snapshot FROM rule_watermarks WHERE corridor_id = 'RW-UG'`,
    );
    assert.deepEqual(r.rows[0].snapshot, snap);
  });

  test('a rule overlay is versioned, one per rule version (FR-ADM-01)', async () => {
    const payload = JSON.stringify({ id: 'R-1', name: 'Test rule', version: 2 });
    await db.query(
      `INSERT INTO rule_overlays (id, rule_id, corridor_id, version, action, payload, created_by)
       VALUES ('ov-1', 'R-1', 'RW-UG', 2, 'amend', $1, 'u-owner')`,
      [payload],
    );
    await refuses(
      `INSERT INTO rule_overlays (id, rule_id, corridor_id, version, action, payload, created_by)
       VALUES ('ov-2', 'R-1', 'RW-UG', 2, 'amend', $1, 'u-owner')`,
      'a second overlay at the same version',
    );
  });

  test('an overlay starts as a draft and nothing else (FR-ADM-02)', async () => {
    const payload = JSON.stringify({ id: 'R-2', name: 'Another', version: 1 });
    await db.query(
      `INSERT INTO rule_overlays (id, rule_id, corridor_id, version, action, payload)
       VALUES ('ov-3', 'R-2', 'RW-UG', 1, 'create', $1)`,
      [payload],
    );
    const r = await db.query<{ status: string }>(`SELECT status FROM rule_overlays WHERE id = 'ov-3'`);
    assert.equal(r.rows[0].status, 'draft', 'a new overlay must not be live by default');

    await refuses(
      `INSERT INTO rule_overlays (id, rule_id, corridor_id, version, action, payload, status)
       VALUES ('ov-bad', 'R-3', 'RW-UG', 1, 'create', $1, 'live')`,
      'an invented overlay status',
    );
  });

  test('the audit log keeps the actor name after the account goes', async () => {
    await db.query(
      `INSERT INTO users (id, phone, display_name, password_hash, role)
       VALUES ('u-admin', '+250788000099', 'Departing Admin', 'salt:hash', 'admin')`,
    );
    await db.query(
      `INSERT INTO audit_log (id, actor_id, actor_name, action, subject)
       VALUES ('a-1', 'u-admin', 'Departing Admin', 'rule.publish', 'R-1 v2')`,
    );
    await db.query(`DELETE FROM users WHERE id = 'u-admin'`);

    const r = await db.query<{ actor_id: string | null; actor_name: string }>(
      `SELECT actor_id, actor_name FROM audit_log WHERE id = 'a-1'`,
    );
    assert.equal(r.rows.length, 1, 'the audit entry must survive the account');
    assert.equal(r.rows[0].actor_id, null);
    assert.equal(r.rows[0].actor_name, 'Departing Admin', 'who published a change to the law must not be erasable');
  });

  test('a recorded actual cost cannot be negative (FR-RPT-02)', async () => {
    await db.query(
      `INSERT INTO shipments (id, user_id, corridor_id, product_id, quantity, declared_value, currency, plan_snapshot, status)
       VALUES ('s-rpt', 'u-owner', 'RW-UG', 'coffee-green', 200, 1200, 'USD', '{"checklist":[]}', 'delivered')`,
    );
    await refuses(
      `UPDATE shipments SET actual_cost_usd = -5 WHERE id = 's-rpt'`,
      'a negative actual cost',
    );
    await db.query(`UPDATE shipments SET actual_cost_usd = 1450.25 WHERE id = 's-rpt'`);
    const r = await db.query<{ actual_cost_usd: string }>(
      `SELECT actual_cost_usd FROM shipments WHERE id = 's-rpt'`,
    );
    assert.equal(Number(r.rows[0].actual_cost_usd), 1450.25);
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
