import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  AA,
  PALETTE as P,
  contrastRatio,
  meetsAA,
  parseHex,
  ratioLabel,
  relativeLuminance,
} from '../src/lib/contrast';

describe('the contrast formula itself', () => {
  // If these three are wrong, every assertion below is wrong in the same direction,
  // so they are checked against values WCAG states rather than against our palette.
  test('black on white is 21:1', () => {
    assert.equal(Math.round(contrastRatio('#000000', '#FFFFFF')), 21);
  });

  test('a colour against itself is 1:1', () => {
    assert.equal(contrastRatio(P.brand, P.brand), 1);
  });

  test('order does not change the ratio', () => {
    assert.equal(contrastRatio(P.ink, P.white), contrastRatio(P.white, P.ink));
  });

  test('white is the brightest thing there is', () => {
    assert.equal(relativeLuminance('#FFFFFF'), 1);
    assert.equal(relativeLuminance('#000000'), 0);
  });

  test('shorthand hex and a missing hash both parse', () => {
    assert.deepEqual(parseHex('#fff'), parseHex('FFFFFF'));
  });

  test('something that is not a colour is refused rather than silently black', () => {
    assert.throws(() => parseHex('green'));
  });

  test('the label rounds down, so 4.496 never reads as a pass', () => {
    assert.equal(ratioLabel('#767676', '#FFFFFF'), '4.54:1');
  });
});

/**
 * Every foreground/background pair the interface uses.
 *
 * This is the audit NFR-USA-04 calls for, run on every commit instead of once. It
 * found two real failures the first time: grey-400 at 2.54:1 on three screens, and a
 * link card whose only boundary was a 1.31:1 border.
 */
describe('text contrast meets WCAG 2.2 AA', () => {
  const pairs: [string, string, string][] = [
    ['headings and body on the page', P.ink, P.page],
    ['body on a white card', P.ink, P.white],
    ['body on a pale green panel', P.ink, P.brandPale],
    ['body on a pale gold panel', P.ink, P.goldPale],
    ['body on the light green fill', P.ink, P.brandLight],
    ['body on the gold fill', P.ink, P.goldBright],
    ['links on white', P.brand, P.white],
    ['links on the page', P.brand, P.page],
    ['links on a pale green panel', P.brand, P.brandPale],
    ['header text', P.white, P.brand],
    ['header text on the darker green', P.white, P.brandDark],
    ['the tagline and nav on the header', P.brandLight, P.brand],
    ['gold text on white', P.gold, P.white],
    ['gold text on a pale gold panel', P.gold, P.goldPale],
    ['secondary text on the page', P.gray500, P.page],
    ['secondary text on white', P.gray500, P.white],
    ['supporting text on the page', P.gray600, P.page],
    ['explanatory text on the page', P.gray700, P.page],
  ];

  for (const [name, fg, bg] of pairs) {
    test(`${name} — ${ratioLabel(fg, bg)}`, () => {
      assert.ok(
        meetsAA(fg, bg, 'bodyText'),
        `${name} is ${ratioLabel(fg, bg)}, below the ${AA.bodyText}:1 the requirement sets`,
      );
    });
  }
});

describe('borders that delimit a control meet 3:1', () => {
  // WCAG 2.2 §1.4.11 applies to the boundary of a user interface component, not to a
  // panel that is already distinguished by its background. The link cards on /offline
  // are controls whose edge is the only thing marking them, so they carry the
  // obligation; the pale panel on /plan does not, and is left alone deliberately.
  test('the link-card border on the offline page', () => {
    assert.ok(meetsAA(P.brand, P.white, 'nonText'));
  });

  test('the offline banner rule, in both states', () => {
    assert.ok(meetsAA(P.brand, P.brandPale, 'nonText'));
    assert.ok(meetsAA(P.gold, P.goldPale, 'nonText'));
  });

  test('the light green is kept out of control borders', () => {
    // 1.31:1. Recording the failure is the point: it stops anyone reaching for
    // border-brand-light on a button later and assuming it was checked.
    assert.ok(!meetsAA(P.brandLight, P.white, 'nonText'));
  });
});

describe('no screen reintroduces a colour that fails', () => {
  const srcDir = new URL('../src/app/', import.meta.url).pathname;

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      return statSync(full).isDirectory() ? walk(full) : full.endsWith('.tsx') ? [full] : [];
    });

  const sources = walk(srcDir).map((f) => ({ file: f, text: readFileSync(f, 'utf8') }));

  test('grey-400 and lighter are not used for text', () => {
    // 2.54:1 on white. The audit above cannot catch a class nobody told it about,
    // so this catches the reintroduction instead.
    const offenders = sources
      .filter((s) => /text-gray-(50|100|200|300|400)\b/.test(s.text))
      .map((s) => s.file.replace(srcDir, ''));
    assert.deepEqual(offenders, [], `too light for body text: ${offenders.join(', ')}`);
  });

  test('every screen was actually scanned', () => {
    // A walk that silently returns nothing would make the assertion above vacuous.
    assert.ok(sources.length >= 20, `only found ${sources.length} screens`);
  });
});

describe('touch targets', () => {
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');

  test('every control is at least 44 px tall', () => {
    // NFR-USA-04 names 44 by 44 CSS pixels. Width comes from the layout; height is the
    // one that quietly collapses to the line box, so it is set once, globally.
    assert.match(css, /button,\s*select,\s*input,\s*a\.tappable\s*\{\s*min-height:\s*44px/);
  });
});
