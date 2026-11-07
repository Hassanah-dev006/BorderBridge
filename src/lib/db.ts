/**
 * Database connection.
 *
 * One pooled client, reused across requests. In a serverless deployment each
 * instance gets its own, which is why `max` is deliberately small and why
 * `prepare: false` is set — connection poolers such as Supabase's pgBouncer and
 * Neon's pooled endpoint reject prepared statements.
 *
 * Everything above this file talks to store.ts, never to `sql` directly, so the
 * data-access seam described in SRS NFR-CMP-05 still holds.
 */
import postgres from 'postgres';

declare global {
  // eslint-disable-next-line no-var
  var __bb_sql: ReturnType<typeof postgres> | undefined;
}

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and paste your ' +
        'Postgres connection string into it — see README, "Set up the database".',
    );
  }
  return url;
}

/**
 * Cached on globalThis so that Next.js hot reloading in development does not open a
 * new pool on every file change, which exhausts the free-tier connection limit.
 */
export function db() {
  if (!global.__bb_sql) {
    global.__bb_sql = postgres(connectionString(), {
      max: 3,
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false,
      ssl: 'require',
      onnotice: () => {},
    });
  }
  return global.__bb_sql;
}

/** True when a database is configured. Pages use it to show a helpful message instead of a stack trace. */
export function isConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
