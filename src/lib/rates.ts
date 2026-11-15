/**
 * The exchange-rate adapter (constraint C8, NFR-REL-04, NFR-ACC-03).
 *
 * C8: "All external access shall pass through adapter interfaces with a curated
 * fallback dataset." NFR-REL-04: "Failure of any external data source shall not render
 * the system unavailable. The system shall fall back to the most recent cached value
 * and shall display its age to the user." Its verification method is fault injection,
 * which is why `fetchRateTable` takes its fetcher as a parameter: every failure mode
 * below is exercised in tests/rates.test.ts rather than hoped for.
 *
 * The governing judgement is that a wrong rate is worse than an old one. A stale rate
 * makes an estimate a little inaccurate and says so; a corrupt one — a zero, a
 * negative, a currency silently missing from the payload — produces a confident
 * number that is nonsense, on a screen a trader uses to decide whether a trip is worth
 * making. So anything that does not validate completely is discarded completely.
 */

export type RateTable = {
  base: string;
  rates: Record<string, number>;
  retrievedAt: string;
};

export type RateFailure =
  | 'unreachable'
  | 'timed-out'
  | 'rejected-by-source'
  | 'malformed'
  | 'missing-currency'
  | 'implausible-rate'
  | 'not-configured';

export type RateFetch =
  | { ok: true; table: RateTable }
  | { ok: false; reason: RateFailure };

/** Longer than this and the trader is waiting on a currency they can be told about. */
export const RATE_TIMEOUT_MS = 3_000;

/** NFR-ACC-03: "Exchange rates shall be no more than 24 hours old when applied." */
export const MAX_RATE_AGE_HOURS = 24;

/**
 * A plausible rate against USD.
 *
 * The lower bound rejects zero and negatives. The upper bound is deliberately generous
 * — some currencies really do trade in the tens of thousands to the dollar — but it
 * still catches a payload that has handed back an index, a percentage or a timestamp
 * in the rate field, which is the realistic failure rather than a hostile one.
 */
const MIN_RATE = 1e-6;
const MAX_RATE = 1e7;

/**
 * Accept a payload only if every currency the caller needs is present and sane.
 *
 * Partial acceptance is the tempting mistake here: take what is there, fall back for
 * the rest, and end up with a total built from two different moments in the market.
 */
export function validateRateTable(raw: unknown, required: string[]): RateFetch {
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'malformed' };

  const candidate = raw as Partial<RateTable>;
  if (typeof candidate.base !== 'string' || !candidate.base) {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof candidate.rates !== 'object' || candidate.rates === null) {
    return { ok: false, reason: 'malformed' };
  }

  for (const currency of required) {
    const rate = (candidate.rates as Record<string, unknown>)[currency];
    if (rate === undefined) return { ok: false, reason: 'missing-currency' };
    if (typeof rate !== 'number' || !Number.isFinite(rate)) {
      return { ok: false, reason: 'implausible-rate' };
    }
    if (rate < MIN_RATE || rate > MAX_RATE) return { ok: false, reason: 'implausible-rate' };
  }

  const retrievedAt =
    typeof candidate.retrievedAt === 'string' && !Number.isNaN(Date.parse(candidate.retrievedAt))
      ? candidate.retrievedAt
      : new Date().toISOString();

  return {
    ok: true,
    table: { base: candidate.base, rates: candidate.rates as Record<string, number>, retrievedAt },
  };
}

/**
 * Ask the external source for a rate table.
 *
 * Never throws. Every outcome is a value the caller can act on, because an adapter
 * that throws pushes the degradation decision up into a page, where it gets forgotten
 * once and becomes a blank screen.
 */
export async function fetchRateTable(options: {
  url?: string;
  required: string[];
  fetcher?: typeof fetch;
  timeoutMs?: number;
}): Promise<RateFetch> {
  const { url, required, fetcher = fetch, timeoutMs = RATE_TIMEOUT_MS } = options;

  // No source configured is the designed state for this release, not a fault: C8 asks
  // for an adapter over a curated dataset, and the curated dataset is what is there.
  if (!url) return { ok: false, reason: 'not-configured' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetcher(url, { signal: controller.signal });
    if (!response.ok) return { ok: false, reason: 'rejected-by-source' };

    const body: unknown = await response.json();
    return validateRateTable(body, required);
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return { ok: false, reason: aborted ? 'timed-out' : 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

export type ResolvedRates = {
  table: RateTable;
  source: 'live' | 'curated';
  ageHours: number;
  /** Older than NFR-ACC-03 allows. The estimate is still produced; the age is shown. */
  stale: boolean;
  /** Set when a configured source failed, as opposed to there being none. */
  degraded: boolean;
  failure?: RateFailure;
};

/**
 * Decide what to actually use. Pure, so the whole degradation path is unit testable.
 *
 * The curated table always wins when the live one did not validate — and the result
 * carries enough for the interface to say so, which is the half of NFR-REL-04 that
 * gets skipped: falling back quietly is not falling back correctly.
 */
export function resolveRates(
  live: RateFetch,
  curated: RateTable,
  now: Date = new Date(),
): ResolvedRates {
  const chosen = live.ok ? live.table : curated;
  const ageMs = now.getTime() - new Date(chosen.retrievedAt).getTime();
  const ageHours = Math.max(0, Math.round(ageMs / 3_600_000));

  return {
    table: chosen,
    source: live.ok ? 'live' : 'curated',
    ageHours,
    stale: ageHours > MAX_RATE_AGE_HOURS,
    degraded: !live.ok && live.reason !== 'not-configured',
    failure: live.ok ? undefined : live.reason,
  };
}

/**
 * What the trader is told, in their own terms.
 *
 * "rejected-by-source" is not a sentence anyone should read on a phone at a border.
 * Section 3.1 asks that an error state say what happened and what to do next, without
 * exposing technical detail, so the reasons collapse into one honest statement.
 */
export function rateNotice(resolved: ResolvedRates): string | null {
  if (resolved.source === 'live' && !resolved.stale) return null;

  const age =
    resolved.ageHours < 1
      ? 'less than an hour ago'
      : resolved.ageHours < 24
        ? `${resolved.ageHours} hour${resolved.ageHours === 1 ? '' : 's'} ago`
        : `${Math.floor(resolved.ageHours / 24)} day${resolved.ageHours < 48 ? '' : 's'} ago`;

  if (resolved.degraded) {
    return `The live rate service could not be reached, so this uses the saved rate from ${age}. The total in your own currency may be slightly off.`;
  }
  if (resolved.stale) {
    return `This uses a saved exchange rate from ${age}. The total in your own currency may be slightly off.`;
  }
  return `Exchange rate saved ${age}.`;
}

/**
 * Refresh the rates the application reads, and never let that break a page.
 *
 * Called from the planning page before an estimate is built. When there is no source
 * configured, or the source is down, this does nothing and the curated table stays in
 * use — which is the degradation path, working.
 */
export async function refreshRates(required: string[], now: Date = new Date()): Promise<ResolvedRates> {
  const { getCuratedRates, setLiveRates } = await import('./repository');
  const curated = getCuratedRates();

  const live = await fetchRateTable({ url: process.env.EXCHANGE_RATE_URL, required });
  const resolved = resolveRates(live, curated, now);

  if (live.ok) setLiveRates(live.table);
  return resolved;
}

/** As above, but swallowing anything unforeseen: a plan must still render. */
export async function refreshRatesQuietly(required: string[]): Promise<ResolvedRates | null> {
  try {
    return await refreshRates(required);
  } catch {
    return null;
  }
}
