/**
 * Requirements engine and cost engine.
 *
 * Realises SRS FR-REQ-02 (checklist generation), FR-REQ-03 (simplified-regime
 * eligibility), FR-CST-01 (landed cost), FR-CST-02 (currency conversion) and
 * FR-CST-03 (per-line rule attribution).
 *
 * These functions are pure: they take an intention and the rule set and return a
 * result. No I/O, no framework. That is what makes them unit-testable to the 80%
 * statement coverage required by NFR-MNT-01.
 */
import {
  getCorridor, getProduct, getRulesForCorridor, getExchangeRates, isOverdue,
} from './repository';
import type {
  ChecklistItem, CostEstimate, CostLine, EligibilityResult, RegulatoryRule,
  RuleScope, TradeIntention, TradePlan,
} from './types';

export class UnsupportedCorridorError extends Error {}
export class UnknownProductError extends Error {}

/** Convert an amount into USD using the cached rate table (FR-CST-02). */
export function toUsd(amount: number, currency: string): number {
  const { rates } = getExchangeRates();
  const rate = rates[currency];
  if (!rate) throw new Error(`No exchange rate for ${currency}`);
  return amount / rate;
}

export function fromUsd(amountUsd: number, currency: string): number {
  const { rates } = getExchangeRates();
  const rate = rates[currency];
  if (!rate) throw new Error(`No exchange rate for ${currency}`);
  return amountUsd * rate;
}

/** Does this rule bind to this consignment? */
function scopeMatches(scope: RuleScope | undefined, hsCode: string, strEligible: boolean, eacOrigin: boolean): boolean {
  if (!scope) return false;
  switch (scope.scope) {
    case 'all': return true;
    case 'str-eligible': return strEligible;
    case 'str-ineligible': return !strEligible;
    case 'eac-origin': return eacOrigin;
    case 'hs-prefix': return scope.hsPrefixes.some((p) => hsCode.startsWith(p));
    default: return false;
  }
}

/**
 * FR-REQ-03 — simplified-regime eligibility.
 *
 * Two independent conditions must both hold: the declared value must fall below the
 * threshold, and the product must appear on the agreed common list. Each is reported
 * separately so the trader learns which one failed, not merely that it did.
 */
export function determineEligibility(intention: TradeIntention): EligibilityResult {
  const product = getProduct(intention.productId);
  if (!product) throw new UnknownProductError(intention.productId);

  const rules = getRulesForCorridor(intention.corridorId);
  const thresholdRule = rules.find((r) => r.ruleType === 'threshold');
  const thresholdValue = thresholdRule?.thresholdValue ?? 2000;
  const thresholdCurrency = thresholdRule?.thresholdCurrency ?? 'USD';

  const declaredValueUsd = toUsd(intention.declaredValue, intention.currency);
  const underThreshold = declaredValueUsd < thresholdValue;
  const onList = product.strListed;

  const reasons: string[] = [];
  reasons.push(
    underThreshold
      ? `Declared value of ${fmtUsd(declaredValueUsd)} is below the ${thresholdCurrency} ${thresholdValue.toLocaleString()} threshold.`
      : `Declared value of ${fmtUsd(declaredValueUsd)} is at or above the ${thresholdCurrency} ${thresholdValue.toLocaleString()} threshold.`,
  );
  reasons.push(
    onList
      ? `${product.name} appears on the Simplified Trade Regime common list.`
      : `${product.name} does not appear on the Simplified Trade Regime common list.`,
  );
  if (underThreshold && onList) {
    reasons.push('Both conditions are met, so the reduced requirement set applies and the consignment moves duty-free.');
  } else {
    reasons.push('Both conditions must be met to qualify, so full customs procedure applies.');
  }

  return {
    eligible: underThreshold && onList,
    thresholdValue,
    thresholdCurrency,
    declaredValueUsd,
    reasons,
    sourceCitation: thresholdRule?.sourceCitation ?? 'EAC Simplified Trade Regime',
    lastVerifiedDate: thresholdRule?.lastVerifiedDate ?? 'unknown',
  };
}

/**
 * FR-REQ-02 — document checklist.
 *
 * Each item retains a reference to the rule it came from, which is what allows the
 * citation and verification date to be displayed at the point of use (NFR-ACC-01).
 */
export function generateChecklist(intention: TradeIntention, strEligible: boolean): ChecklistItem[] {
  const product = getProduct(intention.productId);
  if (!product) throw new UnknownProductError(intention.productId);

  return getRulesForCorridor(intention.corridorId)
    .filter((r) => r.ruleType === 'document')
    .filter((r) => scopeMatches(r.appliesTo, product.hsCode, strEligible, product.eacOrigin))
    .map((r) => ({
      ruleId: r.id,
      name: r.name,
      issuingAuthority: r.issuingAuthority ?? 'Not stated',
      mandatory: r.mandatory ?? true,
      reason: r.reason,
      estimatedProcessingTime: r.estimatedProcessingTime ?? 'Not stated',
      sourceCitation: r.sourceCitation,
      sourceUrl: r.sourceUrl,
      lastVerifiedDate: r.lastVerifiedDate,
      verificationStatus: isOverdue(r) ? 'needs-verification' : 'verified',
    }));
}

/**
 * FR-CST-01 — landed cost.
 *
 * Builds the estimate line by line so that every figure can be traced back to the rule
 * that produced it (FR-CST-03). Duty is computed before tax because tax basis may be
 * customs value plus duty.
 */
