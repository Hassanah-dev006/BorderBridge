import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_GROUP,
  aggregate,
  isSuppressed,
  riskReport,
  suppress,
  toCsv,
  type Record_,
} from '../src/lib/research';

/** n records from n distinct traders in one cell. */
const cell = (corridor: string, product: string, traders: number, cost = 100): Record_[] =>
  Array.from({ length: traders }, (_, i) => ({
    subjectId: `${corridor}-${product}-trader-${i}`,
    dimensions: { corridor, product },
    measures: { costUsd: cost },
  }));

describe('aggregating', () => {
  test('counts distinct subjects, not rows', () => {
    // One trader crossing eight times is one trader. Counting rows would let a single
    // person's history pass a threshold meant to describe a population.
    const records: Record_[] = Array.from({ length: 8 }, () => ({
      subjectId: 'trader-1',
      dimensions: { corridor: 'rw-ug', product: 'maize' },
      measures: { costUsd: 50 },
    }));
    const [only] = aggregate(records, ['corridor', 'product']);
    assert.equal(only.subjects, 1);
    assert.equal(only.observations, 8);
  });

  test('measures are averaged, never summed', () => {
    // A sum plus a count gives the average anyway, and an average over a small group
    // with one outlier identifies the outlier.
    const records = [
      { subjectId: 'a', dimensions: { corridor: 'rw-ug' }, measures: { costUsd: 100 } },
      { subjectId: 'b', dimensions: { corridor: 'rw-ug' }, measures: { costUsd: 200 } },
    ];
    assert.equal(aggregate(records, ['corridor'])[0].measures.costUsd, 150);
  });

  test('a measure missing from every row is null rather than zero', () => {
    const [only] = aggregate(
      [{ subjectId: 'a', dimensions: { corridor: 'rw-ug' }, measures: {} }],
      ['corridor'],
    );
    assert.deepEqual(only.measures, {});
  });
});

describe('primary suppression', () => {
  const cells = () =>
    aggregate([...cell('rw-ug', 'maize', 9), ...cell('rw-ug', 'beans', 3)], ['corridor', 'product']);

  test('a group below the minimum is suppressed', () => {
    const out = suppress(cells(), 'product');
    const beans = out.find((c) => c.dimensions.product === 'beans')!;
    assert.equal(beans.suppressedBecause, 'below-threshold');
    assert.equal(beans.measures.costUsd, null);
  });

  test('a group at exactly the minimum is published', () => {
    const out = suppress(aggregate([...cell('rw-ug', 'maize', MIN_GROUP)], ['corridor', 'product']), 'product');
    assert.equal(isSuppressed(out[0]), false);
  });
});

/**
 * The failure that defeats naive suppression.
 *
 * Publish four rows and a total, suppress the fifth, and the reader subtracts. These
 * tests are the reason the module does a second pass.
 */
describe('complementary suppression — the subtraction attack', () => {
  test('a lone suppressed cell forces a second suppression', () => {
    const cells = aggregate(
      [...cell('rw-ug', 'maize', 9), ...cell('rw-ug', 'beans', 3), ...cell('rw-ug', 'rice', 7)],
      ['corridor', 'product'],
    );
    const out = suppress(cells, 'product');

    const hidden = out.filter(isSuppressed);
    assert.equal(hidden.length, 2, 'one suppressed cell can be recovered by subtraction');
    assert.deepEqual(
      hidden.map((c) => c.suppressedBecause).sort(),
      ['below-threshold', 'complementary'],
    );
  });

  test('the second suppression takes the smallest published cell', () => {
    // It costs the researcher least and carries the most disclosure risk of what
    // remains, so it does double duty.
    const cells = aggregate(
      [...cell('rw-ug', 'maize', 20), ...cell('rw-ug', 'beans', 2), ...cell('rw-ug', 'rice', 6)],
      ['corridor', 'product'],
    );
    const out = suppress(cells, 'product');
    const rice = out.find((c) => c.dimensions.product === 'rice')!;
    const maize = out.find((c) => c.dimensions.product === 'maize')!;
    assert.equal(rice.suppressedBecause, 'complementary');
    assert.equal(isSuppressed(maize), false);
  });

  test('two already-suppressed cells need no third', () => {
    const cells = aggregate(
      [...cell('rw-ug', 'maize', 9), ...cell('rw-ug', 'beans', 3), ...cell('rw-ug', 'rice', 2)],
      ['corridor', 'product'],
    );
    const out = suppress(cells, 'product');
    assert.equal(out.filter(isSuppressed).length, 2);
  });

  test('suppression does not leak across unrelated groups', () => {
    // A small cell on one corridor must not cost a cell on another corridor, which
    // nobody could have used to recover it.
    const cells = aggregate(
      [
        ...cell('rw-ug', 'maize', 9), ...cell('rw-ug', 'beans', 3),
        ...cell('ug-rw', 'maize', 11), ...cell('ug-rw', 'beans', 8),
      ],
      ['corridor', 'product'],
    );
    const out = suppress(cells, 'product');
    const ugrw = out.filter((c) => c.dimensions.corridor === 'ug-rw');
    assert.deepEqual(ugrw.map(isSuppressed), [false, false]);
  });
});

