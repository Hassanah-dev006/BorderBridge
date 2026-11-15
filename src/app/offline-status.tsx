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
  // NFR-REL-03 — how many actions are waiting to be sent.
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const update = () => {
      setOffline(!navigator.onLine);
      setNow(new Date());
    };

    const backOnline = () => {
      update();
      // Background Sync is not available in Safari, which Table 2.4 commits to, so the
      // page asks for the flush rather than relying on a feature half the device
      // population does not have.
      navigator.serviceWorker?.controller?.postMessage({ type: 'flush-outbox' });
    };

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'outbox') setPending(Number(event.data.pending) || 0);
    };

    update();
    window.addEventListener('online', backOnline);
    window.addEventListener('offline', update);
    navigator.serviceWorker?.addEventListener('message', onMessage);
    // While the trader sits on a cached page, the age shown keeps up.
    const timer = window.setInterval(update, 60_000);
    return () => {
      window.removeEventListener('online', backOnline);
      window.removeEventListener('offline', update);
      navigator.serviceWorker?.removeEventListener('message', onMessage);
      window.clearInterval(timer);
    };
  }, []);

  // Back online with a queue still draining: say so, because a trader who submitted a
  // border report and saw nothing happen will submit it again.
  if (!offline && pending > 0) {
    return (
      <div role="status" aria-live="polite" className="border-b border-brand bg-brand-pale px-4 py-2 text-sm text-ink">
        <div className="mx-auto flex max-w-2xl items-start gap-2">
          <span aria-hidden className="font-semibold">↑</span>
          <p className="leading-snug">
            Sending {pending} {pending === 1 ? 'item' : 'items'} saved while you were offline.
          </p>
        </div>
      </div>
    );
  }

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
