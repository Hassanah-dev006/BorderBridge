/**
 * Which currency the cost table is shown in (FR-CST-02).
 *
 * "Convert monetary values between origin, destination and preferred currencies,
 * recording the rate applied and its timestamp."
 *
 * The computation stays in USD, because the rules are denominated in USD — the
 * Simplified Trade Regime threshold is USD 2,000 and the EAC duty is a percentage of a
 * USD customs value — so converting earlier would mean comparing a converted figure
 * against an unconverted threshold. Conversion is therefore a presentation step, and
 * this module is that step.
 *
 * The default is the **origin** currency, not USD. The trader is departing from there
 * and holds that money; a Rwandan trader deciding whether a trip is worth making needs
 * to know whether she is looking at 1.8 million francs, not 1,385 dollars. USD is kept
 * beside every figure so the audit trail against the rule survives, and so the
 * two-thousand-dollar threshold remains checkable by eye.
 */

/** Rounding to whole units: nobody quotes a border fee in centimes of a franc. */
function roundLocal(amount: number): number {
  return Math.round(amount);
}

/**
 * The currencies a trader may choose between for this corridor.
 *
 * USD first because it is the currency of the rules, then origin, then destination.
 * Deduplicated, since a corridor could in principle use USD at one end.
 */
export function allowedCurrencies(
  originCurrency: string | undefined,
  destinationCurrency: string | undefined,
): string[] {
  const all = ['USD', originCurrency, destinationCurrency].filter(
    (c): c is string => typeof c === 'string' && c.length > 0,
  );
  return [...new Set(all)];
}

/**
 * Validate the requested currency against what this corridor offers.
 *
 * An unknown or absent request falls back rather than failing: a mistyped URL should
 * show a trade plan in the wrong currency, not an error page instead of a trade plan.
 */
export function resolveDisplayCurrency(
  requested: string | undefined,
  allowed: string[],
  fallback?: string,
): string {
  const wanted = (requested ?? '').toUpperCase();
  if (allowed.includes(wanted)) return wanted;
  if (fallback && allowed.includes(fallback)) return fallback;
  // Origin currency is the trader's own money, and is second in `allowed` by
  // construction. USD only when the corridor offers nothing else.
  return allowed[1] ?? allowed[0] ?? 'USD';
}

export type ConvertedTable = {
  currency: string;
  /** One per input line, in the same order, rounded for display. */
  lines: number[];
  /** The sum of the displayed lines — see below for why it is not converted directly. */
  total: number;
  /** How far that sum sits from converting the USD total in one step. */
  rounding: number;
};

/**
 * Convert a cost table for display.
 *
 * The total is the **sum of the rounded lines**, not the rounded conversion of the USD
 * total. Those two differ by a unit or two once rounding is applied, and the difference
 * matters more than its size: a trader who adds up the column and gets a different
 * number from the one in bold has been given a reason to distrust the whole estimate.
 * Arithmetic that does not add up reads as a mistake even when it is a rounding
 * artefact, and this product is asking people to act on its figures.
 */
export function convertTable(
  linesUsd: number[],
  totalUsd: number,
  rate: number,
  currency: string,
): ConvertedTable {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Unusable exchange rate for ${currency}`);
  }

  const lines = linesUsd.map((usd) => roundLocal(usd * rate));
  const total = lines.reduce((sum, n) => sum + n, 0);

  return {
    currency,
    lines,
    total,
    rounding: total - roundLocal(totalUsd * rate),
  };
}

/**
 * The display rate for a currency, from the table the estimate already used.
 *
 * Reading it from the same source the estimate did is deliberate: pulling a fresh rate
 * here would mean the table and the total were computed from different moments in the
 * market, which is the failure the adapter in rates.ts exists to prevent.
 */
export function rateFor(rates: Record<string, number>, currency: string): number {
  const rate = rates[currency];
  if (!rate) throw new Error(`No exchange rate for ${currency}`);
  return rate;
}

/**
 * The URL for the same plan shown in another currency.
 *
 * A link rather than a control that needs JavaScript. The reference device in
 * Table 2.3 is an entry-level handset on a metered connection, and a choice that works
 * without scripting also works in the offline cache and in the printable view.
 */
export function currencyHref(
  params: Record<string, string | string[] | undefined>,
  currency: string,
  path = '/plan',
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === 'show') continue;
    const single = Array.isArray(value) ? value[0] : value;
    if (single !== undefined && single !== '') query.set(key, single);
  }
  query.set('show', currency);
  return `${path}?${query.toString()}`;
}
