/**
 * Offline policy (constraint C4, NFR-REL-02, NFR-CMP-03).
 *
 * C4 says offline-first, not offline-tolerant: cached content must stay readable with
 * no connectivity at all. This module holds the decisions behind that — which pages
 * may be stored, which must never be, and how the age of a cached page is described
 * to the trader.
 *
 * It is pure, so the policy is testable (tests/offline.test.ts). The service worker in
 * public/sw.js enforces it in the browser and mirrors the two lists below; a test
 * reads that file and fails if the lists drift apart, because a policy that lives in
 * two places and is only checked in one is not a policy.
 */

/**
 * Bumping this discards every stored page on the next load.
 *
 * Raise it when the markup or the policy changes, not when content changes — content
 * freshness is handled by going to the network first, not by versioning the cache.
 */
export const CACHE_VERSION = 'bb-v1';

export const PAGE_CACHE = `${CACHE_VERSION}-pages`;
export const ASSET_CACHE = `${CACHE_VERSION}-assets`;

/**
 * Pages that must never be written to the cache.
 *
 * The first four carry credentials or a one-time code. The export page carries
 * everything the system holds about a person (NFR-PRI-03), which is the last thing
 * that should survive on disk after the tab is closed.
 *
 * This matters because a handset here is often shared — passed between traders at a
 * stall, or borrowed from a family member, which Section 2.7 lists as an assumption
 * rather than an edge case. Cache Storage outlives the session; a signed-out trader
 * should not be one Back button away from someone else's data export.
 */
export const NEVER_CACHE = [
  '/login',
  '/register',
  '/verify',
  '/recover',
  '/privacy/export',
] as const;

/**
 * Pages NFR-REL-02 names as readable offline: "cached checklists, cost estimates,
 * shipment records and border details".
 *
 * Everything not on this list and not forbidden above is still cached if the trader
 * visits it — the list is what the service worker warms deliberately, not a whitelist.
 */
export const OFFLINE_READABLE = [
  '/',
  '/plan',
  '/shipments',
  '/report',
] as const;

/** Content-hashed by the build, so a cached copy can never be the wrong version. */
export const IMMUTABLE_PREFIXES = ['/_next/static/'] as const;

/** Shown instead of the browser's error page when an uncached page is requested offline. */
export const OFFLINE_FALLBACK = '/offline';

/**
 * Whether a navigation to this path may be stored.
 *
 * Only GET navigations reach this. A server action is a POST and is never cached: a
 * queued-and-replayed write needs an idempotency key to be safe (NFR-REL-03), and
 * silently re-submitting a border report or a shipment transition on reconnect would
 * be worse than failing honestly.
 */
export function isCacheablePage(pathname: string): boolean {
  if (!pathname.startsWith('/')) return false;
  const path = normalisePath(pathname);
  if (path === OFFLINE_FALLBACK) return false;
  return !NEVER_CACHE.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Whether a request is for a build asset that may be served from cache first. */
export function isImmutableAsset(pathname: string): boolean {
  return IMMUTABLE_PREFIXES.some((p) => pathname.startsWith(p));
}

/** Trailing slashes are the same page; a query string does not change which page it is. */
export function normalisePath(pathname: string): string {
  const withoutQuery = pathname.split('?')[0].split('#')[0];
  if (withoutQuery.length > 1 && withoutQuery.endsWith('/')) {
    return withoutQuery.replace(/\/+$/, '');
  }
  return withoutQuery;
}

/**
 * What a stored page is filed under.
 *
 * The path only, never the query string. A document and the React payload for the same
 * path are different responses and must not be able to answer each other, so payloads
 * take a suffix of their own. Dropping the query also stops two things that would
 * otherwise be wrong: the payload's build-specific `_rsc` value, which changes on every
 * deploy and would fill the cache with entries nothing can reach, and the flash
 * messages this application puts in the query string — `?thanks=1` after a border
 * report, `?error=...` after a failed one. Replaying a success message to a trader
 * hours later, offline, would be a lie told by a cache.
 */
export function pageCacheKey(pathname: string, isPayload = false): string {
  return normalisePath(pathname) + (isPayload ? '?__bb=rsc' : '');
}

/**
 * How old the page on screen is, in words.
 *
 * Section 3.1 requires that the interface "display the age of that content rather than
 * presenting stale data as current". The timestamp is rendered into the page on the
 * server, so a page served from the cache carries the moment it was actually built —
 * no bookkeeping in the service worker, and no way for the two to disagree.
 *
 * Granularity is deliberately coarse. A trader deciding whether to trust a duty rate
 * needs to know it is hours rather than minutes old; the exact minute is noise.
 */
export function cacheAgeLabel(renderedAt: Date | string, now: Date = new Date()): string {
  const then = typeof renderedAt === 'string' ? new Date(renderedAt) : renderedAt;
  if (Number.isNaN(then.getTime())) return 'at an unknown time';

  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  // A page cannot have been loaded in the future. Device clocks are wrong often enough
  // that saying "in 3 hours" would look like a fault in the application.
  if (seconds < 60) return 'moments ago';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Whether content this old should be treated as stale enough to warn about.
 *
 * Twelve hours matches the window FR-BRD-05 uses to expire a border report: past that
 * point the most volatile thing on the page is certainly out of date.
 */
export const STALE_AFTER_HOURS = 12;

export function isStale(renderedAt: Date | string, now: Date = new Date()): boolean {
  const then = typeof renderedAt === 'string' ? new Date(renderedAt) : renderedAt;
  if (Number.isNaN(then.getTime())) return true;
  return now.getTime() - then.getTime() > STALE_AFTER_HOURS * 3_600_000;
}
