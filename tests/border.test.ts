/**
 * Unit tests for the border service.
 *
 * The SRS states FR-BRD-01 and FR-BRD-05 as conditions with explicit thresholds, so
 * these tests assert against the same numbers the document states. A fixed clock is
 * injected throughout, so nothing here depends on when it runs.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  REPORT_WINDOW_HOURS, RANKING_WINDOW_HOURS,
  reportWeight, isExpired, weightedReports, meanWaitMinutes,
  aggregateStatus, rankCrossings, listCrossings,
} from '../src/lib/border';
import type { BorderReport } from '../src/lib/types';

const NOW = new Date('2026-10-22T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const mk = (id: string, crossingId: string, waitMinutes: number, h: number): BorderReport => ({
  id, crossingId, category: 'busy', waitMinutes, reportedAt: hoursAgo(h), note: '',
});

describe('FR-BRD-05 decay and expiry of stale reports', () => {
  test('a report submitted now carries full weight', () => {
    assert.equal(reportWeight(mk('a', 'GATUNA', 60, 0), NOW), 1);
  });

  test('weight falls linearly — half the window is half the weight', () => {
    const w = reportWeight(mk('a', 'GATUNA', 60, REPORT_WINDOW_HOURS / 2), NOW);
    assert.ok(Math.abs(w - 0.5) < 1e-9, `expected 0.5, got ${w}`);
  });

  test('weight reaches zero exactly at the twelve-hour boundary', () => {
    assert.equal(reportWeight(mk('a', 'GATUNA', 60, REPORT_WINDOW_HOURS), NOW), 0);
  });

  test('a report at or past the window is expired', () => {
    assert.equal(isExpired(mk('a', 'GATUNA', 60, 11.9), NOW), false);
    assert.equal(isExpired(mk('a', 'GATUNA', 60, 12), NOW), true);
    assert.equal(isExpired(mk('a', 'GATUNA', 60, 20), NOW), true);
  });

  test('expired reports are returned but flagged, not silently dropped', () => {
    const all = [mk('fresh', 'GATUNA', 30, 1), mk('stale', 'GATUNA', 300, 20)];
    const w = weightedReports('GATUNA', NOW, all);
    assert.equal(w.length, 2, 'both are returned');
    assert.equal(w.find((r) => r.id === 'stale')!.expired, true);
    assert.equal(w.find((r) => r.id === 'fresh')!.expired, false);
  });

  test('an expired report does not influence the mean', () => {
    const all = [mk('fresh', 'GATUNA', 30, 1), mk('stale', 'GATUNA', 600, 20)];
    const mean = meanWaitMinutes('GATUNA', NOW, all);
    assert.equal(mean, 30, 'the 600-minute stale report must not drag the mean up');
  });
});

describe('FR-BRD-01 criterion 2 — mean reported waiting time', () => {
  test('only reports inside the six-hour ranking window count', () => {
    const all = [mk('in', 'GATUNA', 60, 2), mk('out', 'GATUNA', 240, 8)];
    assert.equal(meanWaitMinutes('GATUNA', NOW, all), 60);
  });

  test('a fresher report weighs more than an older one', () => {
    const all = [mk('new', 'GATUNA', 30, 0), mk('old', 'GATUNA', 90, 5)];
    const mean = meanWaitMinutes('GATUNA', NOW, all)!;
    assert.ok(mean < 60, `weighted mean ${mean} should sit below the unweighted 60`);
  });

  test('no current report yields null, not zero', () => {
    assert.equal(meanWaitMinutes('GATUNA', NOW, [mk('old', 'GATUNA', 60, 20)]), null);
  });

  test('aggregate status is derived from the weighted mean', () => {
    assert.equal(aggregateStatus('GATUNA', NOW, [mk('a', 'GATUNA', 20, 1)]), 'normal');
    assert.equal(aggregateStatus('GATUNA', NOW, [mk('a', 'GATUNA', 90, 1)]), 'busy');
    assert.equal(aggregateStatus('GATUNA', NOW, [mk('a', 'GATUNA', 240, 1)]), 'severe-delay');
    assert.equal(aggregateStatus('GATUNA', NOW, []), 'unknown');
  });
});

describe('FR-BRD-01 ranking', () => {
  test('a shorter reported wait wins when status is equal', () => {
    const all = [mk('g', 'GATUNA', 150, 1), mk('k', 'KAGITUMBA', 20, 1)];
    const r = rankCrossings('RW-UG', 'Agricultural', NOW, all);
    assert.equal(r.recommended!.crossing.id, 'KAGITUMBA');
    assert.match(r.decidedBy, /waiting time/i);
  });

  test('official status outranks waiting time', () => {
    // Cyanika is restricted but reporting almost no wait; an open crossing still wins.
    const all = [mk('c', 'CYANIKA', 5, 1), mk('g', 'GATUNA', 200, 1)];
    const r = rankCrossings('RW-UG', 'Agricultural', NOW, all);
    assert.equal(r.recommended!.crossing.officialStatus, 'open');
    assert.notEqual(r.recommended!.crossing.id, 'CYANIKA');
  });

  test('distance decides when status and wait are equal', () => {
    const all = [mk('g', 'GATUNA', 40, 1), mk('k', 'KAGITUMBA', 40, 1)];
    const r = rankCrossings('RW-UG', 'Agricultural', NOW, all);
    assert.equal(r.recommended!.crossing.id, 'GATUNA', '78 km beats 165 km');
    assert.match(r.decidedBy, /distance/i);
  });

  test('a crossing that cannot process the product class is excluded', () => {
    // Cyanika handles Agricultural only.
    const r = rankCrossings('RW-UG', 'Manufactured', NOW, []);
    assert.ok(!r.ranked.some((x) => x.crossing.id === 'CYANIKA'));
    assert.ok(r.excluded.some((e) => e.name === 'Cyanika'));
  });

  test('an unknown wait does not beat a known short wait', () => {
    const all = [mk('k', 'KAGITUMBA', 25, 1)]; // Gatuna has no current report
    const r = rankCrossings('RW-UG', 'Agricultural', NOW, all);
    assert.equal(r.recommended!.crossing.id, 'KAGITUMBA');
  });

  test('the ranking always explains which criterion decided it', () => {
    const r = rankCrossings('RW-UG', 'Agricultural', NOW);
    assert.ok(r.decidedBy.length > 0);
    assert.equal(r.windowHours, RANKING_WINDOW_HOURS);
  });

  test('every crossing carries a citation and a verified date', () => {
    for (const c of listCrossings('RW-UG')) {
      assert.ok(c.sourceCitation.length > 0, `${c.name} has no citation`);
      assert.match(c.lastVerifiedDate, /^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
