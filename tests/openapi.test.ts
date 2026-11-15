import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const spec = readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8');
const appDir = new URL('../src/app/', import.meta.url).pathname;

/** Route handlers are the public API; pages are not. */
function routeHandlers(dir: string, prefix = ''): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return routeHandlers(full, `${prefix}/${entry}`);
    return entry === 'route.ts' ? [prefix || '/'] : [];
  });
}

const handlers = routeHandlers(appDir);

/** Paths declared in the spec, read without pulling in a YAML parser. */
function declaredPaths(): string[] {
  const start = spec.indexOf('\npaths:');
  assert.ok(start !== -1, 'the spec declares no paths');
  const after = spec.slice(start + 1);
  const end = after.search(/\ncomponents:/);
  const section = end === -1 ? after : after.slice(0, end);
  return [...section.matchAll(/^ {2}(\/\S*):/gm)].map((m) => m[1]);
}

const documented = declaredPaths();

/**
 * NFR-MNT-04 — "kept current with the implementation".
 *
 * That phrase is the requirement; everything else about an API document is optional.
 * A specification that drifts is worse than none, because a consumer trusts it. So
 * the two lists are compared here rather than by anyone's discipline.
 */
describe('the spec and the implementation agree', () => {
  test('there is something to compare', () => {
    assert.ok(handlers.length > 0, 'no route handlers found — the walk is broken');
    assert.ok(documented.length > 0, 'no paths parsed out of openapi.yaml');
  });

  test('every route handler in the application is documented', () => {
    const missing = handlers.filter((h) => !documented.includes(h));
    assert.deepEqual(missing, [], `undocumented endpoints: ${missing.join(', ')}`);
  });

  test('every documented path exists as a handler', () => {
    // The direction that catches a deleted endpoint, which is the one that strands a
    // consumer calling something that no longer answers.
    const phantom = documented.filter((p) => !handlers.includes(p));
    assert.deepEqual(phantom, [], `documented but not implemented: ${phantom.join(', ')}`);
  });
});

describe('the spec says the things a consumer has to know', () => {
  // YAML wraps long descriptions, so a phrase that reads as one line in the file may
  // be split across two. Matching the raw text would make these assertions fail on a
  // reflow rather than on a change of meaning.
  const prose = spec.replace(/\s+/g, ' ');

  test('it is a valid-looking OpenAPI 3 document', () => {
    assert.match(spec, /^openapi: 3\.\d+\.\d+/m);
    assert.match(spec, /^info:/m);
  });

  test('it states why server actions are not in it', () => {
    // An API document that silently omits most of the application reads as incomplete
    // rather than as scoped. Saying what is excluded, and why, is the difference.
    assert.match(spec, /server actions/i);
  });

  test('the USSD callback documents the 182-septet limit', () => {
    // A consumer who does not know this will send something the network truncates
    // mid-word, and will not be able to tell that it happened.
    assert.match(spec, /182/);
    assert.match(spec, /CON/);
    assert.match(spec, /END/);
  });

  test('the USSD callback documents that it always returns 200', () => {
    // An aggregator treats a non-200 as a failed session and shows a network error
    // instead of the message, so this is not an implementation detail.
    assert.match(spec, /Always 200/);
  });

  test('the research extract documents the suppression rule, not just the format', () => {
    assert.match(prose, /fewer than five distinct traders/);
    assert.match(prose, /subtracting the published rows/);
  });

  test('the administrative endpoint documents 404 rather than 403, and why', () => {
    assert.match(prose, /A 403 would confirm/);
  });

  test('the limitation statement is in the description, not only in the code', () => {
    assert.match(prose, /binding determinations/);
  });
});
