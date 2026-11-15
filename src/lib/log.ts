/**
 * Structured logging (NFR-MNT-05).
 *
 * "The system shall emit structured, correlatable logs at appropriate severity levels,
 * excluding all personal data."
 *
 * The last four words are the hard part, and they are harder here than on most
 * products. Constraint C7 says the platform "must not be capable of reporting
 * individually attributable information about undeclared trade to any authority" —
 * and a log file is a report. A line reading
 *
 *     trader +250788123456 planned 400 kg of maize into Uganda at 04:12
 *
 * is exactly the record C7 forbids, sitting in a hosting provider's log retention
 * where nobody reviewed it and the trader never consented to it. So redaction here is
 * not hygiene; it is the constraint being enforced in the one place engineers
 * habitually forget.
 *
 * Three rules follow:
 *
 *  1. Nothing is logged unless it passes through `redact`. There is no raw path.
 *  2. A user is referred to by a keyed pseudonym, never by id or phone. The pseudonym
 *     is stable within a deployment, so one trader's requests can be followed through
 *     a log; it is not reversible without SESSION_SECRET, so the log alone identifies
 *     nobody.
 *  3. Free text is not logged at all. A border report's note, an enquiry message and a
 *     deletion reason are written by people about their own circumstances, and no
 *     amount of key-filtering makes a sentence safe.
 */
import { createHmac } from 'node:crypto';

export type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Below this, nothing is emitted. Production defaults to info. */
function threshold(): number {
  const configured = (process.env.LOG_LEVEL || '').toLowerCase();
  if (configured in ORDER) return ORDER[configured as Level];
  return process.env.NODE_ENV === 'production' ? ORDER.info : ORDER.debug;
}

function secret(): string {
  return process.env.SESSION_SECRET || 'bb-dev-secret-change-me';
}

/**
 * A stable, non-reversible stand-in for a person.
 *
 * Twelve base64url characters of an HMAC: enough that two different users will not
 * collide in any log volume this system will produce, short enough to read. Keyed, so
 * possession of the log does not let anyone rebuild the mapping — which matters
 * because logs leave the trust boundary (a hosting dashboard, a support ticket, a
 * screenshot) far more casually than a database does.
 */
export function subjectRef(userId: string | null | undefined): string {
  if (!userId) return 'anon';
  return createHmac('sha256', secret()).update(`subject:${userId}`).digest('base64url').slice(0, 12);
}

/** Keys whose value is personal data whatever it happens to contain. */
const FORBIDDEN_KEYS = [
  'phone', 'msisdn', 'mobile', 'tel',
  'password', 'passwordhash', 'hash', 'salt',
  'code', 'otp', 'token', 'session', 'sessionid', 'cookie', 'authorization',
  'name', 'displayname', 'businessname', 'contact', 'email', 'address',
  'userid', 'user_id', 'traderid', 'providerid', 'fromuserid', 'touserid',
];

/**
 * Keys whose value is free text written by a person.
 *
 * Dropped rather than redacted: a truncated sentence is still a sentence, and the
 * useful thing to log about a note is that there was one, not what it said.
 */
const FREE_TEXT_KEYS = [
  'note', 'message', 'reason', 'body', 'whatiswrong', 'response', 'comment', 'text',
];

/** Anything that looks like a phone number, wherever it appears in a string. */
const PHONE_SHAPED = /(?:\+|00)\d[\d\s().-]{7,}\d|\b0\d[\d\s().-]{7,}\d\b/g;

const REDACTED = '[redacted]';
const MAX_STRING = 200;
const MAX_DEPTH = 4;

function scrubString(value: string): string {
  const withoutPhones = value.replace(PHONE_SHAPED, REDACTED);
  return withoutPhones.length > MAX_STRING
    ? `${withoutPhones.slice(0, MAX_STRING)}…`
    : withoutPhones;
}

/**
 * Remove personal data from anything on its way to a log line.
 *
 * Deliberately allow-nothing-clever: unknown object shapes are walked, unknown key
 * names are kept but their string values scrubbed, and depth is bounded so a circular
 * or enormous structure cannot turn a log call into an outage.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > MAX_DEPTH) return '[deep]';

  if (typeof value === 'string') return scrubString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: scrubString(value.message) };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v) => redact(v, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (FORBIDDEN_KEYS.includes(lower)) {
        out[key] = REDACTED;
      } else if (FREE_TEXT_KEYS.includes(lower)) {
        // The fact of it, not the content of it.
        out[key] = typeof v === 'string' ? `[${v.length} chars]` : REDACTED;
      } else {
        out[key] = redact(v, depth + 1);
      }
    }
    return out;
  }
  return REDACTED;
}

export type LogFields = Record<string, unknown> & {
  /** Ties the lines of one request together. */
  correlationId?: string;
  /** From `subjectRef`. Never a user id. */
  subject?: string;
};

export type LogLine = {
  ts: string;
  level: Level;
  event: string;
  [key: string]: unknown;
};

/** Where lines go. Replaced in tests; stdout everywhere else. */
let sink: (line: LogLine) => void = (line) => {
  // One JSON object per line, which is what every log pipeline expects and what
  // "structured" means in the requirement.
  process.stdout.write(`${JSON.stringify(line)}\n`);
};

export function setSink(next: (line: LogLine) => void): void {
  sink = next;
}

export function resetSink(): void {
  sink = (line) => process.stdout.write(`${JSON.stringify(line)}\n`);
}

/**
 * `event` is a short stable name — "plan.generated", "rates.degraded" — not a
 * sentence. Sentences get edited; names get grepped.
 */
function emit(level: Level, event: string, fields: LogFields = {}): void {
  if (ORDER[level] < threshold()) return;

  const safe = redact(fields) as Record<string, unknown>;
  sink({ ts: new Date().toISOString(), level, event, ...safe });
}

export const log = {
  debug: (event: string, fields?: LogFields) => emit('debug', event, fields),
  info: (event: string, fields?: LogFields) => emit('info', event, fields),
  warn: (event: string, fields?: LogFields) => emit('warn', event, fields),
  error: (event: string, fields?: LogFields) => emit('error', event, fields),
};

/** A correlation id for one request, when the caller has nothing better. */
export function newCorrelationId(): string {
  return Math.random().toString(36).slice(2, 10);
}
