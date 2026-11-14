/**
 * Reporting (FR-RPT-01, FR-RPT-02).
 *
 * Pure functions over rows the caller has fetched. The interesting one is accuracy:
 * a system that tells traders what a movement will cost should be able to say how
 * often it was right, and which rules were responsible when it was not.
 */
import type { AccuracyReport, CostOutcome, Shipment } from './types';

/**
 * FR-RPT-02 — compare one shipment's frozen estimate against what it actually cost.
 *
 * Variance is signed against the actual: positive means the estimate was too low, so
 * the trader paid more than they were told. That direction matters more than the
 * other, which is why the sign is kept rather than taking an absolute value here.
 */
export function outcomeOf(shipment: Shipment, actualUsd: number, recordedAt: string): CostOutcome {
  const plan = shipment.planSnapshot;
  const estimated = plan.cost?.totalUsd ?? 0;
  const variancePercent = actualUsd === 0 ? 0 : ((actualUsd - estimated) / actualUsd) * 100;

  return {
    shipmentId: shipment.id,
    productName: plan.product?.name ?? shipment.productId,
    estimatedUsd: estimated,
    actualUsd,
    variancePercent,
    ruleIds: (plan.cost?.lines ?? []).map((l) => l.ruleId).filter((id): id is string => Boolean(id)),
    unverifiedAtPlanning: Boolean(plan.hasUnverifiedContent),
    recordedAt,
  };
}

/**
 * FR-RPT-02 — accuracy across every shipment with a recorded outcome, and the rules
 * that appear most often in the estimates that missed by the most.
 *
 * "Suspect" is a weak word on purpose. A rule appearing in a bad estimate is a lead,
 * not a verdict: the transport rate and the VAT rate appear in nearly every estimate,
 * so they will head the list whether or not they are the cause. The interface says so.
 */
export function accuracyReport(outcomes: CostOutcome[]): AccuracyReport {
  if (outcomes.length === 0) {
    return {
      outcomes: [], count: 0,
      meanAbsolutePercent: null, biasPercent: null,
      withinConfidence: 0, suspectRules: [],
    };
  }

  const abs = outcomes.map((o) => Math.abs(o.variancePercent));
  const meanAbsolutePercent = abs.reduce((a, b) => a + b, 0) / abs.length;
  const biasPercent = outcomes.reduce((a, o) => a + o.variancePercent, 0) / outcomes.length;

  // An estimate stated ±12%, or ±20% when a contributing rule was unverified.
  const withinConfidence = outcomes.filter((o) => {
    const band = o.unverifiedAtPlanning ? 20 : 12;
    return Math.abs(o.variancePercent) <= band;
  }).length;

  const perRule = new Map<string, { appearances: number; total: number }>();
  for (const o of outcomes) {
    for (const id of new Set(o.ruleIds)) {
      const held = perRule.get(id) ?? { appearances: 0, total: 0 };
      held.appearances += 1;
      held.total += Math.abs(o.variancePercent);
      perRule.set(id, held);
    }
  }

  const suspectRules = Array.from(perRule.entries())
    .map(([ruleId, v]) => ({
      ruleId,
      appearances: v.appearances,
      meanAbsolutePercent: v.total / v.appearances,
    }))
    .sort((a, b) => b.meanAbsolutePercent - a.meanAbsolutePercent)
    .slice(0, 6);

  return {
    outcomes: [...outcomes].sort((a, b) => Math.abs(b.variancePercent) - Math.abs(a.variancePercent)),
    count: outcomes.length,
    meanAbsolutePercent,
    biasPercent,
    withinConfidence,
    suspectRules,
  };
}

/** How the bias reads in words — the direction matters more than the number. */
export function biasLabel(biasPercent: number | null): string {
  if (biasPercent === null) return 'No outcomes recorded yet';
  if (Math.abs(biasPercent) < 2) return 'No consistent direction';
  return biasPercent > 0
    ? `Under-estimating by ${biasPercent.toFixed(1)}% on average — traders pay more than they are told`
    : `Over-estimating by ${Math.abs(biasPercent).toFixed(1)}% on average — traders pay less than they are told`;
}

/** Enough outcomes to mean anything? Said plainly rather than implied by a chart. */
export const MEANINGFUL_SAMPLE = 5;

export function confidenceCaveat(count: number): string | null {
  if (count === 0) return 'No trader has recorded what a shipment actually cost yet.';
  if (count < MEANINGFUL_SAMPLE) {
    return `Only ${count} outcome${count === 1 ? '' : 's'} recorded. Treat these figures as anecdote, not measurement.`;
  }
  return null;
}
