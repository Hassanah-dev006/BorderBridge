import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_RATE_AGE_HOURS,
  fetchRateTable,
  rateNotice,
  resolveRates,
  validateRateTable,
  type RateTable,
} from '../src/lib/rates';

const CURATED: RateTable = {
  base: 'USD',
  rates: { USD: 1, RWF: 1310, UGX: 3720, KES: 129 },
  retrievedAt: '2026-11-14T06:00:00Z',
};

const NEEDED = ['USD', 'RWF', 'UGX'];
const NOW = new Date('2026-11-15T12:00:00Z');

/** A fetcher that behaves however the test needs it to. */
const respondWith = (body: unknown, ok = true): typeof fetch =>
  (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

const failWith = (error: Error): typeof fetch =>
  (async () => {
    throw error;
  }) as unknown as typeof fetch;

describe('validating what a source hands back', () => {
  test('a good payload is accepted', () => {
    const result = validateRateTable(
      { base: 'USD', rates: { USD: 1, RWF: 1300, UGX: 3700 }, retrievedAt: '2026-11-15T11:00:00Z' },
      NEEDED,
    );
    assert.equal(result.ok, true);
  });

  test('a missing currency is refused rather than half-used', () => {
    // Taking what is there and falling back for the rest would build one total from
    // two different moments in the market.
    const result = validateRateTable({ base: 'USD', rates: { USD: 1, RWF: 1300 } }, NEEDED);
    assert.deepEqual(result, { ok: false, reason: 'missing-currency' });
  });

  test('a zero or negative rate is refused', () => {
    assert.deepEqual(
      validateRateTable({ base: 'USD', rates: { USD: 1, RWF: 0, UGX: 3700 } }, NEEDED),
      { ok: false, reason: 'implausible-rate' },
    );
    assert.deepEqual(
      validateRateTable({ base: 'USD', rates: { USD: 1, RWF: -1310, UGX: 3700 } }, NEEDED),
      { ok: false, reason: 'implausible-rate' },
    );
  });

  test('a rate that is not a number at all is refused', () => {
    assert.deepEqual(
      validateRateTable({ base: 'USD', rates: { USD: 1, RWF: '1310', UGX: 3700 } }, NEEDED),
      { ok: false, reason: 'implausible-rate' },
    );
    assert.deepEqual(
      validateRateTable({ base: 'USD', rates: { USD: 1, RWF: NaN, UGX: 3700 } }, NEEDED),
      { ok: false, reason: 'implausible-rate' },
    );
  });

  test('a rate far outside any real currency is refused', () => {
    // The realistic failure is a source returning an index or a timestamp in the rate
    // field, not an attack.
    assert.deepEqual(
      validateRateTable({ base: 'USD', rates: { USD: 1, RWF: 1e9, UGX: 3700 } }, NEEDED),
      { ok: false, reason: 'implausible-rate' },
    );
  });

  test('a payload that is not an object, or has no base, is refused', () => {
    assert.deepEqual(validateRateTable(null, NEEDED), { ok: false, reason: 'malformed' });
    assert.deepEqual(validateRateTable('rates', NEEDED), { ok: false, reason: 'malformed' });
    assert.deepEqual(validateRateTable({ rates: { USD: 1 } }, NEEDED), {
      ok: false,
      reason: 'malformed',
    });
  });

  test('a missing or unreadable timestamp is stamped now rather than refused', () => {
    // The rates are valid; only their provenance is vague. Refusing them would mean
    // using an older table for a weaker reason.
    const result = validateRateTable({ base: 'USD', rates: { USD: 1, RWF: 1300, UGX: 3700 } }, NEEDED);
    assert.equal(result.ok, true);
    if (result.ok) assert.ok(!Number.isNaN(Date.parse(result.table.retrievedAt)));
  });
});

/**
 * NFR-REL-04 — "Fault injection on each external adapter."
 *
 * Each of these is a way the source actually fails in the field, and in every one of
 * them the trader still gets an estimate.
 */
describe('fault injection: every failure still produces an estimate', () => {
  test('the network is unreachable', async () => {
    const live = await fetchRateTable({
      url: 'https://rates.example/latest',
      required: NEEDED,
      fetcher: failWith(new Error('getaddrinfo ENOTFOUND')),
    });
    assert.deepEqual(live, { ok: false, reason: 'unreachable' });

    const resolved = resolveRates(live, CURATED, NOW);
    assert.equal(resolved.source, 'curated');
    assert.equal(resolved.degraded, true);
    assert.equal(resolved.table.rates.RWF, 1310);
  });

  test('the source hangs and the request is abandoned', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    const live = await fetchRateTable({
      url: 'https://rates.example/latest',
      required: NEEDED,
      fetcher: failWith(abort),
      timeoutMs: 5,
    });
    assert.deepEqual(live, { ok: false, reason: 'timed-out' });
    assert.equal(resolveRates(live, CURATED, NOW).source, 'curated');
  });

  test('the source answers with an error status', async () => {
    const live = await fetchRateTable({
      url: 'https://rates.example/latest',
      required: NEEDED,
      fetcher: respondWith({ message: 'quota exceeded' }, false),
    });
    assert.deepEqual(live, { ok: false, reason: 'rejected-by-source' });
  });

  test('the source answers with something that is not a rate table', async () => {
    const live = await fetchRateTable({
      url: 'https://rates.example/latest',
      required: NEEDED,
      fetcher: respondWith('<html>502 Bad Gateway</html>'),
    });
    assert.deepEqual(live, { ok: false, reason: 'malformed' });
  });

  test('the source answers with a corrupt rate', async () => {
    const live = await fetchRateTable({
      url: 'https://rates.example/latest',
      required: NEEDED,
      fetcher: respondWith({ base: 'USD', rates: { USD: 1, RWF: 0, UGX: 3700 } }),
    });
    assert.deepEqual(live, { ok: false, reason: 'implausible-rate' });

    // The point of the whole module: a confident wrong number never reaches the trader.
    assert.equal(resolveRates(live, CURATED, NOW).table.rates.RWF, 1310);
  });

  test('a working source is used, and is not reported as degraded', async () => {
    const live = await fetchRateTable({
      url: 'https://rates.example/latest',
      required: NEEDED,
      fetcher: respondWith({
        base: 'USD',
        rates: { USD: 1, RWF: 1295, UGX: 3690 },
        retrievedAt: '2026-11-15T11:30:00Z',
      }),
    });
    const resolved = resolveRates(live, CURATED, NOW);
    assert.equal(resolved.source, 'live');
    assert.equal(resolved.degraded, false);
    assert.equal(resolved.stale, false);
    assert.equal(resolved.table.rates.RWF, 1295);
  });

  test('no configured source is a designed state, not a fault', async () => {
    // Constraint C8 asks for an adapter over a curated dataset. In this release the
    // curated dataset is the source, and saying "degraded" would be a false alarm.
    const live = await fetchRateTable({ required: NEEDED });
    assert.deepEqual(live, { ok: false, reason: 'not-configured' });
    assert.equal(resolveRates(live, CURATED, NOW).degraded, false);
  });

  test('the adapter never throws, whatever the fetcher does', async () => {
    const live = await fetchRateTable({
      url: 'https://rates.example/latest',
      required: NEEDED,
      fetcher: (() => {
        throw new Error('synchronous explosion');
      }) as unknown as typeof fetch,
    });
    assert.equal(live.ok, false);
  });
});

