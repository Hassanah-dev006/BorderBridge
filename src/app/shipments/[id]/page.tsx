/**
 * FR-SHP-01 / FR-SHP-02 — one shipment: the frozen plan, document progress and the
 * milestone trail.
 *
 * Everything shown here comes from the snapshot taken when the shipment was created,
 * not from recomputing the plan. If a duty rate changes tomorrow, this page still
 * shows what the trader was told — which is the point of an immutable snapshot
 * (SRS FR-SHP-01, NFR-ACC-05).
 */
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { toggleChecklistAction, advanceShipmentAction, rateProviderAction } from '../../actions';
import { Notice, PageTitle, StatusPill } from '../../ui';
import { requireUser } from '@/lib/session';
import { getShipment, listObtained, listMilestones, acceptedCarrier, getRating } from '@/lib/store';
import {
  readiness, allowedNextStatuses, STATUS_LABELS, STATUS_HINTS, shortReference, statusIndex,
} from '@/lib/shipments';
import { SHIPMENT_STATUSES } from '@/lib/types';
import { fmtUsd } from '@/lib/engines';

export const dynamic = 'force-dynamic';

export default async function ShipmentPage({
  params, searchParams,
}: {
  params: { id: string };
  searchParams: { created?: string; error?: string; rated?: string };
}) {
  const user = await requireUser(`/shipments/${params.id}`);
  const shipment = await getShipment(params.id);
  if (!shipment || shipment.userId !== user.id) notFound();

  const [obtained, milestones, carrier, rating] = await Promise.all([
    listObtained(shipment.id),
    listMilestones(shipment.id),
    acceptedCarrier(shipment.id),
    getRating(shipment.id),
  ]);
  const r = readiness(shipment, obtained);
  const next = allowedNextStatuses(shipment.status, r.readyToTravel);
  const plan = shipment.planSnapshot;
  const current = statusIndex(shipment.status);

  return (
    <div className="space-y-6">
      <PageTitle
        title={`${plan.product.name} · ${shipment.quantity} ${plan.product.unit}`}
        subtitle={`${plan.corridor.originName} → ${plan.corridor.destinationName} · ${shortReference(shipment.id)}`}
        back={{ href: '/shipments', label: 'All shipments' }}
      />

      {searchParams.created && (
        <Notice kind="ok">
          <strong className="font-semibold">Shipment created.</strong> The plan above is now frozen —
          it will not change even if the underlying rules are amended.
        </Notice>
      )}
      {searchParams.rated && <Notice kind="ok">Thank you — your rating helps other traders choose.</Notice>}
      {searchParams.error && <Notice kind="error">{searchParams.error}</Notice>}

      {/* FR-SHP-02 — milestone trail */}
      <section>
        <h2 className="text-base font-semibold text-ink">Where it has reached</h2>
        <ol className="mt-3 space-y-0">
          {SHIPMENT_STATUSES.map((s, i) => {
            const reached = shipment.status !== 'cancelled' && i <= current;
            const isNow = s === shipment.status;
            const at = milestones.find((m) => m.status === s);
            return (
              <li key={s} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                      reached ? 'border-brand bg-brand' : 'border-gray-300 bg-white'
                    }`}
                  />
                  {i < SHIPMENT_STATUSES.length - 1 && (
                    <span className={`w-0.5 flex-1 ${i < current ? 'bg-brand' : 'bg-gray-200'}`} style={{ minHeight: 28 }} />
                  )}
                </div>
                <div className="pb-4">
                  <p className={`text-sm ${isNow ? 'font-semibold text-ink' : reached ? 'text-ink' : 'text-gray-400'}`}>
                    {STATUS_LABELS[s]}
                    {isNow && <span className="ml-2 text-xs font-normal text-brand">now</span>}
                  </p>
                  {at && (
                    <p className="text-xs text-gray-500">
                      {new Date(at.recordedAt).toLocaleString('en-GB')}
                      {at.note && ` — ${at.note}`}
                    </p>
                  )}
                  {isNow && <p className="text-xs text-gray-600">{STATUS_HINTS[s]}</p>}
                </div>
              </li>
            );
          })}
        </ol>

        {shipment.status === 'cancelled' && <StatusPill label="Cancelled" tone="grey" />}

        {next.length > 0 && (
          <div className="mt-2 space-y-2">
            {next.map((s) => (
              <form key={s} action={advanceShipmentAction}>
                <input type="hidden" name="shipmentId" value={shipment.id} />
                <input type="hidden" name="status" value={s} />
                <button
                  type="submit"
                  className={`w-full rounded-md px-4 py-3 text-base font-semibold ${
                    s === 'cancelled'
                      ? 'border border-gray-300 bg-white text-gray-700'
                      : 'bg-brand text-white hover:bg-[#17395A]'
                  }`}
                >
                  {s === 'cancelled' ? 'Cancel this shipment' : `Mark as ${STATUS_LABELS[s].toLowerCase()}`}
                </button>
              </form>
            ))}
          </div>
        )}

        {!r.readyToTravel && shipment.status === 'planned' && (
          <p className="mt-2 text-sm text-gray-600">
            You cannot mark this shipment ready to travel until every mandatory document is obtained.
            Outstanding: <strong className="font-medium text-ink">{r.blockingItem?.name}</strong>.
          </p>
        )}
      </section>

      {/* Frozen checklist with progress */}
      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-ink">Documents</h2>
          <span className="text-sm text-gray-600">{r.percentComplete}% obtained</span>
        </div>

        <ul className="mt-3 space-y-2">
          {plan.checklist.map((item) => {
            const have = obtained.includes(item.ruleId);
            return (
              <li key={item.ruleId} className={`rounded-md border p-3 ${have ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`font-medium ${have ? 'text-green-900 line-through' : 'text-ink'}`}>
                      {item.name}
                      {item.mandatory && !have && (
                        <span className="ml-2 text-xs font-normal text-red-700">required</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-600">{item.issuingAuthority}</p>
                    {!have && (
                      <p className="text-xs text-gray-500">Typically takes: {item.estimatedProcessingTime}</p>
                    )}
                  </div>
                  <form action={toggleChecklistAction} className="shrink-0">
                    <input type="hidden" name="shipmentId" value={shipment.id} />
                    <input type="hidden" name="ruleId" value={item.ruleId} />
                    <input type="hidden" name="obtained" value={have ? 'false' : 'true'} />
                    <button
                      type="submit"
                      className={`rounded-md px-3 py-2 text-sm font-medium ${
                        have ? 'border border-green-400 bg-white text-green-800' : 'bg-brand text-white'
                      }`}
                      style={{ minHeight: 44 }}
                    >
                      {have ? 'Undo' : 'I have it'}
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* FR-TRN-02 — transport for this shipment */}
      <section className="border-t border-gray-200 pt-5">
        <h2 className="text-base font-semibold text-ink">Transport</h2>

        {carrier ? (
          <div className="mt-3 rounded-md border border-green-300 bg-green-50 p-3">
            <p className="font-medium text-green-900">{carrier.providerName}</p>
            <p className="text-sm text-gray-700">
              {carrier.vehicleType} · {fmtUsd(carrier.quotedUsd)} · accepted{' '}
              {carrier.respondedAt ? new Date(carrier.respondedAt).toLocaleDateString('en-GB') : ''}
            </p>
            <p className="mt-1 text-sm text-gray-700">
              Contact:{' '}
              <a href={`tel:${carrier.providerPhone}`} className="tappable font-medium text-brand underline">
                {carrier.providerPhone}
              </a>
            </p>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-gray-700">
              Find a provider who carries this class of goods on this route, ranked by
              verification, rating and price.
            </p>
            <Link
              href={`/shipments/${shipment.id}/transport`}
              className="tappable mt-3 flex items-center justify-center rounded-md border border-brand bg-white px-4 py-3 text-base font-semibold text-brand"
            >
              Find transport
            </Link>
          </>
        )}

        {/* Rating, once the goods have actually arrived */}
        {carrier && shipment.status === 'delivered' && (
          <div className="mt-4">
            {rating ? (
              <div className="rounded-md border border-gray-200 bg-white p-3">
                <p className="text-sm font-medium text-ink">You rated {carrier.providerName} {rating.stars} out of 5</p>
                {rating.comment && <p className="mt-1 text-sm text-gray-700">{rating.comment}</p>}
                <p className="mt-1 text-xs text-gray-500">Submit again below to change it.</p>
              </div>
            ) : (
              <p className="text-sm font-medium text-ink">How did {carrier.providerName} do?</p>
            )}

            <form action={rateProviderAction} className="mt-2 space-y-2">
              <input type="hidden" name="shipmentId" value={shipment.id} />
              <label htmlFor="stars" className="block text-sm text-gray-700">Rating</label>
              <select
                id="stars" name="stars" defaultValue={String(rating?.stars ?? 5)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base"
              >
                <option value="5">5 — excellent</option>
                <option value="4">4 — good</option>
                <option value="3">3 — acceptable</option>
                <option value="2">2 — poor</option>
                <option value="1">1 — bad</option>
              </select>
              <input
                name="comment" defaultValue={rating?.comment ?? ''}
                placeholder="Anything other traders should know (optional)"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base"
              />
              <button
                type="submit"
                className="w-full rounded-md bg-brand px-4 py-3 text-base font-semibold text-white hover:bg-[#17395A]"
              >
                {rating ? 'Update rating' : 'Submit rating'}
              </button>
            </form>
            <p className="mt-1 text-xs text-gray-500">
              Only a trader whose shipment was delivered can rate, so every rating
              corresponds to a movement that actually happened.
            </p>
          </div>
        )}
      </section>

      {/* The frozen plan, for reference */}
      <section>
        <h2 className="text-base font-semibold text-ink">The plan as it stood</h2>
        <div className="mt-3 space-y-2 rounded-md border border-gray-200 bg-white p-4 text-sm">
          <Row label="Recommended crossing" value={plan.recommendedCrossing} />
          <Row label="Simplified Trade Regime" value={plan.eligibility.eligible ? 'Qualifies' : 'Does not qualify'} />
          <Row label="Estimated total" value={`${fmtUsd(plan.cost.totalUsd)} ± ${plan.cost.confidencePercent}%`} />
          <Row label="Planned on" value={new Date(plan.generatedAt).toLocaleString('en-GB')} />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          This is a snapshot. To price the same consignment against today&rsquo;s rules,{' '}
          <Link href="/" className="font-medium text-brand underline">plan it again</Link>.
        </p>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 pb-2 last:border-0 last:pb-0">
      <span className="text-gray-600">{label}</span>
      <span className="text-right font-medium text-ink">{value}</span>
    </div>
  );
}
