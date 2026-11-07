/**
 * FR-TRN-01 — a verified transport provider publishes the routes served, vehicle
 * capacity, permits held and rates.
 *
 * An unverified provider may still publish; their offering simply sorts below
 * verified ones and is labelled as such, which is the honest arrangement. Hiding
 * them entirely would leave a new provider with no route to a first job.
 */
import Link from 'next/link';
import { saveOfferingAction, toggleOfferingAction } from '../actions';
import { Field, Select, Submit, Notice, PageTitle, StatusPill } from '../ui';
import { requireUser } from '@/lib/session';
import { listProviderOfferings, listRequestsForProvider } from '@/lib/store';
import { listSupportedCorridors } from '@/lib/repository';
import { PRODUCT_CLASSES, VEHICLE_TYPES, ratingLabel } from '@/lib/transport';

export const dynamic = 'force-dynamic';

export default async function ProviderPage({
  searchParams,
}: {
  searchParams: { error?: string; saved?: string };
}) {
  const user = await requireUser('/provider');

  if (user.role !== 'provider') {
    return (
      <div className="space-y-4">
        <PageTitle title="Transport provider" />
        <Notice kind="info">
          This page is for transport providers. Your account is registered as a{' '}
          {user.role === 'admin' ? 'administrator' : 'trader'}. If you also carry goods for
          others, register a separate provider account.
        </Notice>
      </div>
    );
  }

  const [offerings, requests] = await Promise.all([
    listProviderOfferings(user.id),
    listRequestsForProvider(user.id),
  ]);
  const corridors = listSupportedCorridors();
  const waiting = requests.filter((r) => r.status === 'sent').length;
  const existing = offerings[0];

  return (
    <div className="space-y-6">
      <PageTitle
        title="What you offer"
        subtitle="Traders planning a consignment on your route will see this."
      />

      {searchParams.saved && <Notice kind="ok">Your offering has been published.</Notice>}
      {searchParams.error && <Notice kind="error">{searchParams.error}</Notice>}

      <div className="flex flex-wrap items-center gap-2">
        <StatusPill
          label={user.verifiedByAdmin ? 'Verified by administrator' : 'Awaiting verification'}
          tone={user.verifiedByAdmin ? 'green' : 'amber'}
        />
        {existing && <StatusPill label={ratingLabel(existing.meanRating, existing.ratingCount)} tone="grey" />}
      </div>

      {!user.verifiedByAdmin && (
        <Notice kind="info">
          Your offering is visible to traders, but verified providers are shown above you.
          An administrator reviews new provider accounts.
        </Notice>
      )}

      {waiting > 0 && (
        <Notice kind="ok">
          You have {waiting} request{waiting === 1 ? '' : 's'} waiting.{' '}
          <Link href="/requests" className="font-medium underline">Answer them</Link>
        </Notice>
      )}

      {/* Published offerings */}
      {offerings.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-ink">Published</h2>
          <ul className="mt-3 space-y-2">
            {offerings.map((o) => {
              const corridor = corridors.find((c) => c.id === o.corridorId);
              return (
                <li key={o.id} className="rounded-md border border-gray-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">
                        {corridor ? `${corridor.originName} → ${corridor.destinationName}` : o.corridorId}
                      </p>
                      <p className="text-sm text-gray-600">
                        {o.vehicleType} · {o.capacityKg.toLocaleString()} kg · USD {o.ratePerKg.toFixed(2)}/kg
                        {o.minimumCharge > 0 && ` (minimum USD ${o.minimumCharge.toFixed(2)})`}
                      </p>
                      <p className="text-xs text-gray-500">{o.productClasses.join(' · ')}</p>
                    </div>
                    <form action={toggleOfferingAction} className="shrink-0">
                      <input type="hidden" name="offeringId" value={o.id} />
                      <input type="hidden" name="active" value={o.active ? 'false' : 'true'} />
                      <button
                        type="submit" style={{ minHeight: 44 }}
                        className={`rounded-md px-3 py-2 text-sm font-medium ${
                          o.active ? 'border border-gray-300 bg-white text-ink' : 'bg-brand text-white'
                        }`}
                      >
                        {o.active ? 'Pause' : 'Resume'}
                      </button>
                    </form>
                  </div>
                  {!o.active && <p className="mt-2 text-xs text-amber-800">Paused — traders cannot see this.</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Publish or amend */}
      <section className={offerings.length > 0 ? 'border-t border-gray-200 pt-5' : ''}>
        <h2 className="text-base font-semibold text-ink">
          {existing ? 'Update your offering' : 'Publish your offering'}
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          One offering per route. Publishing again for the same route replaces it.
        </p>

        <form action={saveOfferingAction} className="mt-4 space-y-4">
          <Select
            label="Route you serve" name="corridorId" defaultValue={existing?.corridorId}
            options={corridors.map((c) => ({ value: c.id, label: `${c.originName} → ${c.destinationName}` }))}
          />
          <Select
            label="Vehicle" name="vehicleType" defaultValue={existing?.vehicleType ?? 'Pickup'}
            options={VEHICLE_TYPES.map((v) => ({ value: v, label: v }))}
          />
          <Field
            label="Capacity" name="capacityKg" type="number" required inputMode="numeric"
            min={1} max={60000} defaultValue={existing?.capacityKg ?? 1000}
            hint="In kilograms. Traders with a heavier consignment will not see you."
          />

          <fieldset>
            <legend className="block text-sm font-medium text-ink">Goods you carry</legend>
            <p className="text-xs text-gray-500">Choose every class you are equipped for.</p>
            <div className="mt-2 space-y-2">
              {PRODUCT_CLASSES.map((c) => (
                <label key={c} className="flex items-center gap-3 rounded-md border border-gray-300 bg-white px-3 py-2" style={{ minHeight: 44 }}>
                  <input
                    type="checkbox" name="productClasses" value={c}
                    defaultChecked={existing ? existing.productClasses.includes(c) : true}
                    className="h-5 w-5"
                  />
                  <span className="text-base text-ink">{c}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Rate per kg (USD)" name="ratePerKg" type="number" required
              inputMode="numeric" min={0} step="0.01" defaultValue={existing?.ratePerKg ?? 0.9}
            />
            <Field
              label="Minimum charge (USD)" name="minimumCharge" type="number"
              inputMode="numeric" min={0} step="0.01" defaultValue={existing?.minimumCharge ?? 40}
            />
          </div>

          <Field
            label="Where you are based" name="baseLocation" defaultValue={existing?.baseLocation ?? ''}
            hint="For example: Kigali, Nyabugogo."
          />
          <Field
            label="Permits and licences" name="permits" defaultValue={existing?.permits ?? ''}
            hint="For example: EAC transit licence, goods-in-transit insurance. Shown to traders."
          />
          <Field
            label="Anything else" name="notes" defaultValue={existing?.notes ?? ''}
            hint="For example: departs Tuesdays and Fridays, cold chain available."
          />

          <Submit>{existing ? 'Update offering' : 'Publish offering'}</Submit>
        </form>
      </section>
    </div>
  );
}
