/**
 * Unit tests for marketplace matching (FR-MKT-02) and the privacy rule behind
 * FR-MKT-03.
 *
 * The rule a user would notice if it were wrong: that publishing a listing does not
 * expose who you are or how to reach you, and that the people surfaced for a trade
 * are on the other side of it, in the market you are moving into.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchListings, publicName, opposite, priceLabel, quantityLabel,
  listingExpiry, daysRemaining, LISTING_TTL_DAYS,
} from '../src/lib/market';
import type { Corridor, ListingWithOwner, Product, TradeIntention } from '../src/lib/types';

const NOW = new Date('2026-11-14T12:00:00Z');
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();

const corridor: Corridor = {
  id: 'RW-UG',
  originCountry: 'RW', originName: 'Rwanda',
  destinationCountry: 'UG', destinationName: 'Uganda',
  originCurrency: 'RWF', destinationCurrency: 'UGX',
  isSupported: true, crossings: [],
};

const coffee: Product = {
  id: 'coffee-green', name: 'Coffee, green (unroasted)', hsCode: '0901.11',
  category: 'Agricultural', unit: 'kg', strListed: true, eacOrigin: true,
};

const intention: TradeIntention = {
  corridorId: 'RW-UG', productId: 'coffee-green', quantity: 200,
  declaredValue: 1400, currency: 'USD',
};

const listing = (over: Partial<ListingWithOwner> = {}): ListingWithOwner => ({
  id: over.id ?? 'l1',
  userId: over.userId ?? 'u1',
  kind: 'buying',
  productId: 'coffee-green',
  country: 'UG',
  location: 'Kampala',
  quantity: 500,
  unit: 'kg',
  pricePerUnit: 2.4,
  currency: 'USD',
  note: '',
  active: true,
  expiresAt: inDays(30),
  createdAt: '2026-11-01T00:00:00Z',
  ownerName: 'Grace Nakato',
  ownerBusiness: null,
  ownerVerified: false,
  productName: 'Coffee, green (unroasted)',
  productCategory: 'Agricultural',
  daysRemaining: 30,
  expired: false,
  ...over,
});

describe('listing lifetime', () => {
  test('a new listing expires after the stated window', () => {
    assert.equal(daysRemaining(listingExpiry(NOW).toISOString(), NOW), LISTING_TTL_DAYS);
  });

  test('a day into its life, a listing has one day less', () => {
    const expires = listingExpiry(NOW).toISOString();
    const tomorrow = new Date(NOW.getTime() + 86_400_000);
    assert.equal(daysRemaining(expires, tomorrow), LISTING_TTL_DAYS - 1);
  });

  test('days remaining goes negative once past', () => {
    assert.ok(daysRemaining(inDays(-3), NOW) < 0);
  });
});

describe('who a listing shows (FR-MKT-03)', () => {
  test('a business name is shown in full — it is a trading name', () => {
    assert.equal(publicName(listing({ ownerBusiness: 'Nakato Coffee Traders' })), 'Nakato Coffee Traders');
  });

  test('a personal name is reduced to a first name and an initial', () => {
    assert.equal(publicName(listing({ ownerName: 'Grace Nakato' })), 'Grace N.');
  });

  test('a single name is left alone', () => {
    assert.equal(publicName(listing({ ownerName: 'Grace' })), 'Grace');
  });

  test('the listing type cannot carry a phone number at all', () => {
    // The guarantee is structural: if the type has no field for it, no page can
    // render one by mistake. This test fails the moment someone adds one.
    const l = listing();
    assert.ok(!('phone' in l), 'a phone field was added to ListingWithOwner');
    assert.ok(!('ownerPhone' in l), 'an ownerPhone field was added to ListingWithOwner');
  });
});

describe('FR-MKT-02 matching', () => {
  test('a trader moving goods out is shown buyers, not other sellers', () => {
    const m = matchListings(intention, corridor, coffee, [
      listing({ id: 'seller', kind: 'selling' }),
      listing({ id: 'buyer', kind: 'buying' }),
    ], NOW);
    assert.equal(m.matched.length, 1);
    assert.equal(m.matched[0].listing.id, 'buyer');
  });

  test('buyers are shown in the destination market, not the origin', () => {
    const m = matchListings(intention, corridor, coffee, [
      listing({ id: 'home', country: 'RW' }),
      listing({ id: 'away', country: 'UG' }),
    ], NOW);
    assert.equal(m.matched.length, 1);
    assert.equal(m.matched[0].listing.id, 'away');
    assert.match(m.excluded[0].reason, /not the destination market/i);
  });

  test('an expired listing is never matched', () => {
    const m = matchListings(intention, corridor, coffee, [
      listing({ id: 'stale', expiresAt: inDays(-1), expired: true }),
    ], NOW);
    assert.equal(m.matched.length, 0);
    assert.match(m.excluded[0].reason, /expired/i);
  });

  test('a paused listing is not matched, and not explained', () => {
    const m = matchListings(intention, corridor, coffee, [listing({ active: false })], NOW);
    assert.equal(m.matched.length, 0);
    assert.equal(m.excluded.length, 0, 'a paused listing is the owner’s business, not the viewer’s');
  });

  test('an exact product match outranks a category match', () => {
    const m = matchListings(intention, corridor, coffee, [
      listing({ id: 'category', productId: 'tea', productName: 'Tea, black' }),
      listing({ id: 'exact', productId: 'coffee-green' }),
    ], NOW);
    assert.equal(m.matched[0].listing.id, 'exact');
    assert.match(m.matched[0].reason, /wants coffee/i);
    assert.match(m.matched[1].reason, /agricultural/i);
  });

  test('a verified buyer outranks an unverified one of the same product', () => {
    const m = matchListings(intention, corridor, coffee, [
      listing({ id: 'plain', userId: 'a', ownerVerified: false }),
      listing({ id: 'verified', userId: 'b', ownerVerified: true }),
    ], NOW);
    assert.equal(m.matched[0].listing.id, 'verified');
  });

  test('unrelated goods are dropped without an explanation', () => {
    const m = matchListings(intention, corridor, coffee, [
      listing({ productId: 'footwear', productCategory: 'Manufactured' }),
    ], NOW);
    assert.equal(m.matched.length, 0);
    assert.equal(m.excluded.length, 0);
  });

  test('the match states what it looked for', () => {
    const m = matchListings(intention, corridor, coffee, [], NOW);
    assert.match(m.lookingFor, /buyers of coffee/i);
    assert.match(m.lookingFor, /Uganda/);
  });
});

describe('labels', () => {
  test('opposite flips the side of the trade', () => {
    assert.equal(opposite('selling'), 'buying');
    assert.equal(opposite('buying'), 'selling');
  });

  test('a missing price says so rather than showing zero', () => {
    assert.equal(priceLabel(listing({ pricePerUnit: null })), 'Price on enquiry');
  });

  test('a price is stated with its unit', () => {
    assert.equal(priceLabel(listing({ pricePerUnit: 2.4, currency: 'USD', unit: 'kg' })), 'USD 2.40 per kg');
  });

  test('a missing quantity says negotiable rather than zero', () => {
    assert.equal(quantityLabel(listing({ quantity: null })), 'Quantity negotiable');
  });
});
