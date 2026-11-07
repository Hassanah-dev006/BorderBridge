/**
 * The provider's side of FR-TRN-02 — incoming requests, and accepting or declining.
 *
 * Accepting one request withdraws the trader's other outstanding requests for the
 * same shipment, so other providers are not left waiting on a job already taken.
 */
import Link from 'next/link';
import { respondToRequestAction } from '../actions';
import { Notice, PageTitle, StatusPill } from '../ui';
import { requireUser } from '@/lib/session';
import { listRequestsForProvider } from '@/lib/store';
import { shortReference } from '@/lib/shipments';
import { fmtUsd } from '@/lib/engines';

export const dynamic = 'force-dynamic';

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: { error?: string; accepted?: string; declined?: string };
}) {
  const user = await requireUser('/requests');

  if (user.role !== 'provider') {
    return (
      <div className="space-y-4">
        <PageTitle title="Transport requests" />
        <Notice kind="info">
          This page is for transport providers. As a trader, your requests appear on the
          shipment itself — open a shipment and choose <em>Find transport</em>.
        </Notice>
        <Link
          href="/shipments"
          className="tappable flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-3 text-base font-medium text-ink"
        >
          My shipments
        </Link>
      </div>
    );
  }

  const requests = await listRequestsForProvider(user.id);
  const waiting = requests.filter((r) => r.status === 'sent');
  const answered = requests.filter((r) => r.status !== 'sent');

  return (
    <div className="space-y-6">
      <PageTitle title="Transport requests" subtitle="Traders who want you to carry their goods." />

      {searchParams.accepted && (
        <Notice kind="ok">
          <strong className="font-semibold">Accepted.</strong> The trader can now see your phone
          number and will contact you to arrange collection.
        </Notice>
      )}
      {searchParams.declined && <Notice kind="ok">Declined. The trader has been told.</Notice>}
      {searchParams.error && <Notice kind="error">{searchParams.error}</Notice>}

      <section>
        <h2 className="text-base font-semibold text-ink">
          Waiting for you <span className="font-normal text-gray-500">({waiting.length})</span>
        </h2>

        {waiting.length === 0 ? (
          <div className="mt-3 rounded-md border border-dashed border-gray-300 bg-white p-6 text-center">
            <p className="text-sm text-gray-700">Nothing waiting.</p>
            <Link
              href="/provider"
              className="tappable mt-4 inline-flex items-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white"
            >
              Check your offering
            </Link>
          </div>
        ) : (
          <ul className="mt-3 space-y-3">
            {waiting.map((r) => (
              <li key={r.id} className="rounded-md border border-brand bg-brand-pale p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {r.productName} · {r.quantity} {r.unit}
                    </p>
                    <p className="text-sm text-gray-700">
                      {r.traderName} · {r.vehicleType}
                    </p>
                    <p className="mt-1 font-mono text-xs text-gray-500">{shortReference(r.shipmentId)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-lg font-bold tabular-nums text-brand">{fmtUsd(r.quotedUsd)}</p>
                    <p className="text-xs text-gray-600">your published rate</p>
                  </div>
                </div>

                {r.message && (
                  <p className="mt-3 rounded-md border-l-2 border-gray-300 bg-white px-3 py-2 text-sm text-gray-700">
                    {r.message}
                  </p>
                )}

                <p className="mt-2 text-xs text-gray-500">
                  Asked {new Date(r.createdAt).toLocaleString('en-GB')}
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <form action={respondToRequestAction}>
                    <input type="hidden" name="requestId" value={r.id} />
                    <input type="hidden" name="status" value="accepted" />
                    <button
                      type="submit"
                      className="w-full rounded-md bg-brand px-4 py-3 text-base font-semibold text-white hover:bg-[#17395A]"
                    >
                      Accept
                    </button>
                  </form>
                  <form action={respondToRequestAction}>
                    <input type="hidden" name="requestId" value={r.id} />
                    <input type="hidden" name="status" value="declined" />
                    <button
                      type="submit"
                      className="w-full rounded-md border border-gray-300 bg-white px-4 py-3 text-base font-medium text-ink"
                    >
                      Decline
                    </button>
                  </form>
                </div>

                <p className="mt-2 text-xs text-gray-600">
                  Accepting shares your phone number with this trader.
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {answered.length > 0 && (
        <section className="border-t border-gray-200 pt-5">
          <h2 className="text-base font-semibold text-ink">Answered</h2>
          <ul className="mt-3 space-y-2">
            {answered.map((r) => (
              <li key={r.id} className="rounded-md border border-gray-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{r.productName} · {r.quantity} {r.unit}</p>
                    <p className="text-sm text-gray-600">{r.traderName} · {fmtUsd(r.quotedUsd)}</p>
                    {r.status === 'accepted' && (
                      <p className="mt-1 text-sm text-gray-700">
                        Contact:{' '}
                        <a href={`tel:${r.traderPhone}`} className="tappable font-medium text-brand underline">
                          {r.traderPhone}
                        </a>
                      </p>
                    )}
                  </div>
                  <StatusPill
                    label={r.status === 'accepted' ? 'Accepted' : r.status === 'declined' ? 'Declined' : 'Withdrawn'}
                    tone={r.status === 'accepted' ? 'green' : 'grey'}
                  />
                </div>
                {r.status === 'withdrawn' && (
                  <p className="mt-1 text-xs text-gray-500">
                    The trader arranged transport elsewhere, or withdrew the request.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
