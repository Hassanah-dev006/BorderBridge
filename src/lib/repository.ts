/**
 * Data access seam.
 *
 * The regulatory knowledge base is held as JSON so that a trained non-developer can
 * amend it without touching code (SRS NFR-MNT-03) and so that rules remain data rather
 * than logic (constraint C1). Everything above this file depends only on the functions
 * exported here, never on the storage format — so swapping JSON for PostgreSQL means
 * reimplementing this one module and nothing else (NFR-CMP-05).
 */
import catalogue from '../../data/catalogue.json';
import ruleBook from '../../data/rules.json';
import type { Corridor, Product, RegulatoryRule } from './types';

const corridors = catalogue.corridors as Corridor[];
const products = catalogue.products as Product[];
const rules = ruleBook.rules as RegulatoryRule[];

/** Rules whose verification date is older than this are flagged (FR-ADM-04). */
export const REVIEW_INTERVAL_DAYS = 180;

export function listCorridors(): Corridor[] {
  return corridors;
}

export function listSupportedCorridors(): Corridor[] {
  return corridors.filter((c) => c.isSupported);
}

export function getCorridor(id: string): Corridor | undefined {
  return corridors.find((c) => c.id === id);
}

export function listProducts(): Product[] {
  return [...products].sort((a, b) => a.name.localeCompare(b.name));
}

export function getProduct(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}

/** Active rules for a corridor. In a versioned store this would filter to the current version. */
export function getRulesForCorridor(corridorId: string): RegulatoryRule[] {
  return rules.filter((r) => r.corridorId === corridorId);
}

export function getExchangeRates(): { retrievedAt: string; base: string; rates: Record<string, number> } {
  const { retrievedAt, base, rates } = catalogue.exchangeRates as {
    retrievedAt: string; base: string; rates: Record<string, number>;
  };
  return { retrievedAt, base, rates };
}

/**
 * True when a rule is past its review interval. Derived output is marked pending
 * re-verification so the trader can judge its currency (NFR-ACC-02).
 */
export function isOverdue(rule: RegulatoryRule, now = new Date()): boolean {
  if (rule.verificationStatus === 'needs-verification') return true;
  const verified = new Date(rule.lastVerifiedDate).getTime();
  if (Number.isNaN(verified)) return true;
  const ageDays = (now.getTime() - verified) / 86_400_000;
  return ageDays > REVIEW_INTERVAL_DAYS;
}
