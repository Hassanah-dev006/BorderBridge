import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  KEY_RETENTION_HOURS,
  isExpired,
  isValidKey,
  mayReplay,
  newKey,
  type StoredOutcome,
} from '../src/lib/idempotency';

const outcome = (over: Partial<StoredOutcome> = {}): StoredOutcome => ({
  key: newKey(),
  userId: 'usr_1',
  action: 'border-report',
  result: { id: 'rpt_1' },
  createdAt: '2026-11-15T12:00:00Z',
  ...over,
});

describe('the key itself', () => {
  test('a generated key is accepted', () => {
    assert.equal(isValidKey(newKey()), true);
  });

  test('two keys are not the same key', () => {
    assert.notEqual(newKey(), newKey());
  });

  test('a key short enough to guess is refused', () => {
    // The key is a bearer token for a result. A guessable one lets a stranger claim
    // somebody else's.
    assert.equal(isValidKey('abc'), false);
    assert.equal(isValidKey('1'.repeat(15)), false);
    assert.equal(isValidKey('1'.repeat(16)), true);
  });

  test('a key carrying anything but the permitted alphabet is refused', () => {
    assert.equal(isValidKey('../../etc/passwd--------'), false);
    assert.equal(isValidKey('key with spaces in it!!!'), false);
    assert.equal(isValidKey(null), false);
    assert.equal(isValidKey(12345678901234567890), false);
  });

  test('an absurdly long key is refused rather than stored', () => {
    assert.equal(isValidKey('a'.repeat(1000)), false);
  });
});

describe('when a stored outcome may be replayed', () => {
  const now = new Date('2026-11-15T13:00:00Z');

  test('the same user retrying the same action gets their result back', () => {
    assert.equal(mayReplay(outcome(), 'usr_1', 'border-report', now), true);
  });

  test('a different user presenting the key gets nothing', () => {
    // Otherwise the mechanism built to prevent duplicate reports becomes a way to
    // read another trader's data.
    assert.equal(mayReplay(outcome(), 'usr_2', 'border-report', now), false);
  });

  test('a signed-out caller cannot claim a signed-in result', () => {
    assert.equal(mayReplay(outcome(), null, 'border-report', now), false);
  });

  test('the same key against a different action is refused', () => {
    // A key identifies one attempt at one thing. Honouring it across actions would
    // let a replayed report silently stand in for a shipment transition.
    assert.equal(mayReplay(outcome(), 'usr_1', 'shipment-transition', now), false);
  });

  test('an anonymous action can be replayed by an anonymous caller', () => {
    // Reporting incorrect content is open to signed-out users on purpose.
    const anon = outcome({ userId: null, action: 'content-report' });
    assert.equal(mayReplay(anon, null, 'content-report', now), true);
  });
});

describe('how long a key is remembered', () => {
  test('within the window it still replays', () => {
    const now = new Date('2026-11-16T11:00:00Z'); // 47 hours later
    assert.equal(isExpired(outcome(), now), false);
    assert.equal(mayReplay(outcome(), 'usr_1', 'border-report', now), true);
  });

  test('past the window it does not', () => {
    const now = new Date('2026-11-17T13:00:00Z'); // 49 hours later
    assert.equal(isExpired(outcome(), now), true);
    assert.equal(mayReplay(outcome(), 'usr_1', 'border-report', now), false);
  });

  test('the window is the one the module declares', () => {
    const edge = new Date(Date.parse('2026-11-15T12:00:00Z') + KEY_RETENTION_HOURS * 3_600_000);
    assert.equal(isExpired(outcome(), edge), true);
  });

  test('an unreadable timestamp is treated as expired, not as fresh', () => {
    // Fresh would mean replaying a result of unknown age; expired means doing the
    // work again, which is the recoverable mistake of the two.
    assert.equal(isExpired(outcome({ createdAt: 'nonsense' })), true);
  });
});

describe('the pieces that have to agree across the stack', () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

  test('the database, not a read-then-write, is what prevents the duplicate', () => {
    // Checking for a key and then inserting leaves a window, and the window is widest
    // exactly when it matters: a queue of retries arriving together the moment a
    // trader regains signal.
    const store = read('../src/lib/store.ts');
    assert.match(store, /ON CONFLICT \(key\) DO NOTHING/);
    assert.match(store, /RETURNING key/);
  });

  test('a failed action releases its key', () => {
    // Otherwise one failure becomes a permanent refusal to accept that action.
    assert.match(
      read('../src/lib/store.ts'),
      /DELETE FROM idempotency_keys WHERE key = \$\{key\} AND completed_at IS NULL/,
    );
  });

  test('the schema can tell a finished action from one in flight', () => {
    assert.match(read('../db/schema.sql'), /completed_at TIMESTAMPTZ/);
    assert.match(read('../db/schema.sql'), /CREATE TABLE IF NOT EXISTS idempotency_keys/);
  });

  test('the worker queues only what carries a key', () => {
    const sw = read('../public/sw.js');
    assert.match(sw, /X-Idempotency-Key/);
    assert.match(sw, /if \(!key\) return false/);
  });

  test('the worker never stores a cookie with a queued request', () => {
    // A credential in IndexedDB outlives the session it belongs to.
    assert.match(read('../public/sw.js'), /name\.toLowerCase\(\) === 'cookie'/);
  });

  test('a refusal is not retried forever', () => {
    // 4xx means the server understood and declined. A queue that retries a refusal
    // never drains.
    assert.match(read('../public/sw.js'), /status >= 400 && response\.status < 500/);
  });

  test('the flush does not depend on a feature half the devices lack', () => {
    // Table 2.4 commits to Safari, which has no Background Sync.
    assert.match(read('../public/sw.js'), /flush-outbox/);
    assert.match(read('../src/app/offline-status.tsx'), /flush-outbox/);
  });
});
