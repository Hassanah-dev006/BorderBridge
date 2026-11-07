/**
 * Applies db/schema.sql to the database in DATABASE_URL.
 *
 *   npm run db:migrate
 *
 * Every statement in the schema is guarded with IF NOT EXISTS, so running this
 * repeatedly is safe and does not destroy data.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import postgres from 'postgres';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, '..', 'db', 'schema.sql');

// Read .env.local by hand — this script runs outside Next.js, which is what loads it normally.
function loadEnv() {
  if (process.env.DATABASE_URL) return;
  for (const file of ['.env.local', '.env']) {
    try {
      const text = readFileSync(join(here, '..', file), 'utf8');
      for (const line of text.split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        const value = m[2].replace(/^["']|["']$/g, '');
        if (!process.env[m[1]]) process.env[m[1]] = value;
      }
    } catch {
      /* file absent — fine */
    }
  }
}

loadEnv();

/**
 * Prefer the direct (unpooled) connection for schema changes.
 *
 * Neon's pooled endpoint and Supabase's pgBouncer run in transaction mode, which can
 * mishandle DDL. The application uses the pooled string; migrations use this one when
 * it is set, and fall back to DATABASE_URL when it is not.
 */
const MIGRATION_URL = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!MIGRATION_URL) {
  console.error(
    '\n  DATABASE_URL is not set.\n\n' +
      '  1. Copy .env.example to .env.local\n' +
      '  2. Paste your Postgres connection string into it\n' +
      '  3. Run this again\n\n' +
      '  The README section "Set up the database" has the click-by-click steps.\n',
  );
  process.exit(1);
}

const sql = postgres(MIGRATION_URL, { max: 1, prepare: false, ssl: 'require', onnotice: () => {} });

console.log(
  process.env.DATABASE_URL_UNPOOLED
    ? 'Using DATABASE_URL_UNPOOLED (direct connection).'
    : 'Using DATABASE_URL. If this hangs, set DATABASE_URL_UNPOOLED to the direct string.',
);

try {
  console.log('Applying db/schema.sql ...');
  await sql.unsafe(readFileSync(schemaPath, 'utf8'));

  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name
  `;
  console.log(`\nDone. ${tables.length} tables present:`);
  for (const t of tables) console.log(`  ${t.table_name}`);
  console.log('');
} catch (err) {
  console.error('\nMigration failed:', err.message, '\n');
  process.exitCode = 1;
} finally {
  await sql.end();
}
