import Link from 'next/link';
import { OFFLINE_READABLE } from '@/lib/offline';

export const metadata = { title: 'Offline — BorderBridge' };

const LABELS: Record<string, string> = {
  '/': 'Plan a consignment',
  '/plan': 'Your last trade plan',
  '/shipments': 'Your shipments',
  '/report': 'Border conditions',
};

/**
 * Shown when the trader opens a page they have never opened before, with no
 * connection to fetch it.
 *
 * The browser's own error page says the site cannot be reached, which is both wrong
 * and alarming: the application is installed and working, this one page has simply
 * never been stored. Saying so, and pointing at the pages that were stored, is the
 * difference between a tool that degrades and a tool that appears broken.
 */
export default function OfflinePage() {
  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">You are offline</h1>
        <p className="text-sm leading-relaxed text-gray-700">
          This page has not been opened on this phone before, so there is no copy saved
          to read. Pages you have already opened are still available below.
        </p>
      </header>

      <nav aria-label="Saved pages" className="space-y-2">
        {OFFLINE_READABLE.map((href) => (
          <Link
            key={href}
            href={href}
            // border-brand, not brand-light: this border is the boundary of a control,
            // so WCAG 2.2 §1.4.11 asks 3:1 of it. A decorative panel border does not
            // carry that obligation; this one does.
            className="tappable flex items-center justify-between rounded-lg border border-brand bg-white px-4 py-3 text-sm font-medium text-brand"
          >
            {LABELS[href] ?? href}
            <span aria-hidden>→</span>
          </Link>
        ))}
      </nav>

      <section className="rounded-lg border border-gold bg-gold-pale px-4 py-3 text-sm leading-relaxed text-ink">
        <h2 className="font-semibold">While you are offline</h2>
        <p className="mt-1">
          You can read anything already saved. You cannot sign in, send a border report,
          or update a shipment. Those need a connection, and the app will not pretend
          otherwise by queuing them quietly.
        </p>
      </section>

      <p className="text-xs leading-relaxed text-gray-500">
        Saved pages show the time they were loaded. Duty rates and border conditions
        change, so check a saved page again before you travel.
      </p>
    </div>
  );
}
