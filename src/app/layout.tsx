import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BorderBridge',
  description: 'Know what your consignment needs, and what it will cost, before you travel.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="bg-brand text-white">
          <div className="mx-auto max-w-2xl px-4 py-4">
            <a href="/" className="tappable inline-flex flex-col justify-center">
              <span className="text-lg font-semibold tracking-tight">BorderBridge</span>
              <span className="text-xs text-brand-light">
                Cross-border trade planning · Rwanda – Uganda pilot
              </span>
            </a>
          </div>
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
