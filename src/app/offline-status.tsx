'use client';

import { useEffect, useState } from 'react';
import { cacheAgeLabel, isStale } from '@/lib/offline';

/**
 * Offline state visibility — Section 3.1, and the second half of NFR-REL-02.
 *
 * "The interface shall indicate clearly when content is being served from cache and
 * shall display the age of that content rather than presenting stale data as current."
 *
 * `renderedAt` is stamped into the markup by the server. When the service worker
 * replays that markup offline, the stamp comes back with it, so the page states the
 * moment it was actually built. Nothing has to be tracked separately, and the banner
 * cannot disagree with the page it sits above.
 */
export default function OfflineStatus({ renderedAt }: { renderedAt: string }) {
  // Starts optimistic so the server and the client render the same thing; the first
  // effect corrects it. A banner that flashes on every load would teach traders to
  // ignore it, which is the opposite of what it is for.
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => {
      setOffline(!navigator.onLine);
      setNow(new Date());
    };
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    // While the trader sits on a cached page, the age shown keeps up.
    const timer = window.setInterval(update, 60_000);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      window.clearInterval(timer);
    };
  }, []);

  if (!offline || !now) return null;

  const age = cacheAgeLabel(renderedAt, now);
  const old = isStale(renderedAt, now);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`border-b px-4 py-2 text-sm ${
        old ? 'border-gold bg-gold-pale text-ink' : 'border-brand bg-brand-pale text-ink'
      }`}
    >
      <div className="mx-auto flex max-w-2xl items-start gap-2">
        {/* NFR-USA-05: the meaning survives without the colour. */}
        <span aria-hidden className="font-semibold">
          {old ? '!' : '•'}
        </span>
        <p className="leading-snug">
          <strong className="font-semibold">You are offline.</strong>{' '}
          This page was loaded {age}
          {old
            ? '. Border conditions and duty rates may have changed since. Check again before you travel.'
            : '. You can read it, but nothing can be sent until you are back online.'}
        </p>
      </div>
    </div>
  );
}
