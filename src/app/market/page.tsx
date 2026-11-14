/**
 * FR-MKT-01 — publish what you wish to buy or sell.
 * FR-MKT-03 — enquire about a listing without either party disclosing contact details.
 *
 * No phone number reaches this page. The listing query does not select one, and the
 * type it returns cannot carry one — contact details are released only when an
 * enquiry is accepted, on the enquiries page.
 */
import Link from 'next/link';
import { saveListingAction, toggleListingAction, sendEnquiryAction } from '../actions';
import { Field, Select, Submit, Notice, PageTitle, StatusPill, DatabaseMissing } from '../ui';
import { requireUser } from '@/lib/session';
import { isConfigured } from '@/lib/db';
import { listActiveListings, listUserListings, enquiredListingIds } from '@/lib/store';
import { listProducts, listSupportedCorridors } from '@/lib/repository';
import { publicName, priceLabel, quantityLabel, LISTING_TTL_DAYS } from '@/lib/market';

export const dynamic = 'force-dynamic';

export default async function MarketPage({
  searchParams,
}: {
  searchParams: { error?: string; saved?: string; sent?: string; kind?: string };
}) {
  const user = await requireUser('/market');
  if (!isConfigured()) {
    return (
      <div className="space-y-4">
        <PageTitle title="Marketplace" />
        <DatabaseMissing />
      </div>
    );
  }

  const [all, mine, enquired] = await Promise.all([
    listActiveListings(),
    listUserListings(user.id),
    enquiredListingIds(user.id),
  ]);

  const products = listProducts();
  const corridors = listSupportedCorridors();
  const countries = Array.from(
    new Map(corridors.flatMap((c) => [
      [c.originCountry, c.originName] as [string, string],
      [c.destinationCountry, c.destinationName] as [string, string],
    ])).entries(),
  );
  const countryName = (code: string) => countries.find(([c]) => c === code)?.[1] ?? code;

  const show = searchParams.kind === 'buying' ? 'buying' : searchParams.kind === 'selling' ? 'selling' : 'all';
  const others = all
    .filter((l) => l.userId !== user.id)
    .filter((l) => (show === 'all' ? true : l.kind === show));
  const existing = mine[0];

  return (
    <div className="space-y-6">
      <PageTitle
        title="Marketplace"
        subtitle="Find someone to buy from or sell to, on the other side of the border."
      />

      {searchParams.saved && <Notice kind="ok">Your listing is published.</Notice>}
      {searchParams.sent && (
        <Notice kind="ok">
          <strong className="font-semibold">Enquiry sent.</strong> They will see your message, but
          not your phone number — that is exchanged only if they accept.
        </Notice>
      )}
      {searchParams.error && <Notice kind="error">{searchParams.error}</Notice>}

      <Link
        href="/market/enquiries"
        className="tappable flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-3 text-base font-medium text-ink"
      >
        My enquiries
      </Link>

      {/* Browse */}
      <section>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">
            Listings <span className="font-normal text-gray-500">({others.length})</span>
          </h2>
          <div className="flex gap-2 text-sm">
            <FilterLink current={show} value="all" label="All" />
            <FilterLink current={show} value="buying" label="Wanted" />
            <FilterLink current={show} value="selling" label="For sale" />
          </div>
        </div>

        {others.length === 0 ? (
          <div className="mt-3 rounded-md border border-dashed border-gray-300 bg-white p-6 text-center">
            <p className="text-sm text-gray-700">No listings yet.</p>
            <p className="mt-2 text-xs text-gray-500">
              The pilot corridor is still building its list. Publish yours below and it will be
              shown to traders planning a consignment of the same goods.
            </p>
          </div>
        ) : (
          <ul className="mt-3 space-y-3">
            {others.map((l) => {
              const already = enquired.includes(l.id);
              return (
                <li key={l.id} className="rounded-md border border-gray-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">
                        {l.kind === 'buying' ? 'Wanted: ' : 'For sale: '}{l.productName}
                      </p>
                      <p className="text-sm text-gray-600">
                        {quantityLabel(l)} · {priceLabel(l)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {publicName(l)} · {l.location ? `${l.location}, ` : ''}{countryName(l.country)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {l.ownerVerified && <StatusPill label="Verified" tone="green" />}
                      <StatusPill
                        label={l.daysRemaining <= 7 ? `${l.daysRemaining}d left` : 'Current'}
                        tone={l.daysRemaining <= 7 ? 'amber' : 'grey'}
                      />
                    </div>
                  </div>

                  {l.note && <p className="mt-2 text-sm text-gray-700">{l.note}</p>}

                  {already ? (
                    <p className="mt-3 text-sm font-medium text-gray-600">Already contacted</p>
                  ) : (
                    <form action={sendEnquiryAction} className="mt-3 space-y-2">
                      <input type="hidden" name="listingId" value={l.id} />
                      <label htmlFor={`m-${l.id}`} className="block text-sm font-medium text-ink">
                        Your message
                      </label>
                      <input
                        id={`m-${l.id}`} name="message"
                        placeholder="What you have, when you could move it"
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base"
                      />
                      <button
                        type="submit"
                        className="w-full rounded-md bg-brand px-4 py-3 text-base font-semibold text-white hover:bg-[#17395A]"
                      >
                        Send enquiry
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Your own listings */}
      {mine.length > 0 && (
        <section className="border-t border-gray-200 pt-5">
          <h2 className="text-base font-semibold text-ink">Your listings</h2>
          <ul className="mt-3 space-y-2">
            {mine.map((l) => (
              <li key={l.id} className="rounded-md border border-gray-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {l.kind === 'buying' ? 'Wanted: ' : 'For sale: '}{l.productName}
                    </p>
                    <p className="text-sm text-gray-600">{quantityLabel(l)} · {priceLabel(l)}</p>
                    <p className="text-xs text-gray-500">
                      {countryName(l.country)} ·{' '}
                      {l.expired ? 'Expired' : `${l.daysRemaining} days left`}
                    </p>
                  </div>
                  <form action={toggleListingAction} className="shrink-0">
                    <input type="hidden" name="listingId" value={l.id} />
                    <input type="hidden" name="active" value={l.active ? 'false' : 'true'} />
                    <button
                      type="submit" style={{ minHeight: 44 }}
                      className={`rounded-md px-3 py-2 text-sm font-medium ${
                        l.active ? 'border border-gray-300 bg-white text-ink' : 'bg-brand text-white'
                      }`}
                    >
                      {l.active ? 'Pause' : 'Resume'}
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Publish */}
      <section className="border-t border-gray-200 pt-5">
        <h2 className="text-base font-semibold text-ink">
          {existing ? 'Publish another listing' : 'Publish a listing'}
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          Listings last {LISTING_TTL_DAYS} days, then need renewing — a price from three months ago
          misleads rather than helps. Publishing again for the same product and market replaces it.
        </p>

        <form action={saveListingAction} className="mt-4 space-y-4">
          <Select
            label="I am" name="kind" defaultValue="selling"
            options={[
              { value: 'selling', label: 'Selling — I have goods to sell' },
              { value: 'buying', label: 'Buying — I am looking for goods' },
            ]}
          />
          <Select
            label="Product" name="productId" defaultValue="coffee-green"
            options={products.map((p) => ({ value: p.id, label: `${p.name} (${p.hsCode})` }))}
          />
          <Select
            label="Market" name="country" defaultValue="RW"
            options={countries.map(([code, name]) => ({ value: code, label: name }))}
            hint="Where the goods are, or where you want them."
          />
          <Field label="Where exactly" name="location" hint="For example: Kigali, Nyabugogo market." />

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Quantity" name="quantity" type="number" inputMode="numeric" min={1} step="any"
              hint="Leave blank if negotiable."
            />
            <Field
              label="Price per unit" name="pricePerUnit" type="number" inputMode="numeric" min={0} step="0.01"
              hint="Leave blank for “price on enquiry”."
            />
          </div>

          <Select
            label="Currency" name="currency" defaultValue="USD"
            options={[
              { value: 'USD', label: 'USD' },
              { value: 'RWF', label: 'RWF' },
              { value: 'UGX', label: 'UGX' },
            ]}
          />
          <Field label="Anything else" name="note" hint="Grade, packaging, when you can trade." />

          <Submit>Publish listing</Submit>
        </form>

        <p className="mt-3 text-xs leading-relaxed text-gray-500">
          Your phone number is never shown on a listing. Someone interested sends you a message;
          you decide whether to exchange contact details.
        </p>
      </section>
    </div>
  );
}

function FilterLink({ current, value, label }: { current: string; value: string; label: string }) {
  const on = current === value;
  return (
    <Link
      href={value === 'all' ? '/market' : `/market?kind=${value}`}
      className={`tappable inline-flex items-center rounded-md px-3 py-2 font-medium ${
        on ? 'bg-brand text-white' : 'border border-gray-300 bg-white text-ink'
      }`}
    >
      {label}
    </Link>
  );
}
