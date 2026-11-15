'use client';

import { useEffect } from 'react';

const ACCOUNT_KEY = 'bb_cached_for';

/**
 * Registers the service worker that makes the application readable offline
 * (constraint C4, NFR-REL-02, NFR-CMP-03).
 *
 * It also watches which account the stored pages belong to. A handset on this corridor
 * is frequently shared — Section 2.7 lists access "directly or through a family member"
 * as an assumption of the whole product — so when the signed-in account changes, every
 * stored page is discarded before the next trader can reach it with the Back button.
 *
 * `accountKey` is an opaque identifier, never a phone number, because this value is
 * written to the device and localStorage is readable by anything else on the origin.
 */
export default function ServiceWorker({ accountKey }: { accountKey: string }) {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let cancelled = false;

    navigator.serviceWorker
      .register('/sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        if (cancelled) return;

        let previous: string | null = null;
        try {
          previous = window.localStorage.getItem(ACCOUNT_KEY);
          window.localStorage.setItem(ACCOUNT_KEY, accountKey);
        } catch {
          // Private browsing, or storage disabled. Purging on every load is the safe
          // way to be wrong: the trader loses the offline copy, not their privacy.
          previous = null;
        }

        if (previous !== null && previous !== accountKey) {
          registration.active?.postMessage({ type: 'purge-pages' });
        }
      })
      .catch(() => {
        // An unregistered worker costs the offline copy and nothing else. The
        // application is server-rendered and works without it.
      });

    return () => {
      cancelled = true;
    };
  }, [accountKey]);

  return null;
}
