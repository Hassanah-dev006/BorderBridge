/**
 * Idempotency for actions taken offline (NFR-REL-03, §3.4).
 *
 * "Actions taken offline shall be queued locally and synchronised automatically when
 * connectivity is restored, without data loss and without duplicate submission. Each
 * queued action shall carry an idempotency key so that a retried request cannot be
 * applied twice."
 *
 * The requirement names the mechanism, and the mechanism is the hard part. Retrying is
 * easy; retrying *safely* is not, because the ambiguous case is the one that actually
 * happens. A trader submits a border report from the queue, the server writes it, and
 * the response is lost on the way back. The client cannot tell that from a request
 * that never arrived, so it retries — and without a key, the crossing now carries two
 * reports of the same queue from the same person, which is worse than carrying none.
 * FR-BRD-05 weights reports and averages them, so a duplicate does not merely clutter
 * a list; it moves a number other traders act on.
 *
 * The key is therefore generated on the client, before the first attempt, and reused
 * for every retry of that same action. A server that has seen the key returns what it
 * returned the first time, without doing the work again.
 *
 * What this deliberately does not do: deduplicate *different* submissions that happen
 * to look alike. Two traders reporting the same queue, or one trader reporting twice
 * an hour apart, are two facts. The key identifies an attempt, not a content hash.
 */
import { randomUUID } from 'node:crypto';

/** How long a key is remembered. Past this a retry is treated as a new action. */
export const KEY_RETENTION_HOURS = 48;

/**
 * Keys are opaque and client-generated.
 *
 * Length and alphabet are checked, not structure: a key the server can predict or
 * enumerate would let one user claim another's result, and a key the server parses is
 * a key the server has opinions about.
 */
const KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export function isValidKey(key: unknown): key is string {
  return typeof key === 'string' && KEY_PATTERN.test(key);
}

/** Used by the client; exported here so both sides agree on the shape. */
export function newKey(): string {
  return randomUUID().replace(/-/g, '');
}

export type Replay<T> =
  | { status: 'fresh'; result: T }
  | { status: 'replayed'; result: T }
  | { status: 'in-flight' };

/**
 * The outcome of an action, as remembered for a replay.
 *
 * Stored as the serialisable result rather than a redirect or a rendered page, because
 * what the second caller needs is the answer, not a repeat of the side effects.
 */
export type StoredOutcome = {
  key: string;
  userId: string | null;
  action: string;
  result: unknown;
  createdAt: string;
};

export function isExpired(outcome: StoredOutcome, now: Date = new Date()): boolean {
  const age = now.getTime() - new Date(outcome.createdAt).getTime();
  return !(age < KEY_RETENTION_HOURS * 3_600_000);
}

/**
 * Whether a stored outcome may be replayed to this caller.
 *
 * A key is a bearer token for a result. If one user could present another user's key
 * and receive their result, the mechanism built to prevent duplicate border reports
 * would have become a way to read someone else's data — so the owner is checked, and
 * a mismatch is treated as a key that does not exist rather than as an error that
 * confirms one does.
 */
export function mayReplay(
  outcome: StoredOutcome,
  userId: string | null,
  action: string,
  now: Date = new Date(),
): boolean {
  if (isExpired(outcome, now)) return false;
  if (outcome.action !== action) return false;
  return outcome.userId === userId;
}
