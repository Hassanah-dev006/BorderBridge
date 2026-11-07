import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { currentUser } from '@/lib/session';

export const metadata: Metadata = {
  title: 'BorderBridge',
  description: 'Know what your consignment needs, and what it will cost, before you travel.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();

  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="bg-brand text-white">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="tappable inline-flex flex-col justify-center">
              <span className="text-lg font-semibold tracking-tight">BorderBridge</span>
              <span className="text-xs text-brand-light">Rwanda – Uganda pilot</span>
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
                Sign in
              </Link>
            )}
          </div>

          <nav className="border-t border-white/15">
            <div className="mx-auto flex max-w-2xl gap-1 overflow-x-auto px-2 py-1 text-sm">
              <NavLink href="/">Plan</NavLink>
              <NavLink href="/shipments">Shipments</NavLink>
              <NavLink href="/report">Border reports</NavLink>
              {user?.role === 'provider' && <NavLink href="/provider">My offering</NavLink>}
              {user?.role === 'provider' && <NavLink href="/requests">Requests</NavLink>}
              {user?.role === 'admin' && <NavLink href="/admin">Admin</NavLink>}
            </div>
          </nav>
        </header>

        <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>

        <footer className="mx-auto max-w-2xl px-4 pb-10 pt-4 text-xs leading-relaxed text-gray-500">
          BorderBridge provides guidance based on published trade rules. It is not a licensed
          customs clearing agent and its estimates are not binding determinations by any customs
          authority.
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