export function estimateCost(intention: TradeIntention, strEligible: boolean): CostEstimate {
  const product = getProduct(intention.productId);
  if (!product) throw new UnknownProductError(intention.productId);

  const rules = getRulesForCorridor(intention.corridorId);
  const customsValueUsd = toUsd(intention.declaredValue, intention.currency);
  const lines: CostLine[] = [];
  let anyUnverified = false;

  const push = (rule: RegulatoryRule | null, description: string, detail: string, amountUsd: number) => {
    const unverified = rule ? isOverdue(rule) : false;
    if (unverified) anyUnverified = true;
    lines.push({
      ruleId: rule?.id ?? null,
      description,
      detail,
      amountUsd,
      sourceCitation: rule?.sourceCitation ?? 'Trader-declared',
      lastVerifiedDate: rule?.lastVerifiedDate ?? '—',
      verificationStatus: unverified ? 'needs-verification' : 'verified',
    });
  };

  push(null, 'Product value', `${intention.quantity} ${product.unit} as declared`, customsValueUsd);

  // Transport
  const transportRule = rules.find(
    (r) => r.ruleType === 'transport' && scopeMatches(r.appliesTo, product.hsCode, strEligible, product.eacOrigin),
  );
  if (transportRule?.ratePerKg) {
    const raw = intention.quantity * transportRule.ratePerKg;
    const amount = Math.max(raw, transportRule.minimumCharge ?? 0);
    const detail = amount > raw
      ? `minimum charge of ${fmtUsd(transportRule.minimumCharge!)} applied`
      : `${intention.quantity} ${product.unit} at ${fmtUsd(transportRule.ratePerKg)}/${product.unit}`;
    push(transportRule, 'Transport', detail, amount);
  }

  // Duty
  let dutyUsd = 0;
  const dutyRule = rules.find(
    (r) => r.ruleType === 'duty' && scopeMatches(r.appliesTo, product.hsCode, strEligible, product.eacOrigin),
  );
  if (dutyRule && dutyRule.ratePercent !== undefined) {
    dutyUsd = customsValueUsd * (dutyRule.ratePercent / 100);
    push(dutyRule, 'Import duty', `${dutyRule.ratePercent}% of customs value — ${dutyRule.name}`, dutyUsd);
  }

  // Taxes
  for (const r of rules.filter(
    (x) => x.ruleType === 'tax' && scopeMatches(x.appliesTo, product.hsCode, strEligible, product.eacOrigin),
  )) {
    if (r.ratePercent === undefined) continue;
    const base = r.basis === 'customs-value-plus-duty' ? customsValueUsd + dutyUsd : customsValueUsd;
    push(r, r.name, `${r.ratePercent}% of ${r.basis === 'customs-value-plus-duty' ? 'customs value plus duty' : 'customs value'}`, base * (r.ratePercent / 100));
  }

  // Fees
  for (const r of rules.filter(
    (x) => x.ruleType === 'fee' && scopeMatches(x.appliesTo, product.hsCode, strEligible, product.eacOrigin),
  )) {
    if (r.flatAmount === undefined) continue;
    push(r, r.name, `Flat charge`, toUsd(r.flatAmount, r.flatCurrency ?? 'USD'));
  }

  const totalUsd = lines.reduce((sum, l) => sum + l.amountUsd, 0);
  const corridor = getCorridor(intention.corridorId);
  const { retrievedAt } = getExchangeRates();
  const ageHours = (Date.now() - new Date(retrievedAt).getTime()) / 3_600_000;

  const conversions = corridor
    ? [
        { currency: corridor.originCurrency, amount: fromUsd(totalUsd, corridor.originCurrency) },
        { currency: corridor.destinationCurrency, amount: fromUsd(totalUsd, corridor.destinationCurrency) },
      ]
    : [];

  return {
    lines,
    totalUsd,
    // Widened when any contributing rule is overdue — an honest estimate of our own uncertainty.
    confidencePercent: anyUnverified ? 20 : 12,
    conversions,
    exchangeRateRetrievedAt: retrievedAt,
    exchangeRateAgeHours: Math.max(0, Math.round(ageHours)),
  };
}

/** Orchestrates the full plan — the scenario modelled in SRS Figure B.3. */
export function buildTradePlan(intention: TradeIntention): TradePlan {
  const corridor = getCorridor(intention.corridorId);
  if (!corridor || !corridor.isSupported) throw new UnsupportedCorridorError(intention.corridorId);
  const product = getProduct(intention.productId);
  if (!product) throw new UnknownProductError(intention.productId);

  const eligibility = determineEligibility(intention);
  const checklist = generateChecklist(intention, eligibility.eligible);
  const cost = estimateCost(intention, eligibility.eligible);

  const hasUnverifiedContent =
    checklist.some((c) => c.verificationStatus === 'needs-verification') ||
    cost.lines.some((l) => l.verificationStatus === 'needs-verification');

  const crossing = corridor.crossings.find((c) => c.isDefault) ?? corridor.crossings[0];

  return {
    corridor,
    product,
    intention,
    eligibility,
    checklist,
    cost,
    recommendedCrossing: crossing ? crossing.name : 'Not determined',
    hasUnverifiedContent,
    generatedAt: new Date().toISOString(),
  };
}

export function fmtUsd(n: number): string {
  return `USD ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtLocal(n: number, currency: string): string {
  return `${currency} ${Math.round(n).toLocaleString('en-US')}`;
}
