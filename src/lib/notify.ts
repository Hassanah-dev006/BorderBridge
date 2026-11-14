/**
 * Notification matching and rule-change detection (FR-NOT-01, FR-NOT-02).
 *
 * Pure functions. The storage side lives in store.ts, and the pages trigger a check
 * rather than a background job — stated plainly in the interface, because a prototype
 * that claims to push notifications it cannot send would be lying to its users.
 */
import { createHash } from 'node:crypto';
import type { RegulatoryRule, Subscription } from './types';

/**
 * Does this subscription cover this event?
 *
 * A null field means "any", so a subscription with every field null matches
 * everything. That is deliberate: it lets a trader say "tell me about all of it"
 * without the interface needing a separate concept for it.
 */
export function covers(
  sub: Pick<Subscription, 'corridorId' | 'crossingId' | 'productCategory'>,
  event: { corridorId?: string | null; crossingId?: string | null; productCategory?: string | null },
): boolean {
  if (sub.corridorId && event.corridorId && sub.corridorId !== event.corridorId) return false;
  if (sub.crossingId && event.crossingId && sub.crossingId !== event.crossingId) return false;
  if (sub.productCategory && event.productCategory && sub.productCategory !== event.productCategory) {
    return false;
  }
  // A subscription that names something the event does not carry still matches: a
  // corridor-wide subscription should hear about a corridor-wide change.
  return true;
}

/** Which of a user's subscriptions, if any, make this event theirs. */
export function matchingSubscriptions(
  subs: Subscription[],
  event: { corridorId?: string | null; crossingId?: string | null; productCategory?: string | null },
): Subscription[] {
  return subs.filter((s) => covers(s, event));
}

/** A readable description of what a subscription covers. */
export function describeSubscription(sub: Subscription, corridorName?: string): string {
  const parts: string[] = [];
  if (sub.corridorId) parts.push(corridorName ?? sub.corridorId);
  if (sub.crossingId) parts.push(sub.crossingId);
  if (sub.productCategory) parts.push(sub.productCategory.toLowerCase());
  return parts.length === 0 ? 'Everything on the system' : parts.join(' · ');
}

// --- FR-NOT-02: detecting a change in the knowledge base --------------------

/**
 * A stable fingerprint of one rule — its identity and everything a trader would
 * notice changing.
 *
 * Deliberately excludes fields that do not alter what the trader is told, so that
 * tidying a comment in the JSON file does not notify thousands of people.
 */
function ruleSignature(r: RegulatoryRule): string {
  return [
    r.id, r.version, r.ruleType, r.name,
    r.mandatory ?? '', r.ratePercent ?? '', r.flatAmount ?? '',
    r.thresholdValue ?? '', r.ratePerKg ?? '', r.minimumCharge ?? '',
    r.lastVerifiedDate, r.verificationStatus,
  ].join('|');
}

/** One rule reduced to what we store and compare. */
export interface RuleMark { id: string; name: string; sig: string }

export function ruleSnapshot(rules: RegulatoryRule[]): RuleMark[] {
  return rules
    .map((r) => ({ id: r.id, name: r.name, sig: ruleSignature(r) }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** One fingerprint over every rule on a corridor, order-independent. */
export function ruleFingerprint(rules: RegulatoryRule[]): string {
  const sigs = rules.map(ruleSignature).sort();
  return createHash('sha256').update(sigs.join('\n')).digest('hex').slice(0, 32);
}

/**
 * What changed between two snapshots, in the terms a trader cares about: a new
 * requirement, an amended one, or one that no longer applies.
 */
export function diffSnapshots(
  previous: RuleMark[], current: RuleMark[],
): { added: string[]; amended: string[]; removed: string[] } {
  const prev = new Map(previous.map((m) => [m.id, m]));
  const curr = new Map(current.map((m) => [m.id, m]));

  const added: string[] = [];
  const amended: string[] = [];
  const removed: string[] = [];

  for (const [id, m] of curr) {
    const before = prev.get(id);
    if (!before) added.push(m.name);
    else if (before.sig !== m.sig) amended.push(m.name);
  }
  for (const [id, m] of prev) {
    if (!curr.has(id)) removed.push(m.name);
  }

  return { added, amended, removed };
}

/** The sentence a trader reads when their corridor's rules have moved. */
export function changeSummary(
  corridorName: string,
  change: { added: string[]; amended: string[]; removed: string[] },
): { title: string; body: string } {
  const bits: string[] = [];
  if (change.added.length) bits.push(`${change.added.length} new`);
  if (change.amended.length) bits.push(`${change.amended.length} amended`);
  if (change.removed.length) bits.push(`${change.removed.length} withdrawn`);

  const named = [...change.added, ...change.amended, ...change.removed].slice(0, 3);
  const more = change.added.length + change.amended.length + change.removed.length - named.length;

  return {
    title: `Rules changed on ${corridorName}`,
    body:
      `${bits.join(', ')}. ${named.join('; ')}${more > 0 ? `; and ${more} more` : ''}. ` +
      'Any plan you made before today was correct when you made it — re-plan to see the current position.',
  };
}

/** The sentence a trader reads when a crossing they follow is badly delayed. */
export function delaySummary(crossingName: string, waitMinutes: number): { title: string; body: string } {
  const hours = Math.floor(waitMinutes / 60);
  const mins = waitMinutes % 60;
  const stated = hours > 0 ? `${hours}h ${mins}m` : `${mins} minutes`;
  return {
    title: `Long delay reported at ${crossingName}`,
    body: `Another trader has reported about ${stated} of waiting. Reports fade over twelve hours, so check the crossing before you travel.`,
  };
}

export const SEVERE_DELAY_MINUTES = 180;
