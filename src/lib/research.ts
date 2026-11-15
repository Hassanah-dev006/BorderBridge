/**
 * Aggregate export for research (NFR-PRI-05).
 *
 * "Data exported for research shall be aggregated, shall suppress any group smaller
 * than the configured minimum, and shall be tested for re-identification risk before
 * release."
 *
 * The naive reading of that is "group by something and drop the small rows", and it
 * does not work. Two failures defeat it, and both are ordinary rather than exotic:
 *
 *  1. **Subtraction.** Publish a corridor total and five product rows, suppress the one
 *     row with three traders in it, and the reader recovers it by subtracting the four
 *     published rows from the total. Primary suppression alone leaks exactly the cell
 *     it was protecting. The answer is complementary suppression: when a group has one
 *     suppressed cell, a second cell is suppressed too, so the subtraction has two
 *     unknowns and no solution.
 *
 *  2. **Narrowness.** A count of five is not five people if the dimensions are fine
 *     enough — "dried beans, Kagitumba, week of 3 March" may be five crossings by one
 *     trader. So the threshold is applied to distinct *subjects*, not to rows.
 *
 * Why this matters more here than in most products: constraint C7 says the platform
 * must never become capable of reporting individually attributable information about
 * undeclared trade. A research extract is the most plausible way that constraint gets
 * broken by accident, by someone with good intentions and a deadline.
 */

/** Below this many distinct traders, a cell is not published. */
export const MIN_GROUP = 5;

export const SUPPRESSED = null;

export type AggregateCell = {
  /** The dimension values that identify this cell, in the order they were requested. */
  dimensions: Record<string, string>;
  /** Distinct subjects behind the cell. The suppression threshold applies to this. */
  subjects: number;
  /** Observations, which may exceed `subjects` when one trader appears repeatedly. */
  observations: number;
  /** Measures, or null once suppressed. */
  measures: Record<string, number | null>;
  /** Why this cell is suppressed, if it is. Published alongside, not hidden. */
  suppressedBecause?: 'below-threshold' | 'complementary';
};

export type Record_ = {
  subjectId: string;
  dimensions: Record<string, string>;
  measures: Record<string, number>;
};

/**
 * Group records into cells, counting distinct subjects rather than rows.
 *
 * Measures are averaged. A sum would be more useful to a researcher and much less safe:
 * a sum plus a count gives an average, and an average over a small group with one
 * outlier identifies the outlier.
 */
export function aggregate(records: Record_[], by: string[]): AggregateCell[] {
  const groups = new Map<string, { subjects: Set<string>; rows: Record_[] }>();

  for (const record of records) {
    const key = by.map((d) => record.dimensions[d] ?? '').join('\u0000');
    let group = groups.get(key);
    if (!group) {
      group = { subjects: new Set(), rows: [] };
      groups.set(key, group);
    }
    group.subjects.add(record.subjectId);
    group.rows.push(record);
  }

  const cells: AggregateCell[] = [];
  for (const [key, group] of groups) {
    const values = key.split('\u0000');
    const dimensions: Record<string, string> = {};
    by.forEach((d, i) => { dimensions[d] = values[i]; });

    const measureNames = new Set<string>();
    for (const row of group.rows) {
      for (const name of Object.keys(row.measures)) measureNames.add(name);
    }

    const measures: Record<string, number | null> = {};
    for (const name of measureNames) {
      const present = group.rows
        .map((r) => r.measures[name])
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      measures[name] = present.length
        ? Math.round((present.reduce((a, b) => a + b, 0) / present.length) * 100) / 100
        : null;
    }

    cells.push({
      dimensions,
      subjects: group.subjects.size,
      observations: group.rows.length,
      measures,
    });
  }

  return cells.sort((a, b) =>
    by.map((d) => a.dimensions[d]).join().localeCompare(by.map((d) => b.dimensions[d]).join()),
  );
}

function blank(cell: AggregateCell, why: 'below-threshold' | 'complementary'): AggregateCell {
  const measures: Record<string, number | null> = {};
  for (const name of Object.keys(cell.measures)) measures[name] = SUPPRESSED;
  return { ...cell, measures, suppressedBecause: why };
}

export function isSuppressed(cell: AggregateCell): boolean {
  return cell.suppressedBecause !== undefined;
}

