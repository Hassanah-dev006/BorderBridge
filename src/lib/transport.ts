/**
 * Transport matching (FR-TRN-02).
 *
 * Pure functions: the caller fetches the offerings and the shipment, these decide
 * which of them fit and in what order. No I/O, so the matching and ranking rules can
 * be tested without a database — the same approach as border.ts and engines.ts.
 */
import type {
  MatchedProvider, OfferingWithProvider, Shipment, TransportMatch,
} from './types';

/**
 * What a provider would charge to move this consignment.
 *
 * Mirrors the shape of the indicative transport rule in the knowledge base: a rate per
 * kilogram, floored at a minimum charge, because no operator runs a hundred kilometres
 * for the price of five kilograms.
 */
export function quote(offering: OfferingWithProvider, quantity: number): { usd: number; basis: string } {
  const raw = offering.ratePerKg * quantity;
  if (raw < offering.minimumCharge) {
    return {
      usd: offering.minimumCharge,
      basis: `minimum charge of USD ${offering.minimumCharge.toFixed(2)} applied`,
    };
  }
  return {
    usd: raw,
    basis: `${quantity} at USD ${offering.ratePerKg.toFixed(2)} each`,
  };
}

/**
 * Capacity is published in kilograms, so it can only be compared against a quantity
 * that is also in kilograms. For a consignment counted in pairs or pieces we return
 * null rather than inventing a conversion, and the offering is not excluded on
 * capacity — the trader is shown the stated capacity and judges for themselves.
 */
export function capacityHeadroom(
  offering: OfferingWithProvider, quantity: number, unit: string,
): number | null {
  if (unit !== 'kg') return null;
  return offering.capacityKg - quantity;
}

/**
 * FR-TRN-02 — present providers whose offering fits a stated shipment.
 *
 * Fit is a filter, not a ranking: an offering is either capable of carrying this
 * consignment on this corridor or it is not. What fits is then ordered by
 * (1) administrative verification, (2) mean rating, (3) quoted price, and finally
 * the smaller vehicle, on the grounds that a right-sized vehicle is likelier to
 * actually make the trip.
 *
 * An unrated provider sorts below a rated one. We do not reward the absence of
 * evidence — the same rule the border module applies to crossings with no report.
 */
export function matchProviders(
  shipment: Shipment,
  offerings: OfferingWithProvider[],
): TransportMatch {
  const { productId, quantity, corridorId } = shipment;
  const product = shipment.planSnapshot.product;
  const unit = product?.unit ?? 'kg';
  const category = product?.category ?? '';

  const excluded: { name: string; reason: string }[] = [];
  const fits: OfferingWithProvider[] = [];

  for (const o of offerings) {
    const who = o.providerBusiness || o.providerName;

    if (!o.active) {
      excluded.push({ name: who, reason: 'Not currently accepting work' });
      continue;
    }
    if (o.corridorId !== corridorId) {
      excluded.push({ name: who, reason: 'Does not serve this route' });
      continue;
    }
    if (category && o.productClasses.length > 0 && !o.productClasses.includes(category)) {
      excluded.push({ name: who, reason: `Does not carry ${category.toLowerCase()} goods` });
      continue;
    }
    const headroom = capacityHeadroom(o, quantity, unit);
    if (headroom !== null && headroom < 0) {
      excluded.push({ name: who, reason: `Capacity is ${o.capacityKg} kg, below this consignment` });
      continue;
    }
    fits.push(o);
  }

  const matched: MatchedProvider[] = fits
    .map((o) => {
      const q = quote(o, quantity);
      return {
        offering: o,
        quoteUsd: q.usd,
        quoteBasis: q.basis,
        capacityHeadroomKg: capacityHeadroom(o, quantity, unit),
      };
    })
    .sort((a, b) => {
      if (a.offering.verifiedByAdmin !== b.offering.verifiedByAdmin) {
        return a.offering.verifiedByAdmin ? -1 : 1;
      }
      const ar = a.offering.meanRating ?? -1;
      const br = b.offering.meanRating ?? -1;
      if (ar !== br) return br - ar;
      if (a.quoteUsd !== b.quoteUsd) return a.quoteUsd - b.quoteUsd;
      return a.offering.capacityKg - b.offering.capacityKg;
    });

  // Suppress a product-class exclusion that is really the same provider appearing on
  // the wrong corridor — the trader only needs to be told once per provider.
  const seen = new Set<string>();
  const uniqueExcluded = excluded.filter((e) => {
    if (seen.has(e.name)) return false;
    seen.add(e.name);
    return true;
  });

  return {
    matched,
    best: matched[0] ?? null,
    decidedBy: decidingCriterion(matched),
    excluded: uniqueExcluded,
  };
}

/** Which of the four criteria separated first place from second. */
function decidingCriterion(matched: MatchedProvider[]): string {
  if (matched.length === 0) return 'No provider currently serves this consignment.';
  if (matched.length === 1) return 'It is the only provider that fits this consignment.';

  const [a, b] = matched;
  const nameA = a.offering.providerBusiness || a.offering.providerName;
  const nameB = b.offering.providerBusiness || b.offering.providerName;

  if (a.offering.verifiedByAdmin !== b.offering.verifiedByAdmin) {
    return `Verification — ${nameA} is verified by an administrator; ${nameB} is not.`;
  }
  const ar = a.offering.meanRating;
  const br = b.offering.meanRating;
  if (ar !== br) {
    if (ar === null) return `Rating — no rating yet for ${nameA}.`;
    if (br === null) {
      return `Rating — ${nameA} is rated ${ar.toFixed(1)} from ${a.offering.ratingCount} trader(s); ${nameB} has no rating yet.`;
    }
    return `Rating — ${ar.toFixed(1)} against ${br.toFixed(1)} for ${nameB}.`;
  }
  if (a.quoteUsd !== b.quoteUsd) {
    return `Price — USD ${a.quoteUsd.toFixed(2)} against USD ${b.quoteUsd.toFixed(2)} from ${nameB}.`;
  }
  return `Vehicle size — ${a.offering.capacityKg} kg against ${b.offering.capacityKg} kg, and the smaller vehicle suits this load better.`;
}

/** Stars as a short label, for somewhere a star row would be too noisy. */
export function ratingLabel(mean: number | null, count: number): string {
  if (mean === null || count === 0) return 'No rating yet';
  return `${mean.toFixed(1)} out of 5 from ${count} trader${count === 1 ? '' : 's'}`;
}

export const PRODUCT_CLASSES = ['Agricultural', 'Animal product', 'Manufactured'] as const;

export const VEHICLE_TYPES = [
  'Motorcycle',
  'Pickup',
  'Light truck (up to 3 tonnes)',
  'Truck (3–10 tonnes)',
  'Heavy truck (over 10 tonnes)',
  'Refrigerated truck',
] as const;
