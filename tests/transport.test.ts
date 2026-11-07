/**
 * Unit tests for transport matching (FR-TRN-02).
 *
 * The rules under test are the ones a trader would notice if they were wrong: that a
 * vehicle too small to carry the load is not offered, that an unrated provider does
 * not outrank a well-rated one, and that the quote matches the provider's published
 * rate.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { quote, capacityHeadroom, matchProviders, ratingLabel } from '../src/lib/transport';
import type { OfferingWithProvider, Shipment } from '../src/lib/types';

const offering = (over: Partial<OfferingWithProvider> = {}): OfferingWithProvider => ({
  id: over.id ?? 'o1',
  providerId: over.providerId ?? 'p1',
  corridorId: 'RW-UG',
  vehicleType: 'Pickup',
  capacityKg: 1000,
  productClasses: ['Agricultural', 'Manufactured'],
  permits: '',
  ratePerKg: 1,
  minimumCharge: 0,
  baseLocation: 'Kigali',
  notes: '',
  active: true,
  createdAt: '2026-10-01T00:00:00Z',
  providerName: 'Provider One',
  providerPhone: '+250788000001',
  providerBusiness: null,
  verifiedByAdmin: false,
  meanRating: null,
  ratingCount: 0,
  completedJobs: 0,
  ...over,
});

/* Only corridorId, quantity and planSnapshot.product are read by the matcher, so the
   rest of the shipment is stubbed rather than built. */
const shipment = (quantity = 200, category = 'Agricultural', unit = 'kg'): Shipment =>
  ({
    id: 's1',
    userId: 'u1',
    corridorId: 'RW-UG',
    productId: 'coffee-green',
    quantity,
    declaredValue: 1200,
    currency: 'USD',
    status: 'planned',
    createdAt: '2026-10-22T10:00:00Z',
    planSnapshot: { product: { category, unit, name: 'Coffee' } } as Shipment['planSnapshot'],
  }) as Shipment;

describe('quoting', () => {
  test('a quote is the rate times the quantity', () => {
    const q = quote(offering({ ratePerKg: 0.9 }), 200);
    assert.ok(Math.abs(q.usd - 180) < 1e-9);
    assert.match(q.basis, /at USD 0\.90/);
  });

  test('the minimum charge applies to a small load', () => {
    const q = quote(offering({ ratePerKg: 0.9, minimumCharge: 40 }), 5);
    assert.equal(q.usd, 40, '5 kg at 0.90 is 4.50, so the minimum takes over');
    assert.match(q.basis, /minimum charge/);
  });

  test('the minimum does not inflate a large load', () => {
    const q = quote(offering({ ratePerKg: 0.9, minimumCharge: 40 }), 200);
    assert.ok(Math.abs(q.usd - 180) < 1e-9);
    assert.ok(!q.basis.includes('minimum'));
  });
});

describe('capacity', () => {
  test('headroom is capacity less the load', () => {
    assert.equal(capacityHeadroom(offering({ capacityKg: 1000 }), 200, 'kg'), 800);
  });

  test('a load heavier than the vehicle gives negative headroom', () => {
    assert.equal(capacityHeadroom(offering({ capacityKg: 100 }), 200, 'kg'), -100);
  });

  test('headroom is unknown for a consignment not counted in kilograms', () => {
    // Capacity is published in kg, so comparing it against 200 pairs of shoes would
    // mean inventing a conversion. We return null instead.
    assert.equal(capacityHeadroom(offering(), 200, 'pair'), null);
  });
});

describe('fit (FR-TRN-02)', () => {
  test('a provider on another route is excluded', () => {
    const m = matchProviders(shipment(), [offering({ corridorId: 'UG-RW' })]);
    assert.equal(m.matched.length, 0);
    assert.match(m.excluded[0].reason, /does not serve this route/i);
  });

  test('a vehicle too small is excluded', () => {
    const m = matchProviders(shipment(2000), [offering({ capacityKg: 1000 })]);
    assert.equal(m.matched.length, 0);
    assert.match(m.excluded[0].reason, /capacity is 1000 kg/i);
  });

  test('a provider who does not carry this class of goods is excluded', () => {
    const m = matchProviders(shipment(200, 'Animal product'), [offering()]);
    assert.equal(m.matched.length, 0);
    assert.match(m.excluded[0].reason, /animal product/i);
  });

  test('a paused offering is excluded', () => {
    const m = matchProviders(shipment(), [offering({ active: false })]);
    assert.equal(m.matched.length, 0);
    assert.match(m.excluded[0].reason, /not currently accepting/i);
  });

  test('a provider who fits is matched and quoted', () => {
    const m = matchProviders(shipment(200), [offering({ ratePerKg: 0.5 })]);
    assert.equal(m.matched.length, 1);
    assert.equal(m.matched[0].quoteUsd, 100);
    assert.equal(m.best?.offering.id, 'o1');
  });

  test('capacity does not exclude when the unit is not kilograms', () => {
    const m = matchProviders(shipment(5000, 'Manufactured', 'pair'), [offering({ capacityKg: 1000 })]);
    assert.equal(m.matched.length, 1, 'cannot compare 5000 pairs against 1000 kg, so do not exclude');
    assert.equal(m.matched[0].capacityHeadroomKg, null);
  });
});

