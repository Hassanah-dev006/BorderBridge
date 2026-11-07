/**
 * FR-SHP-02 — the trader's shipments and where each one has reached.
 */
import Link from 'next/link';
import { PageTitle, StatusPill } from '../ui';
import { requireUser } from '@/lib/session';
import { listShipments, listObtained } from '@/lib/store';
import { readiness, STATUS_LABELS, shortReference } from '@/lib/shipments';

export const dynamic = 'force-dynamic';

export default async function ShipmentsPage() {
  const user = await requireUser('/shipments');
  const shipments = await listShipments(user.id);

  const rows = await Promise.all(
    shipments.map(async (s) => ({ shipment: s, r: readiness(s, await listObtained(s.id)) })),
  );

  return (
    <div className="space-y-5">
      <PageTitle
        title="Your shipments"
        subtitle="Each one keeps the plan exactly as it stood when you created it."
      />

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-300 bg-white p-6 text-center">
          <p className="text-sm text-gray-700">You have not created a shipment yet.</p>
          <Link
            href="/"
            className="tappable mt-4 inline-flex items-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            Plan a trade
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ shipment: s, r }) => (
            <li key={s.id}>
              <Link
                href={`/shipments/${s.id}`}
                className="tappable block rounded-md border border-gray-200 bg-white p-4 hover:border-brand"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {s.planSnapshot.product.name} · {s.quantity} {s.planSnapshot.product.unit}
                    </p>
                    <p className="text-sm text-gray-600">
                      {s.planSnapshot.corridor.originName} → {s.planSnapshot.corridor.destinationName}
                    </p>
                    <p className="mt-1 font-mono text-xs text-gray-500">{shortReference(s.id)}</p>
                  </div>
                  <StatusPill
                    label={STATUS_LABELS[s.status]}
                    tone={s.status === 'delivered' ? 'green' : s.status === 'cancelled' ? 'grey' : 'brand'}
                  />
                </div>

                {s.status !== 'cancelled' && s.status !== 'delivered' && (
                  <div className="mt-3">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                      <div className="h-full bg-brand" style={{ width: `${r.percentComplete}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-gray-600">
                      {r.readyToTravel
                        ? 'All mandatory documents obtained'
                        : `Next: ${r.blockingItem?.name ?? '—'}`}
                    </p>
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
