/**
 * Shipment progress logic (FR-SHP-02).
 *
 * Pure functions over the frozen plan snapshot and the set of documents obtained.
 * No I/O, so the ordering and blocking rules can be tested without a database.
 */
import { SHIPMENT_STATUSES } from './types';
import type { ChecklistItem, Shipment, ShipmentReadiness, ShipmentStatus } from './types';

export const STATUS_LABELS: Record<ShipmentStatus, string> = {
  planned: 'Planned',
  'documents-ready': 'Documents ready',
  'in-transit': 'In transit',
  'at-border': 'At the border',
  cleared: 'Cleared',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const STATUS_HINTS: Record<ShipmentStatus, string> = {
  planned: 'Collect the documents on the checklist below.',
  'documents-ready': 'Every mandatory document is in hand. You can travel.',
  'in-transit': 'On the road to the crossing.',
  'at-border': 'Presented to customs and the other border agencies.',
  cleared: 'Released by customs.',
  delivered: 'Handed over at the destination.',
  cancelled: 'This shipment was cancelled.',
};

/**
 * Readiness against the frozen checklist.
 *
 * The blocking item is the first outstanding mandatory document — naming it is more
 * useful to a trader than a percentage, because it is the single next thing to do.
 */
export function readiness(shipment: Shipment, obtainedRuleIds: string[]): ShipmentReadiness {
  const checklist = shipment.planSnapshot.checklist ?? [];
  const obtained = new Set(obtainedRuleIds);

  const outstanding = checklist.filter((c: ChecklistItem) => !obtained.has(c.ruleId));
  const mandatoryOutstanding = outstanding.filter((c) => c.mandatory);
  const percentComplete =
    checklist.length === 0 ? 100 : Math.round(((checklist.length - outstanding.length) / checklist.length) * 100);

  return {
    obtained: obtainedRuleIds,
    outstanding,
    mandatoryOutstanding,
    blockingItem: mandatoryOutstanding[0] ?? null,
    readyToTravel: mandatoryOutstanding.length === 0,
    percentComplete,
  };
}

/**
 * Which milestones may be recorded next.
 *
 * Progress is forward-only along the defined sequence, because a shipment that has
 * cleared customs cannot un-clear. Departure is additionally gated on holding every
 * mandatory document, which is the point of the checklist.
 */
export function allowedNextStatuses(current: ShipmentStatus, readyToTravel: boolean): ShipmentStatus[] {
  if (current === 'cancelled' || current === 'delivered') return [];

  const order = SHIPMENT_STATUSES as readonly ShipmentStatus[];
  const i = order.indexOf(current);
  if (i === -1) return [];

  const next = order[i + 1];
  const options: ShipmentStatus[] = [];
  if (next) {
    const departing = next === 'documents-ready' || next === 'in-transit';
    if (!departing || readyToTravel) options.push(next);
  }
  if (current === 'planned') options.push('cancelled');
  return options;
}

export function statusIndex(status: ShipmentStatus): number {
  return (SHIPMENT_STATUSES as readonly ShipmentStatus[]).indexOf(status);
}

export function shortReference(id: string): string {
  return id.slice(0, 8).toUpperCase();
}
