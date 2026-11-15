#!/usr/bin/env node
/**
 * NFR-REL-06 — "Transactional data shall be backed up daily, with backups retained for
 * 30 days and restoration verified monthly."
 *
 *   node scripts/verify-restore.mjs "postgres://…restored-branch…"
 *
 * The clause people skip is the last one. A backup nobody has restored is a hypothesis,
 * and the month you discover it was never valid is the month you needed it. This
 * script is the monthly verification: point it at a database restored from a backup
 * and it checks that what came back is actually usable.
 *
 * It deliberately does more than count tables. A restore can succeed structurally and
 * still be worthless — missing indexes make the application time out, a truncated
 * audit log breaks the guarantee in NFR-SEC-07 that administrative actions are
 * reconstructable, and a shipment whose plan snapshot is gone cannot be compared
 * against its outcome under FR-RPT-02.
 */
import postgres from 'postgres';

const url = process.argv[2] || process.env.RESTORE_URL;

if (!url) {
  console.error(`
Usage: node scripts/verify-restore.mjs "<connection string of the restored database>"

  On Neon, create a branch from a point in time, then pass that branch's
  connection string. The branch is the restore; this verifies it.
`);
  process.exit(2);
}

const sql = postgres(url, { prepare: false, idle_timeout: 5, max: 2 });

const checks = [];
const record = (name, ok, detail) => checks.push({ name, ok, detail });

/** Tables that must exist and must not be empty for the restore to be meaningful. */
const CORE_TABLES = ['users', 'shipments', 'shipment_milestones', 'border_reports'];

/** Tables whose loss would break a guarantee the SRS makes, even if nothing crashes. */
const GUARANTEE_TABLES = {
  audit_log: 'NFR-SEC-07 — administrative actions must stay reconstructable',
  rule_overlays: 'NFR-ACC-05 — the rule set applied to a past shipment must be rebuildable',
  terms_acceptances: 'NFR-LEG-01 — what each user accepted, and when',
};

try {
  // 1. The schema came back.
  const tables = (
    await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
  ).map((r) => r.table_name);

  record('Schema restored', tables.length >= 20, `${tables.length} tables`);

  for (const [table, why] of Object.entries(GUARANTEE_TABLES)) {
    record(`Table ${table} present`, tables.includes(table), why);
  }

  // 2. Indexes came back. A structurally correct restore with no indexes passes every
  //    naive check and then times out under load.
  const indexes = (
    await sql`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`
  ).map((r) => r.indexname);
  record('Indexes restored', indexes.length >= 10, `${indexes.length} indexes`);
  record(
    'The border-report index is present',
    indexes.includes('border_reports_recent_idx'),
    'every trade plan waits on this query (FR-BRD-01)',
  );

  // 3. There is data, not just structure.
  for (const table of CORE_TABLES) {
    if (!tables.includes(table)) {
      record(`Data in ${table}`, false, 'table missing');
      continue;
    }
    const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM ${sql(table)}`;
    record(`Data in ${table}`, n > 0, `${n} rows`);
  }

  // 4. Referential integrity survived. A restore that loses a parent row leaves
  //    orphans that the application will trip over one page at a time.
  const [{ orphans }] = await sql`
    SELECT COUNT(*)::int AS orphans
      FROM shipments s
      LEFT JOIN users u ON u.id = s.user_id
     WHERE u.id IS NULL
  `;
  record('No orphaned shipments', orphans === 0, `${orphans} without an owner`);

  // 5. The plan snapshots are intact. FR-SHP-01 calls them immutable and FR-RPT-02
  //    compares against them; a restore that returns nulls here is a restore that
  //    silently destroyed the accuracy record.
  const [{ broken }] = await sql`
    SELECT COUNT(*)::int AS broken FROM shipments
     WHERE plan_snapshot IS NULL OR plan_snapshot = 'null'::jsonb
  `;
  record('Plan snapshots intact', broken === 0, `${broken} shipments lost their snapshot`);

  // 6. How current the restore is. NFR-REL-05 sets a 15-minute RPO, so the gap
  //    between the newest row and the moment of the backup is the number that matters.
  const [{ newest }] = await sql`
    SELECT MAX(created_at) AS newest FROM (
      SELECT created_at FROM shipments
      UNION ALL SELECT created_at FROM border_reports
      UNION ALL SELECT created_at FROM users
    ) t
  `;
  if (newest) {
    const lagMinutes = Math.round((Date.now() - new Date(newest).getTime()) / 60000);
    record(
      'Within the 15-minute RPO (NFR-REL-05)',
      lagMinutes <= 15,
      `newest row is ${lagMinutes} minutes old — compare against when the backup was taken`,
    );
  }

  // --- report ---------------------------------------------------------------

  const failed = checks.filter((c) => !c.ok);
  const width = Math.max(...checks.map((c) => c.name.length));

  console.log('\nRestore verification — NFR-REL-06\n' + '='.repeat(72));
  for (const c of checks) {
    console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(width)}  ${c.detail ?? ''}`);
  }

  console.log(
    failed.length === 0
      ? '\n  The backup restores to a usable database. Record the date; repeat next month.\n'
      : `\n  ${failed.length} check(s) failed. This backup would not have served.\n`,
  );

  process.exit(failed.length === 0 ? 0 : 1);
} catch (error) {
  console.error('\nCould not verify the restore:', error.message, '\n');
  process.exit(2);
} finally {
  await sql.end({ timeout: 5 });
}
