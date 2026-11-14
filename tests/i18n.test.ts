/**
 * Unit tests for language selection (FR-LOC-01).
 *
 * The behaviour that matters most is the fallback: a trader who picks Kinyarwanda
 * and meets an untranslated string should see English, never an empty box or a
 * key. The second thing that matters is that the coverage figure shown to them is
 * measured rather than claimed.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  t, translator, coverage, isLanguage, languageName, LANGUAGES, DICT, needsReview,
} from '../src/lib/i18n';

describe('translation and fallback', () => {
  test('a translated key returns that language', () => {
    assert.equal(t('nav.plan', 'fr'), 'Planifier');
    assert.equal(t('nav.plan', 'sw'), 'Panga');
  });

  test('an untranslated key falls back to English, not to nothing', () => {
    // 'plan.qualifies' has no Kinyarwanda entry on purpose: customs wording stays
    // in English until a fluent speaker has reviewed it.
    assert.equal(t('plan.qualifies', 'rw'), DICT['plan.qualifies'].en);
    assert.ok(t('plan.qualifies', 'rw').length > 0);
  });

  test('an unknown key returns the key, so a mistake is visible', () => {
    assert.equal(t('nav.doesNotExist', 'en'), 'nav.doesNotExist');
  });

  test('English is always complete by definition', () => {
    for (const key of Object.keys(DICT)) {
      assert.ok(DICT[key].en && DICT[key].en.length > 0, `${key} has no English`);
    }
  });

  test('variables are substituted', () => {
    assert.match(t('home.titleNamed', 'en', { name: 'Grace' }), /Grace/);
  });

  test('a variable with no value is left visible rather than rendered blank', () => {
    assert.match(t('home.titleNamed', 'en'), /\{name\}/);
  });

  test('a bound translator behaves like t with that language', () => {
    const tr = translator('fr');
    assert.equal(tr('nav.shipments'), t('nav.shipments', 'fr'));
  });
});

describe('coverage is measured, not claimed', () => {
  test('English is 100%', () => {
    assert.equal(coverage('en').percent, 100);
  });

  test('every other language is between 0 and 100', () => {
    for (const l of LANGUAGES.filter((x) => x.code !== 'en')) {
      const c = coverage(l.code);
      assert.ok(c.percent >= 0 && c.percent <= 100, `${l.code} reports ${c.percent}%`);
      assert.equal(c.total, Object.keys(DICT).length);
    }
  });

  test('the count matches the dictionary, so the figure cannot drift', () => {
    const fr = coverage('fr');
    const counted = Object.keys(DICT).filter((k) => DICT[k].fr !== undefined).length;
    assert.equal(fr.translated, counted);
  });

  test('French carries the regulatory wording', () => {
    // If this fails, French has quietly become a partial language and the page
    // that tells users so needs updating.
    assert.ok(DICT['plan.notBinding'].fr, 'the limitation statement must exist in French');
    assert.ok(DICT['plan.qualifies'].fr, 'the eligibility wording must exist in French');
  });

  test('the languages needing review are named, and English is not among them', () => {
    assert.ok(needsReview.includes('sw'));
    assert.ok(needsReview.includes('rw'));
    assert.ok(!needsReview.includes('en'));
    assert.ok(!needsReview.includes('fr'));
  });
});

describe('language codes', () => {
  test('the four the SRS names are accepted', () => {
    for (const code of ['en', 'fr', 'sw', 'rw']) assert.equal(isLanguage(code), true);
  });

  test('anything else is refused', () => {
    assert.equal(isLanguage('de'), false);
    assert.equal(isLanguage(''), false);
    assert.equal(isLanguage(undefined), false);
    assert.equal(isLanguage(null), false);
  });

  test('each language is named in its own language', () => {
    assert.equal(languageName('fr'), 'Français');
    assert.equal(languageName('rw'), 'Ikinyarwanda');
  });
});
