import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CACHE_VERSION,
  NEVER_CACHE,
  OFFLINE_READABLE,
  OFFLINE_FALLBACK,
  cacheAgeLabel,
  isCacheablePage,
  isImmutableAsset,
  isStale,
  normalisePath,
  pageCacheKey,
} from '../src/lib/offline';

describe('what may be stored on the device', () => {
  test('the pages NFR-REL-02 names are cacheable', () => {
    for (const path of OFFLINE_READABLE) {
      assert.equal(isCacheablePage(path), true, `${path} should be readable offline`);
    }
  });

  test('a page carrying a credential or a one-time code is never stored', () => {
    for (const path of ['/login', '/register', '/verify', '/recover']) {
      assert.equal(isCacheablePage(path), false, `${path} must not be cached`);
    }
  });

  test('the personal data export is never stored', () => {
    // Everything the system holds about one person, on a phone that may be shared.
    assert.equal(isCacheablePage('/privacy/export'), false);
    // The notice itself is harmless and should be readable offline.
    assert.equal(isCacheablePage('/privacy'), true);
  });

  test('a forbidden path stays forbidden with a trailing slash or a query string', () => {
    assert.equal(isCacheablePage('/verify/'), false);
    assert.equal(isCacheablePage('/privacy/export/'), false);
    assert.equal(isCacheablePage('/login?next=%2Fplan'), false);
  });

  test('a path that merely starts with the same letters is not caught', () => {
    // /registered-traders is not /register, and a prefix match alone would say it was.
    assert.equal(isCacheablePage('/registered-traders'), true);
  });

  test('a shipment detail page is cacheable', () => {
    assert.equal(isCacheablePage('/shipments/abc123'), true);
  });

  test('the fallback page is not stored as an ordinary page', () => {
    // It is precached under its own key at install; storing it again as a normal
    // navigation would let it shadow the page the trader actually asked for.
    assert.equal(isCacheablePage(OFFLINE_FALLBACK), false);
  });

  test('build assets are recognised, application paths are not', () => {
    assert.equal(isImmutableAsset('/_next/static/chunks/main.js'), true);
    assert.equal(isImmutableAsset('/plan'), false);
  });
});

describe('path normalisation', () => {
  test('drops the query and the fragment', () => {
    assert.equal(normalisePath('/plan?corridor=rw-ug#cost'), '/plan');
  });

  test('drops a trailing slash but keeps the root', () => {
    assert.equal(normalisePath('/shipments/'), '/shipments');
    assert.equal(normalisePath('/'), '/');
  });
});

describe('what a stored page is filed under', () => {
  test('a document and its React payload cannot answer each other', () => {
    assert.notEqual(pageCacheKey('/plan', false), pageCacheKey('/plan', true));
  });

  test('a flash message in the query string is not part of the identity', () => {
    // Otherwise a trader opening /report offline could be shown "thank you, your
    // report was received" for a report that was never sent.
    assert.equal(pageCacheKey('/report?thanks=1'), pageCacheKey('/report'));
    assert.equal(pageCacheKey('/report?error=Pick%20a%20crossing'), '/report');
  });

  test('the build-specific payload parameter does not multiply entries', () => {
    assert.equal(pageCacheKey('/plan?_rsc=a1b2c3', true), pageCacheKey('/plan?_rsc=z9y8x7', true));
  });

  test('different pages keep different keys', () => {
    assert.notEqual(pageCacheKey('/plan'), pageCacheKey('/shipments'));
  });
});

describe('the age shown on a cached page', () => {
  const at = (iso: string) => new Date(iso);
  const base = at('2026-11-15T12:00:00Z');

  test('under a minute reads as moments ago', () => {
    assert.equal(cacheAgeLabel(at('2026-11-15T11:59:30Z'), base), 'moments ago');
  });

  test('minutes and hours are singular when there is one of them', () => {
    assert.equal(cacheAgeLabel(at('2026-11-15T11:59:00Z'), base), '1 minute ago');
    assert.equal(cacheAgeLabel(at('2026-11-15T11:00:00Z'), base), '1 hour ago');
    assert.equal(cacheAgeLabel(at('2026-11-15T11:40:00Z'), base), '20 minutes ago');
    assert.equal(cacheAgeLabel(at('2026-11-15T09:00:00Z'), base), '3 hours ago');
  });

  test('past a day it counts days', () => {
    assert.equal(cacheAgeLabel(at('2026-11-13T12:00:00Z'), base), '2 days ago');
    assert.equal(cacheAgeLabel(at('2026-11-14T11:00:00Z'), base), '1 day ago');
  });

  test('a device clock running fast does not produce a page loaded in the future', () => {
    assert.equal(cacheAgeLabel(at('2026-11-15T15:00:00Z'), base), 'moments ago');
  });

  test('an unreadable timestamp says so rather than showing NaN', () => {
    assert.equal(cacheAgeLabel('not a date', base), 'at an unknown time');
  });
});

describe('when cached content is old enough to warn about', () => {
  const base = new Date('2026-11-15T12:00:00Z');

  test('within the border-report window it is not flagged', () => {
    assert.equal(isStale(new Date('2026-11-15T01:30:00Z'), base), false);
  });

  test('past twelve hours it is', () => {
    // The same window FR-BRD-05 uses to expire a report: past it, the most volatile
    // thing on the page is certainly out of date.
    assert.equal(isStale(new Date('2026-11-14T23:00:00Z'), base), true);
  });

  test('an unreadable timestamp is treated as stale', () => {
    assert.equal(isStale('not a date', base), true);
  });
});

describe('the service worker mirrors the policy', () => {
  const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

  const arrayIn = (name: string): string[] => {
    const match = sw.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`));
    assert.ok(match, `public/sw.js does not declare ${name}`);
    return match![1]
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  };

  // The worker cannot import the TypeScript module, so the lists exist twice. These
  // assertions are the reason that is safe: a change to one without the other fails
  // the build rather than quietly shipping two different policies.
  test('the never-cache list is identical', () => {
    assert.deepEqual(arrayIn('NEVER_CACHE'), [...NEVER_CACHE]);
  });

  test('the offline-readable list is identical', () => {
    assert.deepEqual(arrayIn('OFFLINE_READABLE'), [...OFFLINE_READABLE]);
  });

  test('the cache version is identical', () => {
    const match = sw.match(/const CACHE_VERSION = '([^']+)'/);
    assert.ok(match, 'public/sw.js does not declare CACHE_VERSION');
    assert.equal(match![1], CACHE_VERSION);
  });

  test('the worker never caches a write', () => {
    assert.ok(
      /request\.method !== 'GET'/.test(sw),
      'the worker must return early for anything that is not a GET',
    );
  });

  test('the worker files pages by key rather than by raw request', () => {
    // Caching the request itself would key on the full URL, reintroducing every
    // problem pageCacheKey exists to prevent.
    assert.ok(/function cacheKey\(/.test(sw), 'public/sw.js must define cacheKey');
    assert.ok(/__bb=rsc/.test(sw), 'public/sw.js must separate payloads from documents');
    assert.ok(
      /cache\.put\(key, response\.clone\(\)\)/.test(sw),
      'a page must be stored under cacheKey, not under the raw request',
    );
  });
});