describe('ranking (FR-TRN-02)', () => {
  test('a verified provider outranks an unverified one, even if dearer', () => {
    const m = matchProviders(shipment(200), [
      offering({ id: 'cheap', providerId: 'p1', verifiedByAdmin: false, ratePerKg: 0.1 }),
      offering({ id: 'verified', providerId: 'p2', verifiedByAdmin: true, ratePerKg: 2 }),
    ]);
    assert.equal(m.best?.offering.id, 'verified');
    assert.match(m.decidedBy, /verification/i);
  });

  test('among verified providers, the better rated wins', () => {
    const m = matchProviders(shipment(200), [
      offering({ id: 'ok', providerId: 'p1', verifiedByAdmin: true, meanRating: 3.2, ratingCount: 5 }),
      offering({ id: 'great', providerId: 'p2', verifiedByAdmin: true, meanRating: 4.8, ratingCount: 9 }),
    ]);
    assert.equal(m.best?.offering.id, 'great');
    assert.match(m.decidedBy, /rating/i);
  });

  test('an unrated provider does not outrank a rated one', () => {
    // The same principle the border module applies to crossings with no report:
    // missing evidence is not rewarded.
    const m = matchProviders(shipment(200), [
      offering({ id: 'unrated', providerId: 'p1', verifiedByAdmin: true, meanRating: null }),
      offering({ id: 'rated', providerId: 'p2', verifiedByAdmin: true, meanRating: 2.5, ratingCount: 2 }),
    ]);
    assert.equal(m.best?.offering.id, 'rated');
  });

  test('price decides when verification and rating are equal', () => {
    const m = matchProviders(shipment(200), [
      offering({ id: 'dear', providerId: 'p1', verifiedByAdmin: true, meanRating: 4, ratingCount: 3, ratePerKg: 2 }),
      offering({ id: 'cheap', providerId: 'p2', verifiedByAdmin: true, meanRating: 4, ratingCount: 3, ratePerKg: 1 }),
    ]);
    assert.equal(m.best?.offering.id, 'cheap');
    assert.match(m.decidedBy, /price/i);
  });

  test('the smaller vehicle wins an otherwise exact tie', () => {
    const m = matchProviders(shipment(200), [
      offering({ id: 'big', providerId: 'p1', verifiedByAdmin: true, meanRating: 4, ratingCount: 3, capacityKg: 20000 }),
      offering({ id: 'right', providerId: 'p2', verifiedByAdmin: true, meanRating: 4, ratingCount: 3, capacityKg: 1000 }),
    ]);
    assert.equal(m.best?.offering.id, 'right');
    assert.match(m.decidedBy, /vehicle size/i);
  });

  test('the ranking always explains itself', () => {
    assert.match(matchProviders(shipment(), []).decidedBy, /no provider/i);
    assert.match(matchProviders(shipment(), [offering()]).decidedBy, /only provider/i);
  });

  test('a provider is listed in the exclusions only once', () => {
    const m = matchProviders(shipment(200, 'Animal product'), [
      offering({ id: 'a', providerName: 'Same Firm', corridorId: 'UG-RW' }),
      offering({ id: 'b', providerName: 'Same Firm' }),
    ]);
    assert.equal(m.excluded.length, 1);
  });
});

describe('rating label', () => {
  test('says so plainly when there is no rating', () => {
    assert.equal(ratingLabel(null, 0), 'No rating yet');
  });

  test('reports the mean and how many traders gave it', () => {
    assert.equal(ratingLabel(4.5, 1), '4.5 out of 5 from 1 trader');
    assert.equal(ratingLabel(4.5, 6), '4.5 out of 5 from 6 traders');
  });
});
