/**
 * Unit tests for reporting (FR-RPT-02).
 *
 * The question this module answers is uncomfortable on purpose: how often was the
 * estimate wrong, in which direction, and which rules were in the room when it was.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  outcomeOf, accuracyReport, biasLabel, confidenceCaveat, MEANINGFUL_SAMPLE,
} from '../src/lib/reporting';
import type { CostOutcome, Shipment } from '../src/lib/types';

/** Only planSnapshot.cost and .product are read, so the rest is stubbed. */
const shipment = (estimated: number, ruleIds: string[], unverified = false): Shipment =>
  ({
    id: `s-${estimated}-${ruleIds.join('')}`,
    userId: 'u1', corridorId: 'RW-UG', productId: 'coffee-green',
    quantity: 200, declaredValue: 1400, currency: 'USD',
    status: 'delivered', createdAt: '2026-10-01T00:00:00Z',
    planSnapshot: {
      product: { name: 'Coffee, green (unroasted)' },
      hasUnverifiedContent: unverified,
      cost: {
        totalUsd: estimated,
        confidencePercent: unverified ? 20 : 12,
        lines: ruleIds.map((id) => ({ ruleId: id })),
      },
    } as Shipment['planSnapshot'],
  }) as Shipment;

const outcome = (estimated: number, actual: number, ruleIds: string[] = ['R1'], unverified = false): CostOutcome =>
  outcomeOf(shipment(estimated, ruleIds, unverified), actual, '2026-11-01T00:00:00Z');

describe('one outcome', () => {
  test('an under-estimate is positive — the trader paid more than they were told', () => {
    const o = outcome(100, 125);
    assert.ok(o.variancePercent > 0);
    assert.equal(Math.round(o.variancePercent), 20);
  });

  test('an over-estimate is negative', () => {
    const o = outcome(125, 100);
    assert.ok(o.variancePercent < 0);
    assert.equal(Math.round(o.variancePercent), -25);
  });

  test('an exact estimate is zero', () => {
    assert.equal(outcome(100, 100).variancePercent, 0);
  });

  test('the rules behind the estimate are carried through for attribution', () => {
    assert.deepEqual(outcome(100, 110, ['R1', 'R2']).ruleIds, ['R1', 'R2']);
  });

  test('a cost line with no rule — the goods themselves — is not attributed', () => {
    const s = shipment(100, []);
    (s.planSnapshot.cost.lines as unknown[]).push({ ruleId: null });
    assert.equal(outcomeOf(s, 110, '2026-11-01T00:00:00Z').ruleIds.length, 0);
  });

  test('a zero actual does not divide by zero', () => {
    assert.equal(outcome(100, 0).variancePercent, 0);
  });
});

describe('the report across outcomes', () => {
  test('no outcomes gives nulls, not zeroes', () => {
    const r = accuracyReport([]);
    assert.equal(r.count, 0);
    assert.equal(r.meanAbsolutePercent, null);
    assert.equal(r.biasPercent, null, 'zero would read as “we are accurate”, which is a lie');
  });

  test('mean error ignores direction; bias keeps it', () => {
    const r = accuracyReport([outcome(100, 120), outcome(100, 83.33)]);
    assert.ok(r.meanAbsolutePercent! > 15, 'both missed by about 20%');
    assert.ok(Math.abs(r.biasPercent!) < 2, 'but in opposite directions, so no net bias');
  });

  test('a consistent under-estimate shows as positive bias', () => {
    const r = accuracyReport([outcome(100, 120), outcome(200, 240), outcome(50, 60)]);
    assert.ok(r.biasPercent! > 10);
    assert.match(biasLabel(r.biasPercent), /under-estimating/i);
    assert.match(biasLabel(r.biasPercent), /pay more than they are told/i);
  });

  test('the stated confidence range is the band each outcome is judged against', () => {
    const r = accuracyReport([
      outcome(100, 105),                    // 4.8% off, verified plan, ±12% — inside
      outcome(100, 118),                    // 15% off, verified plan, ±12% — outside
      outcome(100, 118, ['R1'], true),      // 15% off, unverified plan, ±20% — inside
    ]);
    assert.equal(r.withinConfidence, 2);
  });

  test('outcomes are ordered worst first', () => {
    const r = accuracyReport([outcome(100, 102), outcome(100, 150), outcome(100, 110)]);
    assert.ok(Math.abs(r.outcomes[0].variancePercent) > Math.abs(r.outcomes[1].variancePercent));
  });

  test('rules are ranked by the error of the estimates they appear in', () => {
    const r = accuracyReport([
      outcome(100, 101, ['GOOD']),
      outcome(100, 180, ['BAD']),
    ]);
    assert.equal(r.suspectRules[0].ruleId, 'BAD');
  });

  test('a rule counted once per estimate, however many lines it produced', () => {
    const r = accuracyReport([outcome(100, 150, ['R1', 'R1', 'R1'])]);
    assert.equal(r.suspectRules[0].appearances, 1);
  });
});

describe('honesty about the sample', () => {
  test('no outcomes says so plainly', () => {
    assert.match(confidenceCaveat(0)!, /no trader has recorded/i);
  });

  test('a thin sample is called anecdote, not measurement', () => {
    assert.match(confidenceCaveat(2)!, /anecdote, not measurement/i);
  });

  test('past the threshold, no caveat is shown', () => {
    assert.equal(confidenceCaveat(MEANINGFUL_SAMPLE), null);
  });

  test('a bias too small to mean anything is not dressed up as a finding', () => {
    assert.match(biasLabel(0.4), /no consistent direction/i);
  });
});
