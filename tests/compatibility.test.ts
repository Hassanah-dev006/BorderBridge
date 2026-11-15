import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

/**
 * NFR-CMP-01 — the device population Table 2.4 commits to.
 *
 * Without a declared target the build compiles for modern browsers and ships optional
 * chaining, which throws on Android 8's WebView. That is Chromium 61, and Android 8 is
 * the reference device in Table 2.3 — so the failure would land on exactly the handset
 * the product is designed for, as a blank screen rather than a degraded one.
 */
describe('browser targets are declared, not assumed', () => {
  const list = read('../.browserslistrc');
  const queries = list
    .split('\n')
    .map((line) => line.replace(/#.*$/, '').trim().toLowerCase())
    .filter(Boolean);

  test('the Android 8 floor is set', () => {
    // Chromium 61 is what Android 8.0 ships as its system WebView.
    assert.ok(
      queries.includes('chrome >= 61'),
      'no Chrome floor: the build will ship syntax Android 8 cannot parse',
    );
    assert.ok(queries.includes('android >= 8'));
  });

  test('the iOS 14 floor is set', () => {
    assert.ok(queries.includes('ios_saf >= 14'));
    assert.ok(queries.includes('safari >= 14'));
  });

  test('current and one prior major version of all four desktop browsers', () => {
    for (const browser of ['chrome', 'firefox', 'safari', 'edge']) {
      assert.ok(
        queries.includes(`last 2 ${browser} versions`),
        `${browser} is not covered by the current-plus-one obligation`,
      );
    }
  });

  test('the declaration is checked against the artefact, not just trusted', () => {
    // A browserslist file states an intention; scripts/check-targets.mjs reads the
    // built chunks and fails if any of them contain syntax above the floor. It is a
    // separate command because it needs a build — tsconfig's own `target` governs
    // type-level downlevelling and not the client bundle, so asserting on it here
    // would be a reassuring test of the wrong thing.
    const scripts = JSON.parse(read('../package.json')).scripts as Record<string, string>;
    assert.ok(scripts['verify:targets'], 'no verify:targets script');
    assert.match(scripts['verify:targets'], /check-targets/);

    const checker = read('../scripts/check-targets.mjs');
    assert.match(checker, /optional chaining/);
    assert.match(checker, /nullish coalescing/);
    // A checker that scans nothing and reports success is worse than no checker.
    assert.match(checker, /No chunks to scan/);
  });
});

/**
 * NFR-CMP-02 — "render and remain fully operable at viewport widths from 320 px".
 *
 * The phrase that does the work is *fully operable*. A table of cost figures clipped
 * by overflow-hidden still renders; the trader just cannot read the total. These
 * checks cover the two ways that happens in practice.
 */
describe('nothing is unreachable at 320 px', () => {
  const appDir = new URL('../src/app/', import.meta.url).pathname;

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      return statSync(full).isDirectory() ? walk(full) : full.endsWith('.tsx') ? [full] : [];
    });

  const screens = walk(appDir)
    // The print sheet is laid out for paper, where there is no viewport to overflow.
    .filter((f) => !f.includes('print'))
    .map((f) => ({ file: f.replace(appDir, ''), text: readFileSync(f, 'utf8') }));

  test('every table can be scrolled rather than clipped', () => {
    const clipped: string[] = [];
    for (const { file, text } of screens) {
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        if (!line.includes('<table')) return;
        const wrapper = lines.slice(Math.max(0, i - 3), i).join(' ');
        if (!wrapper.includes('overflow-x-auto')) clipped.push(`${file}:${i + 1}`);
      });
    }
    assert.deepEqual(
      clipped,
      [],
      `these tables would clip their contents on a narrow screen: ${clipped.join(', ')}`,
    );
  });

  test('no fixed pixel width exceeds the narrowest viewport', () => {
    // 320px minus the 16px gutters either side leaves 288.
    const tooWide: string[] = [];
    for (const { file, text } of screens) {
      for (const m of text.matchAll(/\b(?:min-)?w-\[(\d+)px\]/g)) {
        if (Number(m[1]) > 288) tooWide.push(`${file}: ${m[0]}`);
      }
    }
    assert.deepEqual(tooWide, [], tooWide.join(', '));
  });

  test('the horizontally scrolling nav is marked as such', () => {
    // Nine items cannot fit across 320px. The alternative to scrolling them is hiding
    // some, and a nav item a trader cannot find is worse than one they must swipe to.
    assert.match(read('../src/app/layout.tsx'), /overflow-x-auto/);
  });

  test('the screens were actually scanned', () => {
    assert.ok(screens.length >= 20, `only found ${screens.length} screens`);
  });
});
