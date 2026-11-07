/**
 * Unit tests for shipment progress (FR-SHP-01, FR-SHP-02).
 *
 * The rules under test are the ones a trader would notice if they were wrong: that a
 * shipment cannot depart without its mandatory documents, that progress is forward
 * only, and that the blocking item names the single next thing to do.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readiness, allowedNextStatuses, statusIndex, shortReference } from '../src/lib/shipments';
import type { ChecklistItem, Shipment } from '../src/lib/types';

const item = (ruleId: string, mandatory: boolean): ChecklistItem => ({
  ruleId,
  name: `Document ${ruleId}`,
  issuingAuthority: 'Authority',
  mandatory,
  reason: 'Because the rule says so.',
  estimatedProcessingTime: '2 days',
  sourceCitation: 'Instrument',
  lastVerifiedDate: '2026-08-14',
  verificationStatus: 'verified',
});

/* A shipment is only ever read through planSnapshot.checklist here, so the rest of
   the frozen plan is stubbed rather than built. */
const shipmentWith = (checklist: ChecklistItem[], status: Shipment['status'] = 'planned'): Shipment =>
  ({
    id: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
    userId: 'u1',
    corridorId: 'RW-UG',
    productId: 'coffee-green',
    quantity: 200,
    declaredValue: 1200,
    currency: 'USD',
    status,
    createdAt: '2026-10-22T10:00:00Z',
    planSnapshot: { checklist } as Shipment['planSnapshot'],
  }) as Shipment;

describe('readiness against the frozen checklist', () => {
  const three = [item('A', true), item('B', true), item('C', false)];

  test('nothing obtained means nothing complete', () => {
    const r = readiness(shipmentWith(three), []);
    assert.equal(r.percentComplete, 0);
    assert.equal(r.readyToTravel, false);
    assert.equal(r.outstanding.length, 3);
  });

  test('the blocking item is the first outstanding mandatory document', () => {
    const r = readiness(shipmentWith(three), []);
    assert.equal(r.blockingItem?.ruleId, 'A');

    const next = readiness(shipmentWith(three), ['A']);
    assert.equal(next.blockingItem?.ruleId, 'B');
  });

  test('an optional document outstanding does not block travel', () => {
    const r = readiness(shipmentWith(three), ['A', 'B']);
    assert.equal(r.readyToTravel, true);
    assert.equal(r.blockingItem, null);
    assert.equal(r.outstanding.length, 1, 'the optional one is still outstanding');
    assert.equal(r.percentComplete, 67);
  });

  test('everything obtained is complete', () => {
    const r = readiness(shipmentWith(three), ['A', 'B', 'C']);
    assert.equal(r.percentComplete, 100);
    assert.equal(r.readyToTravel, true);
  });

  test('an empty checklist is complete rather than dividing by zero', () => {
    const r = readiness(shipmentWith([]), []);
    assert.equal(r.percentComplete, 100);
    assert.equal(r.readyToTravel, true);
  });

  test('an unknown obtained id does not inflate progress', () => {
    const r = readiness(shipmentWith(three), ['A', 'NOT-ON-THE-LIST']);
    assert.equal(r.outstanding.length, 2);
  });
});

describe('milestone transitions (FR-SHP-02)', () => {
  test('a planned shipment cannot depart without its mandatory documents', () => {
    const next = allowedNextStatuses('planned', false);
    assert.ok(!next.includes('documents-ready'));
    assert.ok(next.includes('cancelled'), 'but it can still be cancelled');
  });

  test('once ready, the next step becomes available', () => {
    assert.ok(allowedNextStatuses('planned', true).includes('documents-ready'));
  });

  test('progress is one step at a time, in order', () => {
    assert.deepEqual(allowedNextStatuses('in-transit', true), ['at-border']);
    assert.deepEqual(allowedNextStatuses('at-border', true), ['cleared']);
    assert.deepEqual(allowedNextStatuses('cleared', true), ['delivered']);
  });

  test('a delivered or cancelled shipment is final', () => {
    assert.deepEqual(allowedNextStatuses('delivered', true), []);
    assert.deepEqual(allowedNextStatuses('cancelled', true), []);
  });

  test('cancelling is only offered while still planning', () => {
    assert.ok(!allowedNextStatuses('in-transit', true).includes('cancelled'));
  });

  test('the status order is the one the SRS states', () => {
    assert.ok(statusIndex('planned') < statusIndex('documents-ready'));
    assert.ok(statusIndex('documents-ready') < statusIndex('in-transit'));
    assert.ok(statusIndex('in-transit') < statusIndex('at-border'));
    assert.ok(statusIndex('at-border') < statusIndex('cleared'));
    assert.ok(statusIndex('cleared') < statusIndex('delivered'));
  });
});

describe('shipment reference', () => {
  test('is short, stable and upper case', () => {
    const ref = shortReference('f81d4fae-7dec-11d0-a765-00a0c91e6bf6');
    assert.equal(ref, 'F81D4FAE');
    assert.equal(ref.length, 8);
  });
});
