/**
 * Unit tests for the requirements and cost engines.
 * Run with: npm test
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  determineEligibility, generateChecklist, estimateCost, buildTradePlan,
  toUsd, UnsupportedCorridorError, UnknownProductError,
} from '../src/lib/engines';

const coffee200 = { corridorId: 'RW-UG', productId: 'coffee-green', quantity: 200, declaredValue: 1200, currency: 'USD' };

describe('FR-REQ-03 simplified-regime eligibility', () => {
  test('qualifies when under threshold and on the common list', () => {
    const r = determineEligibility(coffee200);
    assert.equal(r.eligible, true);
    assert.equal(r.thresholdValue, 2000);
  });

  test('fails on value alone when above the threshold', () => {
    const r = determineEligibility({ ...coffee200, declaredValue: 2500 });
    assert.equal(r.eligible, false);
    assert.ok(r.reasons[0].includes('at or above'));
    assert.ok(r.reasons[1].includes('appears on'), 'product condition should still pass');
  });

  test('fails on product alone when not on the common list', () => {
    const r = determineEligibility({ ...coffee200, productId: 'footwear', declaredValue: 500 });
    assert.equal(r.eligible, false);
    assert.ok(r.reasons[0].includes('below'), 'value condition should still pass');
    assert.ok(r.reasons[1].includes('does not appear'));
  });

  test('converts a non-USD declared value before comparing', () => {
    // 1,572,000 RWF at 1310/USD is USD 1,200 — comfortably under the threshold.
    const r = determineEligibility({ ...coffee200, declaredValue: 1_572_000, currency: 'RWF' });
    assert.equal(r.eligible, true);
    assert.ok(Math.abs(r.declaredValueUsd - 1200) < 1);
  });

  test('a large RWF amount that exceeds the threshold is rejected', () => {
    const r = determineEligibility({ ...coffee200, declaredValue: 5_000_000, currency: 'RWF' });
    assert.equal(r.eligible, false);
  });
});

describe('FR-REQ-02 checklist generation', () => {
  test('an eligible coffee consignment gets the simplified document set', () => {
    const items = generateChecklist(coffee200, true);
    const names = items.map((i) => i.name);
    assert.ok(names.includes('Simplified Certificate of Origin'));
    assert.ok(!names.includes('Customs declaration (single administrative document)'));
  });

  test('an ineligible consignment gets the full customs set', () => {
    const items = generateChecklist(coffee200, false);
    const names = items.map((i) => i.name);
    assert.ok(names.includes('Customs declaration (single administrative document)'));
    assert.ok(names.includes('EAC Certificate of Origin'));
    assert.ok(!names.includes('Simplified Certificate of Origin'));
  });

  test('product-specific rules bind by HS prefix', () => {
    const coffee = generateChecklist(coffee200, true).map((i) => i.name);
    assert.ok(coffee.includes('Phytosanitary certificate'), 'HS 0901 is a plant product');

    const shoes = generateChecklist({ ...coffee200, productId: 'footwear' }, false).map((i) => i.name);
    assert.ok(!shoes.includes('Phytosanitary certificate'), 'HS 6403 is not');
  });

  test('every item carries a citation and a verification date (NFR-ACC-01)', () => {
    for (const item of generateChecklist(coffee200, true)) {
      assert.ok(item.sourceCitation.length > 0, `${item.name} has no citation`);
      assert.match(item.lastVerifiedDate, /^\d{4}-\d{2}-\d{2}$/, `${item.name} has no verified date`);
    }
  });
});

describe('FR-CST-01 cost estimation', () => {
  test('an STR-eligible consignment pays no duty and no VAT', () => {
    const c = estimateCost(coffee200, true);
    const labels = c.lines.map((l) => l.description);
    assert.ok(!labels.includes('Uganda value added tax on imports'));
    const duty = c.lines.find((l) => l.description === 'Import duty');
    assert.equal(duty?.amountUsd ?? 0, 0);
  });

  test('an ineligible consignment is charged VAT on value plus duty', () => {
    const c = estimateCost({ ...coffee200, declaredValue: 2500 }, false);
    const vat = c.lines.find((l) => l.description.includes('value added tax'));
    assert.ok(vat, 'VAT line should be present');
    // Duty is 0% under EAC preference, so VAT base is the customs value.
    assert.ok(Math.abs(vat!.amountUsd - 2500 * 0.18) < 0.01);
  });

  test('transport applies a minimum charge for very small loads', () => {
    const c = estimateCost({ ...coffee200, quantity: 5 }, true);
    const t = c.lines.find((l) => l.description === 'Transport');
    assert.equal(t?.amountUsd, 40, '5 kg at 0.9/kg is 4.50, so the 40 minimum applies');
    assert.ok(t!.detail.includes('minimum charge'));
  });

  test('the total is the sum of its lines', () => {
    const c = estimateCost(coffee200, true);
    const sum = c.lines.reduce((s, l) => s + l.amountUsd, 0);
    assert.ok(Math.abs(c.totalUsd - sum) < 1e-9);
  });

  test('confidence widens when an unverified rule contributes', () => {
    const c = estimateCost(coffee200, true);
    assert.equal(c.confidencePercent, 20, 'transport rate is marked needs-verification');
  });

  test('every cost line carries attribution (FR-CST-03)', () => {
    for (const l of estimateCost(coffee200, true).lines) {
      assert.ok(l.sourceCitation.length > 0, `${l.description} has no citation`);
    }
  });
});

describe('buildTradePlan orchestration', () => {
  test('produces a complete plan for the pilot corridor', () => {
    const plan = buildTradePlan(coffee200);
    assert.equal(plan.eligibility.eligible, true);
    assert.ok(plan.checklist.length > 0);
    assert.ok(plan.cost.totalUsd > 0);
    assert.equal(plan.recommendedCrossing, 'Gatuna / Katuna');
  });

  test('flags the plan when any contributing rule is overdue (NFR-ACC-02)', () => {
    assert.equal(buildTradePlan(coffee200).hasUnverifiedContent, true);
  });

  test('refuses an unsupported corridor rather than guessing', () => {
    assert.throws(() => buildTradePlan({ ...coffee200, corridorId: 'RW-KE' }), UnsupportedCorridorError);
  });

  test('refuses an unknown product', () => {
    assert.throws(() => buildTradePlan({ ...coffee200, productId: 'uranium' }), UnknownProductError);
  });
});

describe('FR-CST-02 currency conversion', () => {
  test('converts RWF to USD at the cached rate', () => {
    assert.ok(Math.abs(toUsd(1310, 'RWF') - 1) < 1e-9);
  });
  test('throws on an unknown currency rather than silently defaulting', () => {
    assert.throws(() => toUsd(100, 'XYZ'));
  });
});
