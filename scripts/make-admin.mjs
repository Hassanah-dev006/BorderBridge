/**
 * Promotes an account to administrator.
 *
 *   npm run db:admin -- 0788123456
 *   npm run db:admin -- +250788123456
 *
 * There is deliberately no self-service route to the admin role in the interface —
 * FR-ACC-06 has administrators verifying other people's accounts, so the role cannot
 * be something anyone can award themselves. This script is the intended way to create
 * the first one, and it runs against whatever database DATABASE_URL points at.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import postgres from 'postgres';

const here = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  if (process.env.DATABASE_URL) return;
  for (const file of ['.env.local', '.env']) {
    try {
      for (const line of readFileSync(join(here, '..', file), 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    } catch {
      /* absent — fine */
    }
  }
}

/** Same rule as src/lib/auth.ts, so a local 07… number resolves identically. */
function normalisePhone(raw, defaultCountry = '250') {
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.startsWith('250') || digits.startsWith('256')) return `+${digits}`;
  if (digits.startsWith('0')) return `+${defaultCountry}${digits.slice(1)}`;
  return `+${defaultCountry}${digits}`;
}

loadEnv();

const input = process.argv[2];
const role = process.argv[3] ?? 'admin';

if (!input) {
  console.error('\n  Usage:  npm run db:admin -- <phone number> [role]\n');
  console.error('  Examples:');
  console.error('    npm run db:admin -- 0788123456');
  console.error('    npm run db:admin -- +256700000000 provider');
  console.error('    npm run db:admin -- 0788123456 trader      (to demote again)\n');
  process.exit(1);
}

if (!['admin', 'provider', 'trader'].includes(role)) {
  console.error(`\n  Unknown role "${role}". Choose admin, provider or trader.\n`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('\n  DATABASE_URL is not set. Create .env.local first — see the README.\n');
  process.exit(1);
}

const phone = normalisePhone(input);
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, ssl: 'require', onnotice: () => {} });

try {
  const rows = await sql`
    UPDATE users SET role = ${role} WHERE phone = ${phone}
    RETURNING display_name, phone, role
  `;

  if (rows.length === 0) {
    console.error(`\n  No account found for ${phone}.`);
    const all = await sql`SELECT phone, display_name, role FROM users ORDER BY created_at`;
    if (all.length === 0) {
      console.error('  There are no accounts at all yet — register one on the site first.\n');
    } else {
      console.error('\n  Registered accounts:');
      for (const u of all) console.error(`    ${u.phone}  ${u.display_name}  (${u.role})`);
      console.error('');
    }
    process.exitCode = 1;
  } else {
    const u = rows[0];
    console.log(`\n  ${u.display_name} (${u.phone}) is now a ${u.role}.`);
    console.log('  Sign out and back in on the site for the change to take effect.\n');
  }
} catch (err) {
  console.error('\n  Failed:', err.message, '\n');
  process.exitCode = 1;
} finally {
  await sql.end();
}
