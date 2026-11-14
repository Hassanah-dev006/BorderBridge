/**
 * Marketplace matching (FR-MKT-02).
 *
 * Pure functions over listings the caller has already fetched, like border.ts and
 * transport.ts. The matching rule is the whole module: a trader planning to move
 * goods should see the people on the *other* side of that trade, in the market they
 * are moving into — not a directory to search.
 */
import type {
  Corridor, ListingKind, ListingWithOwner, MarketListing, MarketMatch,
  MatchedListing, Product, TradeIntention,
} from './types';

/** How long a listing stays current before it needs renewing. */
export const LISTING_TTL_DAYS = 45;

export function listingExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + LISTING_TTL_DAYS * 86_400_000);
}

export function daysRemaining(expiresAt: string, now: Date = new Date()): number {
  return Math.floor((new Date(expiresAt).getTime() - now.getTime()) / 86_400_000);
}

/** The counterpart of a listing kind — what you look for when you hold this one. */
export function opposite(kind: ListingKind): ListingKind {
  return kind === 'selling' ? 'buying' : 'selling';
}

/**
 * How a listing owner is named to someone who has not been given their details.
 *
 * A business name is a trading name and is meant to be public. A personal name is
 * not, so it is reduced to a first name and an initial. Neither reveals a way to
 * contact them, which is the point of FR-MKT-03.
 */
export function publicName(listing: ListingWithOwner): string {
  if (listing.ownerBusiness && listing.ownerBusiness.trim().length > 0) {
    return listing.ownerBusiness.trim();
  }
  const parts = listing.ownerName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/**
 * FR-MKT-02 — surface potential buyers or suppliers for a stated intention.
 *
 * A trader moving coffee from Rwanda to Uganda is selling, so they want *buying*
 * listings, and they want them in Uganda — the destination market. Listings for the
 * same product rank above listings merely in the same product category, because an
 * exact match is a likelier trade than an adjacent one.
 *
 * Ordered by: exact product before category match, then administratively verified
 * owners, then freshness. An expired listing is never matched: a price from three
 * months ago misleads rather than helps.
 */
export function matchListings(
  intention: TradeIntention,
  corridor: Corridor,
  product: Product,
  listings: ListingWithOwner[],
  now: Date = new Date(),
): MarketMatch {
  const want = opposite('selling'); // the trader is moving goods out, so they are selling
  const market = corridor.destinationCountry;
  const excluded: { name: string; reason: string }[] = [];
  const matched: MatchedListing[] = [];

  for (const l of listings) {
    const who = publicName(l);

    if (l.kind !== want) continue;        // sellers are not shown other sellers
    if (!l.active) continue;              // paused, and not worth explaining

    if (l.country !== market) {
      excluded.push({ name: who, reason: `In ${l.country}, not the destination market` });
      continue;
    }
    if (l.expired || daysRemaining(l.expiresAt, now) < 0) {
      excluded.push({ name: who, reason: 'Listing has expired' });
      continue;
    }

    const exact = l.productId === product.id;
    const sameClass = l.productCategory === product.category;
    if (!exact && !sameClass) continue;   // unrelated goods, nothing to explain

    matched.push({
      listing: l,
      reason: exact
        ? `Wants ${l.productName}`
        : `Buys ${l.productCategory.toLowerCase()} goods`,
    });
  }

  matched.sort((a, b) => {
    const ax = a.listing.productId === product.id ? 0 : 1;
    const bx = b.listing.productId === product.id ? 0 : 1;
    if (ax !== bx) return ax - bx;
    if (a.listing.ownerVerified !== b.listing.ownerVerified) {
      return a.listing.ownerVerified ? -1 : 1;
    }
    return new Date(b.listing.createdAt).getTime() - new Date(a.listing.createdAt).getTime();
  });

  return {
    matched,
    lookingFor: `Buyers of ${product.name.toLowerCase()} in ${corridor.destinationName}`,
    excluded,
  };
}

/** A listing's price, stated plainly, or a note that it is open to offers. */
export function priceLabel(listing: MarketListing): string {
  if (listing.pricePerUnit === null) return 'Price on enquiry';
  const amount = listing.pricePerUnit.toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  return listing.unit
    ? `${listing.currency} ${amount} per ${listing.unit}`
    : `${listing.currency} ${amount}`;
}

export function quantityLabel(listing: MarketListing): string {
  if (listing.quantity === null) return 'Quantity negotiable';
  return `${listing.quantity.toLocaleString('en-US')} ${listing.unit}`.trim();
}
