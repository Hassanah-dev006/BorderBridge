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
  crossingRanking: CrossingRanking;
  recommendedCrossing: string;
  /** True when any rule feeding this plan is overdue for re-verification (NFR-ACC-02). */
  hasUnverifiedContent: boolean;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Border module (FR-BRD-01, FR-BRD-03, FR-BRD-05)
// ---------------------------------------------------------------------------

export interface BorderCrossing {
  id: string;
  corridorId: string;
  name: string;
  officialStatus: 'open' | 'restricted' | 'closed';
  openingHours: string;
  openHoursPerDay: number;
  roadDistanceKm: number;
  agencies: string[];
  /** Product categories this crossing is equipped to process. */
  productClasses: string[];
  typicalProcessingMinutes: number;
  restrictionNote?: string;
  sourceCitation: string;
  lastVerifiedDate: string;
}

export interface BorderReport {
  id: string;
  crossingId: string;
  category: 'normal' | 'busy' | 'severe-delay' | 'closed';
  waitMinutes: number;
  reportedAt: string;
  note: string;
}

/** A report with its age and decayed weight resolved against a clock (FR-BRD-05). */
export interface WeightedReport extends BorderReport {
  ageHours: number;
  weight: number;
  expired: boolean;
}

export interface RankedCrossing {
  crossing: BorderCrossing;
  /** Null when no current report exists — treated as unknown, not as "no wait". */
  meanWaitMinutes: number | null;
  aggregateStatus: BorderReport['category'] | 'unknown';
  reports: WeightedReport[];
}

export interface CrossingRanking {
  ranked: RankedCrossing[];
  recommended: RankedCrossing | null;
  /** Which criterion separated first place from second (FR-BRD-01). */
  decidedBy: string;
  excluded: { name: string; reason: string }[];
  windowHours: number;
}

// ---------------------------------------------------------------------------
// Accounts (FR-ACC-01 … FR-ACC-06)
// ---------------------------------------------------------------------------

export type UserRole = 'trader' | 'provider' | 'admin';
export type Language = 'en' | 'fr' | 'sw' | 'rw';

export interface User {
  id: string;
  /** FR-ACC-01 — the phone number is the primary identifier, not an email address. */
  phone: string;
  displayName: string;
  role: UserRole;
  preferredLanguage: Language;
  /** Null until the one-time code has been confirmed (FR-ACC-02). */
  phoneVerifiedAt: string | null;
  /** FR-ACC-06 — set by an administrator for providers and buyers. */
  verifiedByAdmin: boolean;
  businessName: string | null;
  homeCorridorId: string | null;
  principalProducts: string | null;
  createdAt: string;
}

export interface Session {
  id: string;
  userId: string;
  expiresAt: string;
}

