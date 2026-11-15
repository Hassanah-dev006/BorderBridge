import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { currentUser } from '@/lib/session';
import { unreadCount } from '@/lib/store';
import { isConfigured } from '@/lib/db';
import { withLanguage } from '@/lib/language';
import { languageName } from '@/lib/i18n';
import OfflineStatus from './offline-status';
import ServiceWorker from './service-worker';

export const metadata: Metadata = {
  title: 'BorderBridge',
  description: 'Know what your consignment needs, and what it will cost, before you travel.',
  applicationName: 'BorderBridge',
  appleWebApp: { capable: true, title: 'BorderBridge', statusBarStyle: 'default' },
  icons: {
    icon: [
      { url: '/icon.png', sizes: '64x64', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Matches the header, so the status bar continues the page in standalone mode.
  themeColor: '#1B5E3F',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const { lang, tr } = await withLanguage();
  let unread = 0;
  if (user && isConfigured()) {
    try {
      unread = await unreadCount(user.id);
    } catch {
      /* a missing badge must never stop the shell rendering */
    }
  }

  // Stamped into the markup so that a page replayed from the cache can say how old it
  // is (Section 3.1, NFR-REL-02). The service worker stores this response whole, so
  // the timestamp travels with the content it describes.
  const renderedAt = new Date().toISOString();

  return (
    <html lang={lang}>
      <body className="min-h-screen">
        <ServiceWorker accountKey={user?.id ?? 'anonymous'} />
        {/* The one colour both flags on this corridor share. */}
        <div className="h-1 w-full bg-gold-bright" aria-hidden />
        <OfflineStatus renderedAt={renderedAt} />
        <header className="bg-brand text-white">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="tappable inline-flex flex-col justify-center">
              <span className="text-lg font-semibold tracking-tight">BorderBridge</span>
              <span className="text-xs text-brand-light">{tr('app.tagline')}</span>
            </Link>

            {user ? (
              <Link
                href="/profile"
                className="tappable inline-flex items-center rounded-md bg-white/15 px-3 py-2 text-sm font-medium"
              >
                {user.displayName.split(' ')[0]}
              </Link>
            ) : (
              <Link
                href="/login"
                className="tappable inline-flex items-center rounded-md bg-white/15 px-3 py-2 text-sm font-medium"
              >
                {tr('nav.signin')}
              </Link>
            )}
          </div>

          <nav className="border-t border-white/15">
            <div className="mx-auto flex max-w-2xl gap-1 overflow-x-auto px-2 py-1 text-sm">
              <NavLink href="/">{tr('nav.plan')}</NavLink>
              <NavLink href="/shipments">{tr('nav.shipments')}</NavLink>
              <NavLink href="/report">{tr('nav.reports')}</NavLink>
              <NavLink href="/market">{tr('nav.market')}</NavLink>
              {user && (
                <NavLink href="/notifications">
                  {tr('nav.alerts')}{unread > 0 ? ` (${unread})` : ''}
                </NavLink>
              )}
              {user?.role === 'provider' && <NavLink href="/provider">{tr('nav.offering')}</NavLink>}
              {user?.role === 'provider' && <NavLink href="/requests">{tr('nav.requests')}</NavLink>}
              {user?.role === 'admin' && <NavLink href="/admin">{tr('nav.admin')}</NavLink>}
              <NavLink href="/language">{languageName(lang)}</NavLink>
            </div>
          </nav>
        </header>

        <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>

        <footer className="mx-auto max-w-2xl space-y-3 px-4 pb-10 pt-4 text-xs leading-relaxed text-gray-500">
          <p>{tr('app.disclaimer')}</p>
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/privacy" className="tappable inline-flex items-center font-medium text-brand underline">
              Terms and privacy
            </Link>
            <Link href="/report-content" className="tappable inline-flex items-center font-medium text-brand underline">
              Report incorrect content
            </Link>
            <Link href="/language" className="tappable inline-flex items-center font-medium text-brand underline">
              {languageName(lang)}
            </Link>
          </p>
        </footer>
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="tappable inline-flex items-center whitespace-nowrap rounded px-3 py-2 font-medium text-brand-light hover:bg-white/10 hover:text-white"
    >
      {children}
    </Link>
  );
}
