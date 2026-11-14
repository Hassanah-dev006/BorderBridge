/**
 * Unit tests for subscription matching and rule-change detection
 * (FR-NOT-01, FR-NOT-02).
 *
 * The behaviour that matters: a subscription means what a user would expect it to
 * mean, and a notification fires when a rule a trader relies on actually moves —
 * not when a comment in the file is tidied.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  covers, matchingSubscriptions, describeSubscription,
  ruleFingerprint, ruleSnapshot, diffSnapshots, changeSummary,
  delaySummary, SEVERE_DELAY_MINUTES,
} from '../src/lib/notify';
import type { RegulatoryRule, Subscription } from '../src/lib/types';

const sub = (over: Partial<Subscription> = {}): Subscription => ({
  id: 's1', userId: 'u1',
  corridorId: null, crossingId: null, productCategory: null,
  createdAt: '2026-11-01T00:00:00Z',
  ...over,
});

const rule = (over: Partial<RegulatoryRule> = {}): RegulatoryRule => ({
  id: 'R1', version: 1, corridorId: 'RW-UG', ruleType: 'duty',
  name: 'EAC preferential import duty', reason: 'Because.',
  sourceCitation: 'Protocol', lastVerifiedDate: '2026-08-14',
  verificationStatus: 'verified', ratePercent: 0,
  ...over,
});

describe('FR-NOT-01 subscription matching', () => {
  test('an empty subscription follows everything', () => {
    assert.equal(covers(sub(), { corridorId: 'RW-UG', crossingId: 'GATUNA', productCategory: 'Agricultural' }), true);
  });

  test('a corridor subscription ignores events on another corridor', () => {
    assert.equal(covers(sub({ corridorId: 'RW-UG' }), { corridorId: 'UG-RW' }), false);
    assert.equal(covers(sub({ corridorId: 'RW-UG' }), { corridorId: 'RW-UG' }), true);
  });

  test('a crossing subscription ignores another crossing', () => {
    assert.equal(covers(sub({ crossingId: 'GATUNA' }), { crossingId: 'CYANIKA' }), false);
  });

  test('a product subscription ignores other goods', () => {
    assert.equal(covers(sub({ productCategory: 'Agricultural' }), { productCategory: 'Manufactured' }), false);
  });

  test('every named field must match, not just one', () => {
    const s = sub({ corridorId: 'RW-UG', productCategory: 'Agricultural' });
    assert.equal(covers(s, { corridorId: 'RW-UG', productCategory: 'Manufactured' }), false);
    assert.equal(covers(s, { corridorId: 'RW-UG', productCategory: 'Agricultural' }), true);
  });

  test('a corridor-wide subscription still hears a corridor-wide change', () => {
    // The event names no crossing, so a crossing-specific subscriber is not excluded
    // on that basis — a rule change affects every crossing on the corridor.
    assert.equal(covers(sub({ crossingId: 'GATUNA' }), { corridorId: 'RW-UG' }), true);
  });

  test('matchingSubscriptions returns only the ones that apply', () => {
    const subs = [
      sub({ id: 'a', corridorId: 'RW-UG' }),
      sub({ id: 'b', corridorId: 'UG-RW' }),
      sub({ id: 'c' }),
    ];
    const hit = matchingSubscriptions(subs, { corridorId: 'RW-UG' }).map((s) => s.id);
    assert.deepEqual(hit, ['a', 'c']);
  });

  test('a subscription describes itself readably', () => {
    assert.equal(describeSubscription(sub()), 'Everything on the system');
    assert.match(describeSubscription(sub({ productCategory: 'Agricultural' })), /agricultural/);
  });
});

describe('FR-NOT-02 rule-change detection', () => {
  test('the same rules give the same fingerprint, whatever the order', () => {
    const a = [rule({ id: 'R1' }), rule({ id: 'R2' })];
    const b = [rule({ id: 'R2' }), rule({ id: 'R1' })];
    assert.equal(ruleFingerprint(a), ruleFingerprint(b));
  });

  test('a changed rate changes the fingerprint', () => {
    const before = [rule({ ratePercent: 0 })];
    const after = [rule({ ratePercent: 5 })];
    assert.notEqual(ruleFingerprint(before), ruleFingerprint(after));
  });

  test('a changed verification date changes the fingerprint', () => {
    // A trader is told the verification date, so moving it is a change they can see.
    const before = [rule({ lastVerifiedDate: '2026-08-14' })];
    const after = [rule({ lastVerifiedDate: '2026-11-01' })];
    assert.notEqual(ruleFingerprint(before), ruleFingerprint(after));
  });

  test('editing something the trader never sees does not notify anyone', () => {
    // Tidying the explanatory text should not tell thousands of people the law moved.
    const before = [rule({ reason: 'Because the rule says so.' })];
    const after = [rule({ reason: 'Because the governing instrument requires it.' })];
    assert.equal(ruleFingerprint(before), ruleFingerprint(after));
  });

  test('a new requirement is reported as added', () => {
    const d = diffSnapshots(ruleSnapshot([rule({ id: 'R1' })]), ruleSnapshot([rule({ id: 'R1' }), rule({ id: 'R2', name: 'New permit' })]));
    assert.deepEqual(d.added, ['New permit']);
    assert.equal(d.amended.length, 0);
    assert.equal(d.removed.length, 0);
  });

  test('a changed rule is reported as amended, not added and removed', () => {
    const d = diffSnapshots(
      ruleSnapshot([rule({ id: 'R1', ratePercent: 0 })]),
      ruleSnapshot([rule({ id: 'R1', ratePercent: 18 })]),
    );
    assert.deepEqual(d.amended, ['EAC preferential import duty']);
    assert.equal(d.added.length, 0);
    assert.equal(d.removed.length, 0);
  });

  test('a withdrawn rule is reported as removed, under its old name', () => {
    const d = diffSnapshots(ruleSnapshot([rule({ id: 'R1', name: 'Old levy' })]), ruleSnapshot([]));
    assert.deepEqual(d.removed, ['Old levy']);
  });

  test('no change gives nothing to announce', () => {
    const snap = ruleSnapshot([rule()]);
    const d = diffSnapshots(snap, snap);
    assert.equal(d.added.length + d.amended.length + d.removed.length, 0);
  });
});

describe('what the trader reads', () => {
  test('the change summary counts each kind and names a few', () => {
    const { title, body } = changeSummary('Rwanda → Uganda', {
      added: ['New permit'], amended: ['VAT on imports'], removed: [],
    });
    assert.match(title, /Rwanda → Uganda/);
    assert.match(body, /1 new/);
    assert.match(body, /1 amended/);
    assert.match(body, /New permit/);
  });

  test('the summary tells the trader their old plan was not wrong', () => {
    // A frozen shipment plan stays valid; the message should not imply otherwise.
    const { body } = changeSummary('Rwanda → Uganda', { added: ['X'], amended: [], removed: [] });
    assert.match(body, /correct when you made it/i);
  });

  test('a long list is truncated rather than dumped', () => {
    const many = ['A', 'B', 'C', 'D', 'E'];
    const { body } = changeSummary('Rwanda → Uganda', { added: many, amended: [], removed: [] });
    assert.match(body, /and 2 more/);
  });

  test('a delay is stated in hours and minutes once past an hour', () => {
    assert.match(delaySummary('Gatuna / Katuna', 200).body, /3h 20m/);
    assert.match(delaySummary('Gatuna / Katuna', 45).body, /45 minutes/);
  });

  test('the severe-delay threshold is three hours', () => {
    assert.equal(SEVERE_DELAY_MINUTES, 180);
  });
});
