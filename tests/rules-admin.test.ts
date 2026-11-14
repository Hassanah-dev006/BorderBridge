/**
 * Unit tests for rule management (FR-ADM-01, FR-ADM-02, FR-ADM-03).
 *
 * The behaviour that matters: a rule without its governing instrument is refused
 * rather than stored and flagged, a draft changes nothing a trader sees, and the
 * published overlay is what the engines actually use.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRule, nextVersion, effectiveRules, overlayStateOf, describeChange,
} from '../src/lib/rules-admin';
import type { RegulatoryRule, RuleOverlay } from '../src/lib/types';

const rule = (over: Partial<RegulatoryRule> = {}): RegulatoryRule => ({
  id: 'RW-UG-DOC-001', version: 1, corridorId: 'RW-UG', ruleType: 'document',
  name: 'National identity card', reason: 'Proof of identity is required of everyone crossing.',
  sourceCitation: 'EAC Common Market Protocol, Article 7',
  lastVerifiedDate: '2026-08-14', verificationStatus: 'verified',
  issuingAuthority: 'Immigration', mandatory: true,
  ...over,
});

const overlay = (over: Partial<RuleOverlay> = {}): RuleOverlay => ({
  id: 'o1', ruleId: 'RW-UG-DOC-001', corridorId: 'RW-UG', version: 2,
  action: 'amend', payload: rule({ version: 2 }), status: 'published', note: '',
  createdBy: 'admin', createdByName: 'Admin', createdAt: '2026-11-14T10:00:00Z',
  publishedBy: 'admin', publishedByName: 'Admin', publishedAt: '2026-11-14T11:00:00Z',
  ...over,
});

describe('FR-ADM-03 a rule must carry its source', () => {
  test('a complete rule passes', () => {
    assert.equal(validateRule(rule()).valid, true);
  });

  test('no governing instrument is refused, not flagged', () => {
    const r = validateRule(rule({ sourceCitation: '' }));
    assert.equal(r.valid, false);
    assert.ok(r.problems.some((p) => /citation cannot be published/i.test(p)));
  });

  test('no verification date is refused', () => {
    const r = validateRule(rule({ lastVerifiedDate: '' }));
    assert.equal(r.valid, false);
    assert.ok(r.problems.some((p) => /last verified/i.test(p)));
  });

  test('a malformed verification date is refused', () => {
    assert.equal(validateRule(rule({ lastVerifiedDate: '14 August 2026' })).valid, false);
  });

  test('a verification date in the future is refused', () => {
    const next = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const r = validateRule(rule({ lastVerifiedDate: next }));
    assert.equal(r.valid, false);
    assert.ok(r.problems.some((p) => /future/i.test(p)));
  });

  test('a duty without a rate does nothing, so it is refused', () => {
    const r = validateRule(rule({ ruleType: 'duty', ratePercent: undefined }));
    assert.equal(r.valid, false);
    assert.ok(r.problems.some((p) => /needs a rate/i.test(p)));
  });

  test('a rate outside 0–100 is refused', () => {
    assert.equal(validateRule(rule({ ruleType: 'tax', ratePercent: 140 })).valid, false);
  });

  test('a document rule without an issuing authority is refused', () => {
    const r = validateRule(rule({ issuingAuthority: undefined }));
    assert.equal(r.valid, false);
    assert.ok(r.problems.some((p) => /issuing authority/i.test(p)));
  });

  test('every problem is reported at once, not one at a time', () => {
    const r = validateRule({ id: '', name: '' });
    assert.ok(r.problems.length >= 4, 'an administrator should not have to fix these one by one');
  });
});

describe('FR-ADM-01 versioning', () => {
  test('the first amendment to a base rule is version 2', () => {
    assert.equal(nextVersion('RW-UG-DOC-001', [], [rule({ version: 1 })]), 2);
  });

  test('versions continue from the highest already recorded', () => {
    const existing = [{ ruleId: 'RW-UG-DOC-001', version: 4 }];
    assert.equal(nextVersion('RW-UG-DOC-001', existing, [rule({ version: 1 })]), 5);
  });

  test('a brand new rule starts at version 1', () => {
    assert.equal(nextVersion('RW-UG-NEW-001', [], []), 1);
  });
});

describe('FR-ADM-02 a draft changes nothing', () => {
  const base = [rule({ name: 'Original name' })];

  test('a draft overlay is invisible to the engines', () => {
    const live = effectiveRules(base, [
      overlay({ status: 'draft', payload: rule({ version: 2, name: 'Changed name' }) }),
    ]);
    assert.equal(live[0].name, 'Original name', 'a draft must not reach a trader');
  });

  test('a published overlay replaces the base rule', () => {
    const live = effectiveRules(base, [
      overlay({ status: 'published', payload: rule({ version: 2, name: 'Changed name' }) }),
    ]);
    assert.equal(live[0].name, 'Changed name');
    assert.equal(live.length, 1, 'it replaces rather than adds');
  });

  test('a superseded overlay is ignored', () => {
    const live = effectiveRules(base, [
      overlay({ id: 'old', version: 2, status: 'superseded', payload: rule({ version: 2, name: 'Old edit' }) }),
    ]);
    assert.equal(live[0].name, 'Original name');
  });

  test('the newest published version wins', () => {
    const live = effectiveRules(base, [
      overlay({ id: 'a', version: 2, payload: rule({ version: 2, name: 'Second' }) }),
      overlay({ id: 'b', version: 3, payload: rule({ version: 3, name: 'Third' }) }),
    ]);
    assert.equal(live[0].name, 'Third');
  });

  test('a published retirement removes the rule', () => {
    const live = effectiveRules(base, [overlay({ action: 'retire' })]);
    assert.equal(live.length, 0);
  });

  test('a drafted retirement does not', () => {
    const live = effectiveRules(base, [overlay({ action: 'retire', status: 'draft' })]);
    assert.equal(live.length, 1);
  });

  test('a rule created through the interface appears alongside the file', () => {
    const live = effectiveRules(base, [
      overlay({ id: 'new', ruleId: 'RW-UG-NEW-001', action: 'create', version: 1,
                payload: rule({ id: 'RW-UG-NEW-001', version: 1, name: 'New permit' }) }),
    ]);
    assert.equal(live.length, 2);
    assert.ok(live.some((r) => r.name === 'New permit'));
  });

  test('the base file is untouched by any of this', () => {
    // The whole point of constraint C1: the file stays the reviewable source.
    const before = JSON.stringify(base);
    effectiveRules(base, [overlay({ action: 'retire' })]);
    assert.equal(JSON.stringify(base), before);
  });
});

describe('what an administrator sees', () => {
  const base = [rule()];

  test('an untouched rule reads as coming from the file', () => {
    assert.equal(overlayStateOf('RW-UG-DOC-001', base, []), 'base');
  });

  test('a pending draft is distinguished from a published change', () => {
    assert.equal(overlayStateOf('RW-UG-DOC-001', base, [overlay({ status: 'draft' })]), 'draft-pending');
    assert.equal(overlayStateOf('RW-UG-DOC-001', base, [overlay({ status: 'published' })]), 'amended');
  });

  test('a retired rule says so', () => {
    assert.equal(overlayStateOf('RW-UG-DOC-001', base, [overlay({ action: 'retire' })]), 'retired');
  });

  test('a rule not in the file reads as added here', () => {
    const o = overlay({ ruleId: 'X-1', action: 'create', payload: rule({ id: 'X-1' }) });
    assert.equal(overlayStateOf('X-1', base, [o]), 'added');
  });

  test('a change describes itself for the audit log', () => {
    assert.match(describeChange('create', rule()), /^Created/);
    assert.match(describeChange('amend', rule()), /^Amended/);
    assert.match(describeChange('retire', rule()), /^Retired/);
    assert.match(describeChange('amend', rule()), /RW-UG-DOC-001 v1/);
  });
});