/** What the rate limiter decided about the next login attempt (FR-ACC-03). */
export interface ThrottleState {
  allowed: boolean;
  failedAttempts: number;
  waitSeconds: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Shipments (FR-SHP-01, FR-SHP-02)
// ---------------------------------------------------------------------------

export const SHIPMENT_STATUSES = [
  'planned',
  'documents-ready',
  'in-transit',
  'at-border',
  'cleared',
  'delivered',
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number] | 'cancelled';

export interface Shipment {
  id: string;
  userId: string;
  corridorId: string;
  productId: string;
  quantity: number;
  declaredValue: number;
  currency: string;
  /** FR-SHP-01 — the plan exactly as it stood when the shipment was created. Never recomputed. */
  planSnapshot: TradePlan;
  status: ShipmentStatus;
  createdAt: string;
}

export interface Milestone {
  id: string;
  shipmentId: string;
  status: ShipmentStatus;
  note: string;
  recordedAt: string;
}

/** Readiness derived from the frozen checklist and what has been ticked off. */
export interface ShipmentReadiness {
  obtained: string[];
  outstanding: ChecklistItem[];
  mandatoryOutstanding: ChecklistItem[];
  /** The next mandatory document standing between the trader and departure. */
  blockingItem: ChecklistItem | null;
  readyToTravel: boolean;
  percentComplete: number;
}

// ---------------------------------------------------------------------------
// Transport (FR-TRN-01, FR-TRN-02)
// ---------------------------------------------------------------------------

/** FR-TRN-01 — what a provider publishes about the service they offer. */
export interface TransportOffering {
  id: string;
  providerId: string;
  corridorId: string;
  vehicleType: string;
  capacityKg: number;
  /** Product categories this vehicle is equipped to carry. */
  productClasses: string[];
  permits: string;
  ratePerKg: number;
  minimumCharge: number;
  baseLocation: string;
  notes: string;
  active: boolean;
  createdAt: string;
}

/** An offering with its provider's details and reputation attached. */
export interface OfferingWithProvider extends TransportOffering {
  providerName: string;
  providerPhone: string;
  providerBusiness: string | null;
  verifiedByAdmin: boolean;
  /** Null when the provider has not been rated yet — treated as unknown, not as zero. */
  meanRating: number | null;
  ratingCount: number;
  completedJobs: number;
}

export type TransportRequestStatus = 'sent' | 'accepted' | 'declined' | 'withdrawn';

export interface TransportRequest {
  id: string;
  shipmentId: string;
  offeringId: string;
  traderId: string;
  providerId: string;
  status: TransportRequestStatus;
  quotedUsd: number;
  message: string;
  respondedAt: string | null;
  createdAt: string;
}

/** A request joined to the things a page needs to display alongside it. */
export interface RequestDetail extends TransportRequest {
  providerName: string;
  providerPhone: string;
  traderName: string;
  traderPhone: string;
  vehicleType: string;
  corridorId: string;
  productName: string;
  quantity: number;
  unit: string;
}

/** One candidate in the FR-TRN-02 ranking. */
export interface MatchedProvider {
  offering: OfferingWithProvider;
  quoteUsd: number;
  /** Why this quote is what it is — minimum charge applied, or rate times weight. */
  quoteBasis: string;
  capacityHeadroomKg: number | null;
}

export interface TransportMatch {
  matched: MatchedProvider[];
  best: MatchedProvider | null;
  /** Which criterion separated first place from second (FR-TRN-02). */
  decidedBy: string;
  excluded: { name: string; reason: string }[];
}

export interface ProviderRating {
  id: string;
  shipmentId: string;
  providerId: string;
  traderId: string;
  stars: number;
  comment: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Marketplace (FR-MKT-01, FR-MKT-02, FR-MKT-03)
// ---------------------------------------------------------------------------

export type ListingKind = 'selling' | 'buying';

/** FR-MKT-01 — what a user wishes to buy or sell, and where. */
export interface MarketListing {
  id: string;
  userId: string;
  kind: ListingKind;
  productId: string;
  /** Where the goods are, for a seller; where they are wanted, for a buyer. */
  country: string;
  location: string;
  quantity: number | null;
  unit: string;
  pricePerUnit: number | null;
  currency: string;
  note: string;
  active: boolean;
  expiresAt: string;
  createdAt: string;
}

/**
 * A listing with its owner's public details only.
 *
 * There is deliberately no phone number on this type. FR-MKT-03 releases contact
 * details when an enquiry is accepted, and a type that cannot carry a number cannot
 * leak one by accident.
 */
export interface ListingWithOwner extends MarketListing {
  ownerName: string;
  ownerBusiness: string | null;
  ownerVerified: boolean;
  productName: string;
  productCategory: string;
  /** Days remaining before the listing expires; negative when already expired. */
  daysRemaining: number;
  expired: boolean;
}

export type EnquiryStatus = 'sent' | 'accepted' | 'declined';

export interface MarketEnquiry {
  id: string;
  listingId: string;
  fromUserId: string;
  toUserId: string;
  message: string;
  status: EnquiryStatus;
  respondedAt: string | null;
  createdAt: string;
}

/** An enquiry joined to what a page needs. `counterpartyPhone` is null until accepted. */
export interface EnquiryDetail extends MarketEnquiry {
  listingKind: ListingKind;
  productName: string;
  country: string;
  fromName: string;
  toName: string;
  counterpartyPhone: string | null;
}

/** One candidate in the FR-MKT-02 match. */
export interface MatchedListing {
  listing: ListingWithOwner;
  /** Why this listing was surfaced for the stated intention. */
  reason: string;
}

export interface MarketMatch {
  matched: MatchedListing[];
  /** What the trader was matched against, stated so the result is explicable. */
  lookingFor: string;
  excluded: { name: string; reason: string }[];
}

// ---------------------------------------------------------------------------
// Notifications (FR-NOT-01, FR-NOT-02)
// ---------------------------------------------------------------------------

export type NotificationKind = 'rule-change' | 'border' | 'transport' | 'market' | 'shipment';

/** FR-NOT-01 — a null field means "any", so an empty subscription is everything. */
export interface Subscription {
  id: string;
  userId: string;
  corridorId: string | null;
  crossingId: string | null;
  productCategory: string | null;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string;
  readAt: string | null;
  createdAt: string;
}

/** What `checkRuleChanges` found when it compared the rule set against the watermark. */
export interface RuleChange {
  corridorId: string;
  fingerprint: string;
  previousFingerprint: string | null;
  /** Null on the very first check — we record the mark rather than announcing it. */
  changed: boolean;
  added: string[];
  amended: string[];
  removed: string[];
}

// ---------------------------------------------------------------------------
// Rule management (FR-ADM-01, FR-ADM-02, FR-ADM-03)
// ---------------------------------------------------------------------------

export type OverlayAction = 'create' | 'amend' | 'retire';
export type OverlayStatus = 'draft' | 'published' | 'superseded';

/**
 * A versioned amendment to the knowledge base, made through the interface.
 *
 * The base rules stay in data/rules.json. An overlay sits on top of one: published,
 * it replaces the base rule of the same id, or withdraws it. Nothing is edited in
 * place (NFR-ACC-05), and nothing a trader sees changes until it is published
 * (FR-ADM-02).
 */
export interface RuleOverlay {
  id: string;
  ruleId: string;
  corridorId: string;
  version: number;
  action: OverlayAction;
  payload: RegulatoryRule;
  status: OverlayStatus;
  note: string;
  createdBy: string | null;
  createdByName: string;
  createdAt: string;
  publishedBy: string | null;
  publishedByName: string | null;
  publishedAt: string | null;
}

/** FR-ADM-03 — what is wrong with a draft, in the words an administrator needs. */
export interface RuleValidation {
  valid: boolean;
  problems: string[];
}

export interface AuditEntry {
  id: string;
  actorId: string | null;
  actorName: string;
  action: string;
  subject: string;
  detail: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Reporting (FR-RPT-01, FR-RPT-02)
// ---------------------------------------------------------------------------

export interface OperationalMetrics {
  registrations: number;
  verifiedAccounts: number;
  activeUsers30d: number;
  shipmentsCreated: number;
  shipmentsDelivered: number;
  checklistItemsObtained: number;
  borderReports: number;
  transportRequests: number;
  marketListings: number;
  providers: number;
}

/** One shipment whose estimate can be compared against what it actually cost. */
export interface CostOutcome {
  shipmentId: string;
  productName: string;
  estimatedUsd: number;
  actualUsd: number;
  /** Positive when the estimate was too low. */
  variancePercent: number;
  /** The rules that produced the estimate, so variance can be attributed. */
  ruleIds: string[];
  unverifiedAtPlanning: boolean;
  recordedAt: string;
}

export interface AccuracyReport {
  outcomes: CostOutcome[];
  count: number;
  /** Mean absolute error, as a percentage of the actual cost. */
  meanAbsolutePercent: number | null;
  /** Mean signed error: negative means the system under-estimates. */
  biasPercent: number | null;
  /** How often the actual landed inside the stated confidence range. */
  withinConfidence: number;
  /** Rules appearing most often in the estimates that missed by the most. */
  suspectRules: { ruleId: string; appearances: number; meanAbsolutePercent: number }[];
}

// ---------------------------------------------------------------------------
// Data subject rights and content accuracy (NFR-PRI-03, NFR-LEG-04)
//
// Note: ContentReport below is a user contesting a regulatory rule. It is not
// AccuracyReport, which lives in the reporting section and measures how close the
// cost estimates were. Two different kinds of "accuracy".
// ---------------------------------------------------------------------------

/** Everything held about one person, as NFR-PRI-03 requires it be exportable. */
export interface PersonalDataExport {
  exportedAt: string;
  account: Record<string, unknown>;
  profile: Record<string, unknown>;
  shipments: Record<string, unknown>[];
  borderReports: Record<string, unknown>[];
  transportOfferings: Record<string, unknown>[];
  transportRequests: Record<string, unknown>[];
  marketListings: Record<string, unknown>[];
  marketEnquiries: Record<string, unknown>[];
  subscriptions: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  /** What is deliberately not in here, and why — stated rather than silently omitted. */
  notIncluded: { what: string; why: string }[];
}

export type RequestStatus = 'open' | 'completed' | 'refused';

export interface DeletionRequest {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  reason: string;
  status: RequestStatus;
  response: string;
  handledBy: string | null;
  handledAt: string | null;
  createdAt: string;
}

export interface ContentReport {
  id: string;
  userId: string | null;
  reporterName: string;
  ruleId: string;
  corridorId: string;
  whatIsWrong: string;
  source: string;
  status: 'open' | 'accepted' | 'rejected';
  response: string;
  handledBy: string | null;
  handledAt: string | null;
  createdAt: string;
}
