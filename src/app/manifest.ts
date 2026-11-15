import type { MetadataRoute } from 'next';

/**
 * NFR-CMP-03 — installable as a Progressive Web App, no app store involved.
 *
 * App-store distribution would be a poor fit here for reasons the SRS already states:
 * entry-level handsets with little free storage (Table 2.3), a metered connection the
 * trader pays for by the megabyte (NFR-PER-04), and no requirement for anything the
 * browser cannot already do. Installing from the page costs a fraction of a download.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BorderBridge',
    short_name: 'BorderBridge',
    description:
      'Know what your consignment needs, and what it will cost, before you travel.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    // The deep green of the header, so the status bar continues the page rather than
    // cutting a white line across the top of it.
    theme_color: '#1B5E3F',
    background_color: '#F6F8F4',
    categories: ['business', 'travel', 'utilities'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Padded, so Android can crop it to whatever shape the launcher uses without
      // slicing the arch off the bridge.
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