describe('the risk report', () => {
  test('a clean release is reported safe', () => {
    const out = suppress(
      aggregate([...cell('rw-ug', 'maize', 9), ...cell('rw-ug', 'beans', 8)], ['corridor', 'product']),
      'product',
    );
    const report = riskReport(out);
    assert.equal(report.safe, true);
    assert.equal(report.published, 2);
    assert.equal(report.smallestPublishedGroup, 8);
  });

  test('a cell that is one trader\'s history is flagged even when it passes the count', () => {
    // Six traders, one of whom crossed two hundred times. The count says population;
    // the ratio says behaviour.
    const records: Record_[] = [
      ...Array.from({ length: 200 }, (_, i) => ({
        subjectId: 'trader-busy',
        dimensions: { corridor: 'rw-ug', product: 'maize' },
        measures: { costUsd: 90 + i },
      })),
      ...cell('rw-ug', 'maize', 5),
    ];
    const out = suppress(aggregate(records, ['corridor', 'product']), 'product');
    const report = riskReport(out);
    assert.equal(report.safe, false);
    assert.match(report.warnings.join(' '), /describes behaviour, not a population/);
  });

  test('one survivor among many suppressed is flagged', () => {
    const out = suppress(
      aggregate(
        [...cell('rw-ug', 'maize', 9), ...cell('rw-ug', 'beans', 2), ...cell('rw-ug', 'rice', 2)],
        ['corridor', 'product'],
      ),
      'product',
    );
    // beans and rice suppressed as below-threshold; maize survives alone.
    const report = riskReport(out);
    assert.equal(report.published, 1);
    assert.match(report.warnings.join(' '), /nearly as much/);
  });

  test('an unsuppressed set is reported unsafe rather than released', () => {
    const report = riskReport(aggregate([...cell('rw-ug', 'beans', 2)], ['corridor', 'product']));
    assert.equal(report.safe, false);
    assert.match(report.warnings.join(' '), /below the minimum/);
  });
});

describe('the file a researcher receives', () => {
  const out = suppress(
    aggregate([...cell('rw-ug', 'maize', 9), ...cell('rw-ug', 'beans', 3)], ['corridor', 'product']),
    'product',
  );
  const csv = toCsv(out, ['corridor', 'product']);

  test('no suppressed value appears anywhere in it', () => {
    assert.ok(!/,3,/.test(csv), 'the suppressed subject count leaked into the file');
  });

  test('a suppressed cell says so rather than being left empty', () => {
    // An empty cell reads as zero. A reader who takes a suppressed group for an
    // absent one has been misled by the file, not protected by it.
    assert.match(csv, /suppressed: below-threshold/);
    assert.ok(!/,,/.test(csv), 'an empty cell would be read as zero');
  });

  test('the header names every dimension and measure', () => {
    assert.match(csv.split('\n')[0], /^corridor,product,subjects,observations,costUsd,status$/);
  });

  test('a value containing a comma cannot break the file', () => {
    const tricky = toCsv(
      suppress(
        aggregate(
          Array.from({ length: 9 }, (_, i) => ({
            subjectId: `t${i}`,
            dimensions: { corridor: 'Rwanda, Uganda', product: 'maize' },
            measures: { costUsd: 10 },
          })),
          ['corridor', 'product'],
        ),
        'product',
      ),
      ['corridor', 'product'],
    );
    assert.match(tricky, /"Rwanda, Uganda"/);
  });
});