/**
 * Suppress every cell below the threshold, then suppress enough more that the
 * suppressed ones cannot be recovered by subtraction.
 *
 * `along` names the dimension that varies within a group — the axis a reader would sum
 * across. For each set of cells that differ only in that dimension, if exactly one is
 * suppressed, the next-smallest published cell is suppressed as well.
 *
 * Suppressing the *smallest* remaining cell rather than a random one is deliberate: it
 * is the cell whose loss costs the researcher least and whose own disclosure risk is
 * highest, so the second suppression does double duty.
 */
export function suppress(
  cells: AggregateCell[],
  along: string,
  minGroup = MIN_GROUP,
): AggregateCell[] {
  const out = cells.map((c) => (c.subjects < minGroup ? blank(c, 'below-threshold') : { ...c }));

  // Cells that differ only in `along` are the ones a reader can sum across.
  const groups = new Map<string, AggregateCell[]>();
  for (const cell of out) {
    const key = Object.entries(cell.dimensions)
      .filter(([d]) => d !== along)
      .map(([, v]) => v)
      .join('\u0000');
    const list = groups.get(key) ?? [];
    list.push(cell);
    groups.set(key, list);
  }

  for (const group of groups.values()) {
    // A group of one has nothing to subtract from, and a group with no suppression
    // has nothing to protect.
    if (group.length < 2) continue;

    const hidden = group.filter(isSuppressed);
    if (hidden.length !== 1) continue;

    const candidates = group
      .filter((c) => !isSuppressed(c))
      .sort((a, b) => a.subjects - b.subjects);

    if (candidates.length === 0) continue;

    const victim = candidates[0];
    const replacement = blank(victim, 'complementary');
    out[out.indexOf(victim)] = replacement;
  }

  return out;
}

export type RiskReport = {
  cells: number;
  published: number;
  suppressedBelowThreshold: number;
  suppressedComplementary: number;
  smallestPublishedGroup: number | null;
  /** True when every published cell is at or above the threshold. */
  safe: boolean;
  /** Anything a human should look at before release. */
  warnings: string[];
};

/**
 * The re-identification check NFR-PRI-05 asks for, run before release rather than
 * promised in a policy.
 */
export function riskReport(cells: AggregateCell[], minGroup = MIN_GROUP): RiskReport {
  const published = cells.filter((c) => !isSuppressed(c));
  const smallest = published.length
    ? Math.min(...published.map((c) => c.subjects))
    : null;

  const warnings: string[] = [];

  if (smallest !== null && smallest < minGroup) {
    warnings.push(`A published cell has only ${smallest} subjects, below the minimum of ${minGroup}.`);
  }

  // One published cell among many suppressed ones is close to publishing the one.
  if (published.length === 1 && cells.length > 2) {
    warnings.push('Only one cell survives suppression; releasing it says nearly as much as releasing the rest.');
  }

  // A cell with far more observations than subjects is one trader's history, not a
  // population, whatever the subject count says.
  for (const cell of published) {
    if (cell.subjects > 0 && cell.observations / cell.subjects > 20) {
      warnings.push(
        `A cell holds ${cell.observations} observations from ${cell.subjects} subjects; it describes behaviour, not a population.`,
      );
    }
  }

  return {
    cells: cells.length,
    published: published.length,
    suppressedBelowThreshold: cells.filter((c) => c.suppressedBecause === 'below-threshold').length,
    suppressedComplementary: cells.filter((c) => c.suppressedBecause === 'complementary').length,
    smallestPublishedGroup: smallest,
    safe: warnings.length === 0,
    warnings,
  };
}

/**
 * CSV, because the people who ask for this have a spreadsheet, not an API client.
 *
 * Suppressed cells are written as the word "suppressed" rather than left empty: an
 * empty cell reads as zero, and a reader who thinks a suppressed group is an absent
 * one has been misled by the file rather than protected by it.
 */
export function toCsv(cells: AggregateCell[], by: string[]): string {
  const measureNames = [...new Set(cells.flatMap((c) => Object.keys(c.measures)))].sort();
  const header = [...by, 'subjects', 'observations', ...measureNames, 'status'];

  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

  const lines = cells.map((cell) => {
    const hidden = isSuppressed(cell);
    const row = [
      ...by.map((d) => cell.dimensions[d] ?? ''),
      hidden ? 'suppressed' : String(cell.subjects),
      hidden ? 'suppressed' : String(cell.observations),
      ...measureNames.map((m) => {
        const value = cell.measures[m];
        return hidden || value === null ? 'suppressed' : String(value);
      }),
      hidden ? `suppressed: ${cell.suppressedBecause}` : 'published',
    ];
    return row.map(escape).join(',');
  });

  return [header.join(','), ...lines].join('\n');
}
