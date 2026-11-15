import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { log, redact, resetSink, setSink, subjectRef, type LogLine } from '../src/lib/log';

let lines: LogLine[] = [];

beforeEach(() => {
  lines = [];
  setSink((line) => lines.push(line));
  process.env.LOG_LEVEL = 'debug';
});

afterEach(() => {
  resetSink();
  delete process.env.LOG_LEVEL;
});

describe('the shape of a line', () => {
  test('one JSON object with a timestamp, a level and an event name', () => {
    log.info('plan.generated', { corridorId: 'rw-ug', durationMs: 42 });
    assert.equal(lines.length, 1);
    assert.equal(lines[0].level, 'info');
    assert.equal(lines[0].event, 'plan.generated');
    assert.equal(lines[0].corridorId, 'rw-ug');
    assert.equal(lines[0].durationMs, 42);
    assert.ok(!Number.isNaN(Date.parse(lines[0].ts)));
  });

  test('severity is honoured', () => {
    process.env.LOG_LEVEL = 'warn';
    log.debug('a'); log.info('b'); log.warn('c'); log.error('d');
    assert.deepEqual(lines.map((l) => l.event), ['c', 'd']);
  });

  test('lines from one request can be tied together', () => {
    log.info('plan.started', { correlationId: 'abc123' });
    log.info('plan.finished', { correlationId: 'abc123' });
    assert.deepEqual(lines.map((l) => l.correlationId), ['abc123', 'abc123']);
  });
});

/**
 * NFR-MNT-05 says "excluding all personal data", and constraint C7 says the system
 * "must not be capable of reporting individually attributable information about
 * undeclared trade to any authority".
 *
 * A log file is a report. These tests are C7 being enforced in the place engineers
 * habitually forget.
 */
describe('nothing personal reaches a log line', () => {
  test('a phone number is removed even from an unknown key', () => {
    log.info('otp.sent', { somethingNobodyNamed: 'sent to +250788123456 at 04:12' });
    assert.match(JSON.stringify(lines[0]), /\[redacted\]/);
    assert.ok(!JSON.stringify(lines[0]).includes('788123456'));
  });

  test('phone shapes in several formats are all caught', () => {
    for (const phone of [
      '+250788123456',
      '+250 788 123 456',
      '00256772000111',
      '0788123456',
      '+250-788-123-456',
    ]) {
      const out = JSON.stringify(redact({ free: `call ${phone} now` }));
      assert.ok(!/\d{6}/.test(out), `${phone} survived as ${out}`);
    }
  });

  test('a credential never appears, whatever it is called', () => {
    const out = redact({
      password: 'hunter2', passwordHash: 'scrypt$...', token: 'abc',
      code: '481920', sessionId: 's_123', cookie: 'bb=1',
    }) as Record<string, string>;
    for (const v of Object.values(out)) assert.equal(v, '[redacted]');
  });

  test('a name or business name is not an acceptable log field', () => {
    const out = redact({ displayName: 'Hassanat Bello', businessName: 'Bello Trading' });
    assert.deepEqual(out, { displayName: '[redacted]', businessName: '[redacted]' });
  });

  test('a user id is not logged, because a pseudonymous id is still personal data', () => {
    const out = redact({ userId: 'usr_01HX', traderId: 'usr_02HY' }) as Record<string, string>;
    assert.equal(out.userId, '[redacted]');
    assert.equal(out.traderId, '[redacted]');
  });

  test('free text is reduced to the fact that it existed', () => {
    // A border report's note, an enquiry, a deletion reason: written by people about
    // their own circumstances. Truncating a sentence still leaves a sentence.
    const out = redact({ note: 'Queue is long, officer asking for extra' }) as Record<string, string>;
    assert.equal(out.note, '[39 chars]');
  });

  test('nested structures are walked, not trusted', () => {
    const out = JSON.stringify(redact({ shipment: { trader: { phone: '+250788123456' } } }));
    assert.ok(!out.includes('788123456'));
  });

  test('an Error keeps its name and loses anything personal in its message', () => {
    const out = redact(new Error('could not notify +250788123456')) as { name: string; message: string };
    assert.equal(out.name, 'Error');
    assert.ok(!out.message.includes('788123456'));
  });
});

describe('a log call can never become an outage', () => {
  test('a circular structure is bounded rather than thrown on', () => {
    const a: Record<string, unknown> = { level1: {} };
    (a.level1 as Record<string, unknown>).back = a;
    assert.doesNotThrow(() => log.info('deep', a));
    assert.ok(JSON.stringify(lines[0]).includes('[deep]'));
  });

  test('a huge array is truncated', () => {
    const out = redact({ items: Array.from({ length: 500 }, (_, i) => i) }) as { items: number[] };
    assert.equal(out.items.length, 20);
  });

  test('a huge string is truncated', () => {
    const out = redact({ blob: 'x'.repeat(5000) }) as { blob: string };
    assert.ok(out.blob.length <= 201);
  });
});

describe('following one trader through a log without identifying them', () => {
  test('the same user gives the same reference', () => {
    assert.equal(subjectRef('usr_1'), subjectRef('usr_1'));
  });

  test('different users give different references', () => {
    assert.notEqual(subjectRef('usr_1'), subjectRef('usr_2'));
  });

  test('the reference does not contain the id it stands for', () => {
    assert.ok(!subjectRef('usr_distinctive').includes('distinctive'));
  });

  test('a signed-out request is marked rather than invented', () => {
    assert.equal(subjectRef(null), 'anon');
    assert.equal(subjectRef(undefined), 'anon');
  });

  test('the reference is short enough to read', () => {
    assert.equal(subjectRef('usr_1').length, 12);
  });

  test('a subject reference passes redaction, unlike a user id', () => {
    // The whole point: correlatable, not identifying.
    const out = redact({ subject: subjectRef('usr_1') }) as Record<string, string>;
    assert.equal(out.subject, subjectRef('usr_1'));
  });
});
