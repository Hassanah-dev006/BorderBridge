/**
 * NFR-PRI-03 — the right of access, as a page rather than a letter.
 *
 * Everything held about the signed-in user, shown as the JSON they can copy or save.
 * The list of what is *not* included is part of the export, because an export that
 * silently omits things is not an honest answer to "what do you hold about me".
 */
import Link from 'next/link';
import { PageTitle, DatabaseMissing } from '../../ui';
import { requireUser } from '@/lib/session';
import { isConfigured } from '@/lib/db';
import { exportPersonalData } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function ExportPage() {
  const user = await requireUser('/privacy/export');

  if (!isConfigured()) {
    return (
      <div className="space-y-4">
        <PageTitle title="Your data" />
        <DatabaseMissing />
      </div>
    );
  }

  const data = await exportPersonalData(user.id);
  const json = JSON.stringify(data, null, 2);

  const counts: [string, number][] = [
    ['Shipments', data.shipments.length],
    ['Border reports', data.borderReports.length],
    ['Transport offerings', data.transportOfferings.length],
    ['Transport requests', data.transportRequests.length],
    ['Marketplace listings', data.marketListings.length],
    ['Marketplace enquiries', data.marketEnquiries.length],
    ['Subscriptions', data.subscriptions.length],
    ['Notifications', data.notifications.length],
  ];

  return (
    <div className="space-y-6">
      <PageTitle
        title="Everything held about you"
        subtitle="Your right of access under Law No. 058/2021, as a page you can copy or print."
        back={{ href: '/privacy', label: 'Terms and privacy' }}
      />

      <section>
        <h2 className="text-base font-semibold text-ink">In summary</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {counts.map(([label, n]) => (
            <div key={label} className="rounded-md border border-gray-200 bg-white px-3 py-2">
              <p className="text-sm text-gray-600">{label}</p>
              <p className="text-lg font-semibold tabular-nums text-ink">{n}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-ink">What is deliberately not here</h2>
        <ul className="mt-3 space-y-2">
          {data.notIncluded.map((n) => (
            <li key={n.what} className="rounded-md border border-gray-200 bg-white p-3">
              <p className="text-sm font-medium text-ink">{n.what}</p>
              <p className="mt-0.5 text-sm text-gray-700">{n.why}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-base font-semibold text-ink">The whole record</h2>
        <p className="mt-1 text-xs text-gray-500">
          Select all of this and copy it, or use your browser&rsquo;s print option to save it as a
          PDF. It is the same data in the same words the system stores it.
        </p>
        <pre className="mt-2 max-h-[32rem] overflow-auto rounded-md border border-gray-300 bg-white p-3 text-xs leading-relaxed text-ink">
{json}
        </pre>
      </section>

      <p className="text-sm text-gray-700">
        If you want this erased rather than exported,{' '}
        <Link href="/privacy" className="tappable font-medium text-brand underline">
          request deletion
        </Link>
        .
      </p>
    </div>
  );
}
