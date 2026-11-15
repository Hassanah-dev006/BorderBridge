/*
 * BorderBridge service worker — constraint C4, NFR-REL-02, NFR-CMP-03.
 *
 * The policy this enforces lives in src/lib/offline.ts, where it is unit tested. The
 * three constants below mirror that module, and tests/offline.test.ts reads this file
 * and fails if they drift. Change them in both places or not at all.
 *
 * Strategy, and why:
 *
 *   Pages        network first, cache as fallback. A duty rate that changed this
 *                morning must not be served from yesterday's cache to a trader who
 *                has a connection. For regulatory content, freshness beats speed, so
 *                the cache is the fallback and never the default.
 *
 *   Build assets cache first. Next.js content-hashes these, so a cache hit cannot be
 *                the wrong version, and a trader on a metered connection should not
 *                pay for the same stylesheet twice (NFR-PER-04).
 *
 *   Writes       never touched. A server action is a POST; replaying one on reconnect
 *                needs an idempotency key to be safe (NFR-REL-03), and silently
 *                re-submitting a border report would be worse than failing honestly.
 */

const CACHE_VERSION = 'bb-v1';
const PAGE_CACHE = CACHE_VERSION + '-pages';
const ASSET_CACHE = CACHE_VERSION + '-assets';

/* Mirrors NEVER_CACHE in src/lib/offline.ts */
const NEVER_CACHE = ['/login', '/register', '/verify', '/recover', '/privacy/export'];

/* Mirrors OFFLINE_READABLE in src/lib/offline.ts */
const OFFLINE_READABLE = ['/', '/plan', '/shipments', '/report'];

const OFFLINE_FALLBACK = '/offline';

function normalisePath(pathname) {
  const path = pathname.split('?')[0].split('#')[0];
  return path.length > 1 && path.endsWith('/') ? path.replace(/\/+$/, '') : path;
}

function isCacheablePage(pathname) {
  const path = normalisePath(pathname);
  if (path === OFFLINE_FALLBACK) return false;
  return !NEVER_CACHE.some((p) => path === p || path.startsWith(p + '/'));
}

function isImmutableAsset(pathname) {
  return pathname.startsWith('/_next/static/');
}

/* A client-side navigation fetches a React payload rather than a document. Caching
   those is what makes the app usable offline rather than merely reloadable offline. */
function isPagePayload(request, url) {
  return url.searchParams.has('_rsc') || request.headers.get('RSC') === '1';
}

/*
 * What a stored response is filed under.
 *
 * The path alone, never the query string, for three reasons. A document and the React
 * payload for the same path are different responses and must not be able to answer
 * each other, so payloads get their own suffix. The payload's own `_rsc` value changes
 * on every deploy, which would otherwise fill the cache with copies nobody can reach.
 * And the query strings this application uses carry flash messages — ?thanks=1 after a
 * border report, ?error=... after a failed one — which have no business being replayed
 * to a trader hours later as though they had just happened.
 */
function cacheKey(request, url) {
  const base = self.location.origin + normalisePath(url.pathname);
  return new Request(isPagePayload(request, url) ? base + '?__bb=rsc' : base);
}

/* Only store a response we can actually replay: a real same-origin 200, not a
   redirect, not an opaque cross-origin response, and not one asking us not to. */
function isStorable(response) {
  if (!response || !response.ok || response.redirected) return false;
  if (response.type !== 'basic' && response.type !== 'default') return false;
  const cc = response.headers.get('Cache-Control') || '';
  return !cc.includes('no-store');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      // Only the fallback is precached. Warming the trader's own pages here would
      // fetch them before anyone has signed in, and store a row of redirects.
      .then((cache) => cache.add(new Request(OFFLINE_FALLBACK, { cache: 'reload' })))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((n) => !n.startsWith(CACHE_VERSION)).map((n) => caches.delete(n)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/*
 * Discard every stored page.
 *
 * Sent by the client when the signed-in account changes, including a sign-out. A
 * handset here is often shared, which Section 2.7 treats as an assumption rather than
 * an edge case, so one trader's shipments must not outlive their session on someone
 * else's phone. Build assets are impersonal and are kept.
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'purge-pages') {
    event.waitUntil(
      caches.delete(PAGE_CACHE).then(() =>
        caches.open(PAGE_CACHE).then((cache) =>
          cache.add(new Request(OFFLINE_FALLBACK, { cache: 'reload' })).catch(() => undefined),
        ),
      ),
    );
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isImmutableAsset(url.pathname)) {
    event.respondWith(assetFirst(request));
    return;
  }

  const navigation = request.mode === 'navigate';
  if (navigation || isPagePayload(request, url)) {
    event.respondWith(networkFirst(request, url, navigation));
  }
});

async function assetFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (isStorable(response)) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, url, navigation) {
  const cache = await caches.open(PAGE_CACHE);
  const key = cacheKey(request, url);

  try {
    const response = await fetch(request);
    if (isStorable(response) && isCacheablePage(url.pathname)) {
      cache.put(key, response.clone());
    }
    return response;
  } catch {
    const hit = await cache.match(key);
    if (hit) return hit;

    if (navigation) {
      const fallback = await cache.match(OFFLINE_FALLBACK);
      if (fallback) return fallback;
    }

    // Nothing stored and nothing reachable. A 504 is the honest answer; the page the
    // trader sees for it is /offline, which the fallback above serves when present.
    return new Response('Offline and this page has not been opened before.', {
      status: 504,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

/* Referenced so a reader of this file can see the list is deliberate rather than
   dead, and so a linter cannot quietly remove the mirror the test checks. */
self.__BB_OFFLINE_READABLE = OFFLINE_READABLE;
