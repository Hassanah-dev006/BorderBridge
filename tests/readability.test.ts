import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DICT } from '../src/lib/i18n';
import {
  MAX_GRADE,
  MEASURABLE_FROM_WORDS,
  countSyllables,
  gradeLevel,
  isMeasurable,
  unexplainedHardWords,
  words,
} from '../src/lib/readability';

describe('the measure itself', () => {
  test('syllables are counted the way they are spoken, near enough', () => {
    assert.equal(countSyllables('the'), 1);
    assert.equal(countSyllables('border'), 2);
    assert.equal(countSyllables('customs'), 2);
    assert.equal(countSyllables('certificate'), 4);
  });

  test('a silent terminal e does not count', () => {
    assert.equal(countSyllables('made'), 1);
    assert.equal(countSyllables('rate'), 1);
  });

  test('a word is never worth zero syllables', () => {
    assert.ok(countSyllables('rhythm') >= 1);
  });

  test('placeholders are not read aloud', () => {
    // {name} is substituted at runtime, so counting it would score a string that does
    // not exist.
    assert.deepEqual(words('Hello {name} there'), ['Hello', 'there']);
  });

  test('short plain text scores low and long official text scores high', () => {
    const plain = 'Tell us what you are moving. We will tell you what it needs and what it costs.';
    const official =
      'Notwithstanding the aforementioned provisions, the determination of applicable ' +
      'tariff classifications remains subject to administrative reconsideration.';
    assert.ok(gradeLevel(plain) < gradeLevel(official) - 4);
  });

  test('a label is not long enough to score meaningfully', () => {
    assert.equal(isMeasurable('Sign in'), false);
    assert.equal(
      isMeasurable('This is an estimate and not a decision made by any customs authority at all'),
      true,
    );
  });

  test('a proper noun is not counted as a hard word', () => {
    // Kinyarwanda cannot be simplified. Flagging it would teach the reader of this
    // report to ignore it.
    assert.deepEqual(unexplainedHardWords('Shown in Kinyarwanda and Kiswahili'), []);
  });

  test('a term of art that the product explains is allowed', () => {
    assert.deepEqual(unexplainedHardWords('You need a phytosanitary certificate'), []);
  });

  test('officialese is flagged', () => {
    assert.ok(unexplainedHardWords('This is unfortunately unavoidable').length > 0);
  });
});

/**
 * NFR-USA-03, as a gate rather than an intention.
 *
 * Interface copy drifts towards the language of the domain it describes, one well-meant
 * edit at a time. Nobody writes a grade-11 sentence on purpose; they add a clause to an
 * existing one. A measurement in the test suite is the only thing that reliably holds
 * the line, and it caught five strings on its first run, the worst at grade 11.7.
 *
 * Only English is checked here. Flesch–Kincaid is calibrated on English, and the
 * French, Kiswahili and Kinyarwanda halves of the requirement need a fluent reader —
 * which is the verification method the SRS names for those, and is not something a
 * test can stand in for.
 */
describe('trader-facing English reads at grade 9 or below', () => {
  const measurable = Object.entries(DICT).filter(([, entry]) => isMeasurable(entry.en));

  test('there is something to measure', () => {
    assert.ok(measurable.length >= 4, 'no dictionary strings were long enough to score');
  });

  for (const [key, entry] of measurable) {
    test(`${key} — grade ${gradeLevel(entry.en)}`, () => {
      assert.ok(
        gradeLevel(entry.en) <= MAX_GRADE,
        `"${entry.en.slice(0, 70)}…" reads at grade ${gradeLevel(entry.en)}`,
      );
    });
  }
});

describe('prose written straight into the screens reads at grade 9 or below', () => {
  // Most of the explanatory writing lives in the components rather than the
  // dictionary, so checking only DICT would pass while the pages drifted.
  const appDir = new URL('../src/app/', import.meta.url).pathname;

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      return statSync(full).isDirectory() ? walk(full) : full.endsWith('.tsx') ? [full] : [];
    });

  /** JSX text nodes: what sits between tags, with no braces, so no expressions. */
  const prose = (source: string): string[] =>
    [...source.matchAll(/>([^<>{}]{40,})</g)]
      .map((m) => m[1].replace(/\s+/g, ' ').trim())
      .filter((t) => words(t).length >= MEASURABLE_FROM_WORDS);

  const passages = walk(appDir)
    // The administrative surface is excluded, and the requirement is the reason:
    // NFR-USA-03 governs trader-facing text. Table 2.3 gives administrators high
    // technical expertise and training on the domain, and §3.1 makes their interface
    // a separate desktop-oriented surface. Simplifying "estimate-accuracy variance by
    // corridor" for them would cost precision and buy nothing. Transport providers and
    // buyers are in scope: Table 2.3 puts their expertise at low to medium.
    .filter((file) => !file.includes('/admin/'))
    .flatMap((file) =>
      prose(readFileSync(file, 'utf8')).map((text) => ({ file: file.replace(appDir, ''), text })),
    );

  test('the screens were actually scanned', () => {
    assert.ok(passages.length >= 15, `only found ${passages.length} passages of prose`);
  });

  test('every passage is within the bound', () => {
    const tooHard = passages
      .map((p) => ({ ...p, grade: gradeLevel(p.text) }))
      .filter((p) => p.grade > MAX_GRADE)
      .map((p) => `${p.file} (grade ${p.grade}): ${p.text.slice(0, 60)}…`);

    assert.deepEqual(tooHard, [], `\n${tooHard.join('\n')}`);
  });
});