describe('age is computed and surfaced (NFR-ACC-03)', () => {
  test('a table within 24 hours is not stale', () => {
    const resolved = resolveRates({ ok: false, reason: 'not-configured' }, CURATED, NOW);
    assert.equal(resolved.ageHours, 30); // 14 Nov 06:00 → 15 Nov 12:00
    assert.ok(resolved.ageHours > MAX_RATE_AGE_HOURS);
    assert.equal(resolved.stale, true);
  });

  test('a fresh table is not flagged', () => {
    const fresh = { ...CURATED, retrievedAt: '2026-11-15T06:00:00Z' };
    const resolved = resolveRates({ ok: false, reason: 'not-configured' }, fresh, NOW);
    assert.equal(resolved.ageHours, 6);
    assert.equal(resolved.stale, false);
  });

  test('a clock running backwards does not produce a negative age', () => {
    const future = { ...CURATED, retrievedAt: '2026-11-16T00:00:00Z' };
    assert.equal(resolveRates({ ok: false, reason: 'not-configured' }, future, NOW).ageHours, 0);
  });
});

describe('what the trader is told', () => {
  test('nothing, when the rate is live and fresh', () => {
    const live = { ok: true as const, table: { ...CURATED, retrievedAt: NOW.toISOString() } };
    assert.equal(rateNotice(resolveRates(live, CURATED, NOW)), null);
  });

  test('a failed source is described without naming the failure', () => {
    const notice = rateNotice(resolveRates({ ok: false, reason: 'rejected-by-source' }, CURATED, NOW));
    assert.ok(notice);
    assert.match(notice!, /could not be reached/);
    assert.ok(!/rejected-by-source|HTTP|JSON|502/.test(notice!));
  });

  test('a stale saved rate says how old it is', () => {
    const old = { ...CURATED, retrievedAt: '2026-11-12T12:00:00Z' };
    const notice = rateNotice(resolveRates({ ok: false, reason: 'not-configured' }, old, NOW));
    assert.match(notice!, /3 days ago/);
  });

  test('the wording is singular for one hour and one day', () => {
    const anHour = { ...CURATED, retrievedAt: '2026-11-15T11:00:00Z' };
    assert.match(
      rateNotice({ ...resolveRates({ ok: false, reason: 'not-configured' }, anHour, NOW), stale: true })!,
      /1 hour ago/,
    );
    const aDay = { ...CURATED, retrievedAt: '2026-11-14T11:00:00Z' };
    assert.match(rateNotice(resolveRates({ ok: false, reason: 'not-configured' }, aDay, NOW))!, /1 day ago/);
  });
});
