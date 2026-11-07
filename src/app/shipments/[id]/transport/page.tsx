/**
 * FR-TRN-02 — present transport providers whose offering fits this shipment,
 * ranked by verification, rating and price.
 *
 * Matching runs against the shipment's own corridor, quantity and product class, so
 * what a trader sees is the set of providers that can actually carry this specific
 * consignment — not a directory to search.
 */
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { sendTransportRequestAction, withdrawRequestAction } from '../../../actions';
import { Notice, PageTitle, StatusPill } from '../../../ui';
import { requireUser } from '@/lib/session';
import { getShipment, listAllOfferings, listRequestsForShipment } from '@/lib/store';
import { matchProviders, ratingLabel } from '@/lib/transport';
import { shortReference } from '@/lib/shipments';
import { fmtUsd } from '@/lib/engines';

export const dynamic = 'force-dynamic';

export default async function TransportPage({
  params, searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string; sent?: string };
}) {
  const user = await requireUser(`/shipments/${params.id}/transport`);
  const shipment = await getShipment(params.id);
  if (!shipment || shipment.userId !== user.id) notFound();

  const [offerings, requests] = await Promise.all([
    listAllOfferings(),
    listRequestsForShipment(shipment.id),
  ]);

  const match = matchProviders(shipment, offerings);
  const requestedOfferings = new Set(
    requests.filter((r) => r.status === 'sent' || r.status === 'accepted').map((r) => r.offeringId),
  );
  const accepted = requests.find((r) => r.status === 'accepted');
  const plan = shipment.planSnapshot;

  return (
    <div className="space-y-6">
      <PageTitle
        title="Find transport"
        subtitle={`${plan.product.name} · ${shipment.quantity} ${plan.product.unit} · ${shortReference(shipment.id)}`}
        back={{ href: `/shipments/${shipment.id}`, label: 'Back to shipment' }}
      />

      {searchParams.sent && (
        <Notice kind="ok">
          Request sent. The provider sees it on their requests page, and you will see their
          answer here.
        </Notice>
      )}
      {searchParams.error && <Notice kind="error">{searchParams.error}</Notice>}

      {/* An accepted carrier settles the question — contact details are exchanged. */}
      {accepted && (
        <section className="rounded-md border border-green-300 bg-green-50 p-4">
          <h2 className="text-base font-semibold text-green-900">Transport arranged</h2>
          <p className="mt-1 text-sm text-green-900">
            <strong className="font-medium">{accepted.providerName}</strong> accepted at{' '}
            {fmtUsd(accepted.quotedUsd)}.
          </p>
          <p className="mt-2 text-sm text-gray-700">
            Contact: <a href={`tel:${accepted.providerPhone}`} className="tappable font-medium text-brand underline">{accepted.providerPhone}</a>
          </p>
          <p className="mt-2 text-xs text-gray-600">
            Contact details are exchanged only once a provider accepts, so neither party&rsquo;s
            number is published to the other before then.
          </p>
        </section>
      )}

      {/* Outstanding requests */}
      {requests.filter((r) => r.status === 'sent').length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-ink">Waiting for an answer</h2>
          <ul className="mt-3 space-y-2">
            {requests.filter((r) => r.status === 'sent').map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white p-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{r.providerName}</p>
                  <p className="text-sm text-gray-600">{fmtUsd(r.quotedUsd)} · sent {new Date(r.createdAt).toLocaleDateString('en-GB')}</p>
                </div>
                <form action={withdrawRequestAction} className="shrink-0">
                  <input type="hidden" name="requestId" value={r.id} />
                  <input type="hidden" name="shipmentId" value={shipment.id} />
                  <button type="submit" style={{ minHeight: 44 }} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-ink">
                    Withdraw
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* FR-TRN-02 ranking */}
      {!accepted && (
        <section>
          <h2 className="text-base font-semibold text-ink">
            Providers who fit <span className="font-normal text-gray-500">({match.matched.length})</span>
          </h2>

          {match.matched.length === 0 ? (
            <div className="mt-3 rounded-md border border-dashed border-gray-300 bg-white p-6 text-center">
              <p className="text-sm text-gray-700">
                No provider currently serves this consignment on this route.
              </p>
              <p className="mt-2 text-xs text-gray-500">
                Transport providers register through the same sign-up page and publish what they
                carry. The pilot corridor is still building its list.
              </p>
            </div>
          ) : (
            <>
              <p className="mt-1 text-sm text-gray-700">
                <span className="font-medium">Top of the list:</span> {match.decidedBy}
              </p>

              <ul className="mt-3 space-y-3">
                {match.matched.map((m, i) => {
                  const o = m.offering;
                  const already = requestedOfferings.has(o.id);
                  return (
                    <li
                      key={o.id}
                      className={`rounded-md border p-4 ${i === 0 ? 'border-brand bg-brand-pale' : 'border-gray-200 bg-white'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-ink">{o.providerBusiness || o.providerName}</p>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {o.verifiedByAdmin
                              ? <StatusPill label="Verified" tone="green" />
                              : <StatusPill label="Not yet verified" tone="amber" />}
                            <StatusPill label={ratingLabel(o.meanRating, o.ratingCount)} tone="grey" />
                            {o.completedJobs > 0 && <StatusPill label={`${o.completedJobs} job(s) carried`} tone="grey" />}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-lg font-bold tabular-nums text-brand">{fmtUsd(m.quoteUsd)}</p>
                          <p className="text-xs text-gray-600">{m.quoteBasis}</p>
                        </div>
                      </div>

                      <dl className="mt-3 space-y-0.5 text-xs text-gray-600">
                        <div><dt className="inline font-medium">Vehicle: </dt><dd className="inline">{o.vehicleType}, {o.capacityKg.toLocaleString()} kg</dd></div>
                        {m.capacityHeadroomKg !== null && (
                          <div><dt className="inline font-medium">Spare capacity: </dt><dd className="inline">{m.capacityHeadroomKg.toLocaleString()} kg</dd></div>
                        )}
                        <div><dt className="inline font-medium">Carries: </dt><dd className="inline">{o.productClasses.join(', ')}</dd></div>
                        {o.baseLocation && <div><dt className="inline font-medium">Based: </dt><dd className="inline">{o.baseLocation}</dd></div>}
                        {o.permits && <div><dt className="inline font-medium">Permits: </dt><dd className="inline">{o.permits}</dd></div>}
                        {o.notes && <div><dt className="inline font-medium">Notes: </dt><dd className="inline">{o.notes}</dd></div>}
                      </dl>

                      {already ? (
                        <p className="mt-3 text-sm font-medium text-gray-600">Already contacted</p>
                      ) : (
                        <form action={sendTransportRequestAction} className="mt-3 space-y-2">
                          <input type="hidden" name="shipmentId" value={shipment.id} />
                          <input type="hidden" name="offeringId" value={o.id} />
                          <label htmlFor={`m-${o.id}`} className="block text-sm font-medium text-ink">
                            Message <span className="font-normal text-gray-500">(optional)</span>
                          </label>
                          <input
                            id={`m-${o.id}`} name="message"
                            placeholder="When you need to travel, where to collect from"
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base"
                          />
                          <button
                            type="submit"
                            className="w-full rounded-md bg-brand px-4 py-3 text-base font-semibold text-white hover:bg-[#17395A]"
                          >
                            Request this provider
                          </button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {match.excluded.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-ink">Not shown</p>
              <ul className="mt-1 space-y-0.5">
                {match.excluded.map((e, i) => (
                  <li key={i} className="text-xs text-gray-600">{e.name} — {e.reason.toLowerCase()}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <p className="text-xs leading-relaxed text-gray-500">
        BorderBridge introduces traders to providers. It is not party to the carriage
        contract, does not hold payment, and the quoted figure is the provider&rsquo;s published
        rate applied to your stated quantity — confirm it with them before travelling.{' '}
        <Link href="/provider" className="font-medium text-brand underline">Carry goods yourself?</Link>
      </p>
    </div>
  );
}
