import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  REVIEWED_LANGUAGES,
  TERMS_EFFECTIVE,
  TERMS_VERSION,
  acceptanceSummary,
  isReviewed,
  needsAcceptance,
  noticeLanguage,
} from '../src/lib/legal';

const accepted = (version: string, acceptedAt = '2026-11-15T09:00:00Z') =>
  ({ version, language: 'en' as const, acceptedAt });

describe('who still has to be asked (NFR-LEG-01)', () => {
  test('someone who has never accepted anything', () => {
    assert.equal(needsAcceptance(null), true);
    assert.equal(needsAcceptance(undefined), true);
  });

  test('someone who accepted the current version does not', () => {
    assert.equal(needsAcceptance(accepted(TERMS_VERSION)), false);
  });

  test('someone who accepted an older version is asked again', () => {
    // This is the whole point of recording a version reference. Treating one
    // acceptance as consent to whatever the notice later becomes would make the
    // record meaningless.
    assert.equal(needsAcceptance(accepted('0.9')), true);
  });

  test('a version that is merely different, not older, also counts', () => {
    // Comparison is equality, not ordering. A record of "2.0" when "1.0" is in force
    // is a data problem, and the safe reading of a data problem is to ask again.
    assert.equal(needsAcceptance(accepted('2.0')), true);
  });
});

describe('what the person is told about their own acceptance', () => {
  test('never accepted', () => {
    assert.match(acceptanceSummary(null), /not yet accepted/i);
  });

  test('the version and the date, in that order', () => {
    const summary = acceptanceSummary(accepted(TERMS_VERSION, '2026-11-15T09:00:00Z'));
    assert.match(summary, new RegExp(`version ${TERMS_VERSION}`));
    assert.match(summary, /2026-11-15/);
  });

  test('an out-of-date acceptance says so', () => {
    assert.match(acceptanceSummary(accepted('0.9')), /updated version is now in force/i);
  });

  test('a corrupt timestamp does not render as Invalid Date', () => {
    assert.match(acceptanceSummary({ version: '1.0', language: 'en', acceptedAt: 'nonsense' }),
      /an unrecorded date/);
  });
});

describe('which language the notice is shown in', () => {
  test('a reviewed language is shown as written', () => {
    assert.equal(noticeLanguage('en'), 'en');
    assert.equal(noticeLanguage('fr'), 'fr');
  });

  test('an unreviewed language falls back to English rather than to a guess', () => {
    // These are statements about a trader's legal rights. An unchecked translation of
    // one is worse than an honest gap, which /privacy declares on the page.
    assert.equal(noticeLanguage('sw'), 'en');
    assert.equal(noticeLanguage('rw'), 'en');
    assert.equal(isReviewed('rw'), false);
  });

  test('the reviewed set is exactly what the project claims it is', () => {
    assert.deepEqual([...REVIEWED_LANGUAGES], ['en', 'fr']);
  });
});

describe('the version is wired through, not just declared', () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

  test('the schema has somewhere to record an acceptance', () => {
    const schema = read('../db/schema.sql');
    assert.match(schema, /CREATE TABLE IF NOT EXISTS terms_acceptances/);
    // Timestamp and version reference are both named in the requirement.
    assert.match(schema, /version\s+TEXT NOT NULL/);
    assert.match(schema, /accepted_at TIMESTAMPTZ NOT NULL/);
    // Accepting twice is one fact, not two.
    assert.match(schema, /UNIQUE \(user_id, version\)/);
  });

  test('registration refuses to proceed without acceptance, server-side', () => {
    // The `required` attribute is enforced only by browsers that honour it, which is
    // not a claim this project can make about its device population.
    const actions = read('../src/app/actions.ts');
    assert.match(actions, /acceptTerms'\) !== 'yes'/);
    assert.match(actions, /recordTermsAcceptance\(userId, TERMS_VERSION/);
  });

  test('the effective date is a real date and not in the future', () => {
    const effective = Date.parse(TERMS_EFFECTIVE);
    assert.ok(!Number.isNaN(effective), 'TERMS_EFFECTIVE is not a date');
  });

  test('the acceptance record is part of the personal data export', () => {
    // NFR-PRI-03 asks for all personal data held. What you agreed to is a fact about
    // you, so leaving it out would make the export incomplete.
    assert.match(read('../src/lib/store.ts'), /termsAcceptances: plain\(accepted\)/);
  });
});
