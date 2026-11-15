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
  // The page asks for a flush when it notices the connection is back, because
  // Background Sync is not available in every browser the SRS commits to (Table 2.4
  // includes Safari, which has none). A feature the fallback channel depends on
  // cannot itself be optional.
  if (event.data && event.data.type === 'flush-outbox') {
    event.waitUntil(flushQueue());
    return;
  }

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

/*
 * NFR-REL-03 — a write attempted with no connection is queued, not lost.
 *
 * Stored in IndexedDB rather than Cache Storage, because a queued action is a record
 * to be replayed rather than a response to be served, and because it has to survive
 * the tab being closed on a phone that went in a pocket at a border.
 *
 * Only actions carrying an idempotency key are queued. Without one, replaying is
 * unsafe: the ambiguous case — server wrote the row, response lost — is
 * indistinguishable from a request that never arrived, so a retry would duplicate.
 * A write with no key fails honestly instead.
 */
const QUEUE_DB = 'bb-outbox';
const QUEUE_STORE = 'requests';

function openQueue() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(QUEUE_DB, 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(QUEUE_STORE)) {
        open.result.createObjectStore(QUEUE_STORE, { keyPath: 'key' });
      }
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

function queueTx(mode, run) {
  return openQueue().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(QUEUE_STORE, mode);
        const result = run(tx.objectStore(QUEUE_STORE));
        tx.oncomplete = () => resolve(result && result.result !== undefined ? result.result : result);
        tx.onerror = () => reject(tx.error);
      }),
  );
}

async function enqueue(request) {
  const key = request.headers.get('X-Idempotency-Key');
  if (!key) return false;

  const body = await request.clone().text();
  const headers = {};
  for (const [name, value] of request.headers.entries()) {
    // Cookies are attached by the browser on replay. Storing them would put a
    // credential in IndexedDB, where it outlives the session it belongs to.
    if (name.toLowerCase() === 'cookie') continue;
    headers[name] = value;
  }

  await queueTx('readwrite', (store) =>
    store.put({ key, url: request.url, method: request.method, headers, body, queuedAt: Date.now() }),
  );

  if (self.registration.sync) {
    try {
      await self.registration.sync.register('bb-outbox');
    } catch {
      /* replayed on the next page load instead */
    }
  }
  return true;
}

async function flushQueue() {
  const pending = await queueTx('readonly', (store) => store.getAll());
  const items = (pending || []).sort((a, b) => a.queuedAt - b.queuedAt);

  for (const item of items) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
        credentials: 'include',
      });

      // 4xx means the server understood and refused. Retrying will not change that,
      // and a queue that retries a refusal forever never drains.
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        await queueTx('readwrite', (store) => store.delete(item.key));
      }
    } catch {
      // Still offline. Leave it queued and stop: the rest will fail the same way,
      // and the order of a trader's own actions is worth preserving.
      break;
    }
  }

  const left = await queueTx('readonly', (store) => store.getAll());
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    client.postMessage({ type: 'outbox', pending: (left || []).length });
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'bb-outbox') event.waitUntil(flushQueue());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method === 'POST') {
    // Try the network; on failure, queue it if it can be replayed safely.
    event.respondWith(
      fetch(request.clone()).catch(async () => {
        const queued = await enqueue(request);
        return new Response(
          JSON.stringify({ queued, offline: true }),
          {
            status: queued ? 202 : 503,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }),
    );
    return;
  }

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
