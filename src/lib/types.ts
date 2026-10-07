// Domain types. These mirror the class diagram in SRS Appendix B, Figure B.2a.

export type VerificationStatus = 'verified' | 'needs-verification';

export interface Corridor {
  id: string;
  originCountry: string;
  originName: string;
  destinationCountry: string;
  destinationName: string;
  originCurrency: string;
  destinationCurrency: string;
  isSupported: boolean;
  crossings: { id: string; name: string; isDefault: boolean }[];
}

export interface Product {
  id: string;
  name: string;
  hsCode: string;
  category: string;
  unit: string;
  /** Appears on the EAC Simplified Trade Regime common list. */
  strListed: boolean;
  /** Qualifies as EAC-originating for preferential duty. */
  eacOrigin: boolean;
}

/** Which consignments a rule binds to. Evaluated by the requirements engine. */
export type RuleScope =
  | { scope: 'all' }
  | { scope: 'str-eligible' }
  | { scope: 'str-ineligible' }
  | { scope: 'eac-origin' }
  | { scope: 'hs-prefix'; hsPrefixes: string[] };

export type RuleType = 'document' | 'threshold' | 'duty' | 'tax' | 'fee' | 'transport';

/**
 * A versioned regulatory rule. Never overwritten in place — an amendment creates a
 * new version (SRS NFR-ACC-05). sourceCitation and lastVerifiedDate are mandatory
 * (constraint C2, NFR-ACC-01) and are surfaced wherever the rule is shown.
 */
export interface RegulatoryRule {
  id: string;
  version: number;
  corridorId: string;
  ruleType: RuleType;
  name: string;
  reason: string;
  sourceCitation: string;
  sourceUrl?: string;
  lastVerifiedDate: string;
  verificationStatus: VerificationStatus;
  appliesTo?: RuleScope;
  issuingAuthority?: string;
  mandatory?: boolean;
  estimatedProcessingTime?: string;
  thresholdValue?: number;
  thresholdCurrency?: string;
  ratePercent?: number;
  basis?: 'customs-value' | 'customs-value-plus-duty';
  flatAmount?: number;
  flatCurrency?: string;
  ratePerKg?: number;
  rateCurrency?: string;
  minimumCharge?: number;
}

/** What the trader states they intend to move (FR-REQ-01). */
export interface TradeIntention {
  corridorId: string;
  productId: string;
  quantity: number;
  declaredValue: number;
  currency: string;
}

export interface ChecklistItem {
  ruleId: string;
  name: string;
  issuingAuthority: string;
  mandatory: boolean;
  reason: string;
  estimatedProcessingTime: string;
  sourceCitation: string;
  sourceUrl?: string;
  lastVerifiedDate: string;
  verificationStatus: VerificationStatus;
}

/** Output of the simplified-regime test (FR-REQ-03). */
export interface EligibilityResult {
  eligible: boolean;
  thresholdValue: number;
  thresholdCurrency: string;
  declaredValueUsd: number;
  /** Plain-language reasons, each one a condition that passed or failed. */
  reasons: string[];
  sourceCitation: string;
  lastVerifiedDate: string;
}

export interface CostLine {
  ruleId: string | null;
  description: string;
  detail: string;
  amountUsd: number;
  sourceCitation: string;
  lastVerifiedDate: string;
  verificationStatus: VerificationStatus;
}

export interface CostEstimate {
  lines: CostLine[];
  totalUsd: number;
  /** ± percentage, widened when any contributing rule is unverified. */
  confidencePercent: number;
  conversions: { currency: string; amount: number }[];
  exchangeRateRetrievedAt: string;
  exchangeRateAgeHours: number;
}

export interface TradePlan {
  corridor: Corridor;
  product: Product;
  intention: TradeIntention;
  eligibility: EligibilityResult;
  checklist: ChecklistItem[];
  cost: CostEstimate;
  recommendedCrossing: string;
  /** True when any rule feeding this plan is overdue for re-verification (NFR-ACC-02). */
  hasUnverifiedContent: boolean;
  generatedAt: string;
}
