import crossingBook from '../../data/crossings.json';
import type {
  BorderCrossing, BorderReport, CrossingRanking, RankedCrossing, WeightedReport,
} from './types';

/** FR-BRD-05: a report's weight falls linearly to zero across this window. */
export const REPORT_WINDOW_HOURS = 12;

/** FR-BRD-01: community waiting time is averaged over this window when ranking. */
export const RANKING_WINDOW_HOURS = 6;

const crossings = crossingBook.crossings as BorderCrossing[];

type SeedReport = {
  id: string; crossingId: string; category: BorderReport['category'];
  waitMinutes: number; hoursAgo: number; note: string;
};

/**
 * Seed reports carry an age rather than an absolute timestamp, so the data stays
 * meaningful without being rewritten. Resolve them against a supplied clock, which
 * also makes every function below deterministic under test.
 */
export function loadReports(now: Date = new Date()): BorderReport[] {
  return (crossingBook.reports as SeedReport[]).map((r) => ({
    id: r.id,
    crossingId: r.crossingId,
    category: r.category,
    waitMinutes: r.waitMinutes,
    reportedAt: new Date(now.getTime() - r.hoursAgo * 3_600_000).toISOString(),
    note: r.note,
  }));
}

export function listCrossings(corridorId: string): BorderCrossing[] {
  return crossings.filter((c) => c.corridorId === corridorId);
}

export function getCrossing(id: string): BorderCrossing | undefined {
  return crossings.find((c) => c.id === id);
}

export function ageHours(report: BorderReport, now: Date = new Date()): number {
  return (now.getTime() - new Date(report.reportedAt).getTime()) / 3_600_000;
}

/**
 * FR-BRD-05 — weight is 1.0 at submission and falls linearly to 0 at twelve hours.
 * Anything at or beyond the window contributes nothing.
 */
export function reportWeight(report: BorderReport, now: Date = new Date()): number {
  const age = ageHours(report, now);
  if (age < 0) return 1;
  if (age >= REPORT_WINDOW_HOURS) return 0;
  return 1 - age / REPORT_WINDOW_HOURS;
}

export function isExpired(report: BorderReport, now: Date = new Date()): boolean {
  return ageHours(report, now) >= REPORT_WINDOW_HOURS;
}

/**
 * Reports for one crossing, each carrying its age and weight, newest first.
 * Expired reports are retained in the return value but flagged, because the interface
 * must be able to say "nothing recent" rather than silently showing an empty list.
 */
export function weightedReports(
  crossingId: string, now: Date = new Date(), all: BorderReport[] = loadReports(now),
): WeightedReport[] {
  return all
    .filter((r) => r.crossingId === crossingId)
    .map((r) => ({
      ...r,
      ageHours: Math.round(ageHours(r, now) * 10) / 10,
      weight: Math.round(reportWeight(r, now) * 100) / 100,
      expired: isExpired(r, now),
    }))
    .sort((a, b) => a.ageHours - b.ageHours);
}

/**
 * FR-BRD-01, criterion 2 — mean reported waiting time over the preceding six hours,
 * weighted by report freshness. Returns null when no current report exists, which the
 * ranking treats as "unknown" rather than as "no wait".
 */
export function meanWaitMinutes(
  crossingId: string, now: Date = new Date(), all: BorderReport[] = loadReports(now),
): number | null {
  const recent = weightedReports(crossingId, now, all)
    .filter((r) => !r.expired && r.ageHours <= RANKING_WINDOW_HOURS);
  if (recent.length === 0) return null;
  const totalWeight = recent.reduce((s, r) => s + r.weight, 0);
  if (totalWeight === 0) return null;
  const weighted = recent.reduce((s, r) => s + r.waitMinutes * r.weight, 0);
  return Math.round(weighted / totalWeight);
}

/** Aggregate community status, derived from the same weighted set. */
export function aggregateStatus(
  crossingId: string, now: Date = new Date(), all: BorderReport[] = loadReports(now),
): BorderReport['category'] | 'unknown' {
  const wait = meanWaitMinutes(crossingId, now, all);
  if (wait === null) return 'unknown';
  if (wait >= 180) return 'severe-delay';
  if (wait >= 60) return 'busy';
  return 'normal';
}

const STATUS_RANK: Record<BorderCrossing['officialStatus'], number> = {
  open: 0, restricted: 1, closed: 2,
};

/**
 * FR-BRD-01 — rank the crossings on a corridor.
 *
 * Ordered by: (1) official status, open above restricted, closed excluded entirely;
 * (2) mean community-reported waiting time over the preceding six hours, shortest
 * first; (3) road distance from the stated origin, nearest first. Where two tie on all
 * three, the one with the longer published opening hours is chosen.
 *
 * The criterion that actually decided the winner is reported, because the requirement
 * obliges the system to say so rather than simply naming a crossing.
 */
export function rankCrossings(
  corridorId: string,
  productCategory: string,
  now: Date = new Date(),
  all: BorderReport[] = loadReports(now),
): CrossingRanking {
  const eligible = listCrossings(corridorId)
    .filter((c) => c.officialStatus !== 'closed')
    .filter((c) => c.productClasses.includes(productCategory));

  const ranked: RankedCrossing[] = eligible
    .map((c) => ({
      crossing: c,
      meanWaitMinutes: meanWaitMinutes(c.id, now, all),
      aggregateStatus: aggregateStatus(c.id, now, all),
      reports: weightedReports(c.id, now, all),
    }))
    .sort((a, b) => {
      const s = STATUS_RANK[a.crossing.officialStatus] - STATUS_RANK[b.crossing.officialStatus];
      if (s !== 0) return s;
      // An unknown wait sorts after any known wait — we do not reward missing data.
      const aw = a.meanWaitMinutes ?? Number.POSITIVE_INFINITY;
      const bw = b.meanWaitMinutes ?? Number.POSITIVE_INFINITY;
      if (aw !== bw) return aw - bw;
      if (a.crossing.roadDistanceKm !== b.crossing.roadDistanceKm) {
        return a.crossing.roadDistanceKm - b.crossing.roadDistanceKm;
      }
      return b.crossing.openHoursPerDay - a.crossing.openHoursPerDay;
    });

  const excluded = listCrossings(corridorId)
    .filter((c) => !eligible.includes(c))
    .map((c) => ({
      name: c.name,
      reason: c.officialStatus === 'closed'
        ? 'Closed'
        : `Does not process ${productCategory.toLowerCase()} consignments`,
    }));

  return {
    ranked,
    recommended: ranked[0] ?? null,
    decidedBy: decidingCriterion(ranked),
    excluded,
    windowHours: RANKING_WINDOW_HOURS,
  };
}

/** Which of the four criteria separated first from second. */
function decidingCriterion(ranked: RankedCrossing[]): string {
  if (ranked.length === 0) return 'No crossing on this corridor can process this consignment.';
  if (ranked.length === 1) return 'It is the only crossing able to process this consignment.';
  const [a, b] = ranked;
  if (a.crossing.officialStatus !== b.crossing.officialStatus) {
    return `Official status — ${a.crossing.name} is ${a.crossing.officialStatus}, ${b.crossing.name} is ${b.crossing.officialStatus}.`;
  }
  const aw = a.meanWaitMinutes, bw = b.meanWaitMinutes;
  if (aw !== bw) {
    if (aw === null) return `Reported waiting time — no current report for ${a.crossing.name}.`;
    if (bw === null) return `Reported waiting time — ${a.crossing.name} is reporting ${aw} minutes; no current report for ${b.crossing.name}.`;
    return `Reported waiting time over the last ${RANKING_WINDOW_HOURS} hours — ${aw} minutes against ${bw} at ${b.crossing.name}.`;
  }
  if (a.crossing.roadDistanceKm !== b.crossing.roadDistanceKm) {
    return `Road distance — ${a.crossing.roadDistanceKm} km against ${b.crossing.roadDistanceKm} km to ${b.crossing.name}.`;
  }
  return `Opening hours — ${a.crossing.openHoursPerDay} hours a day against ${b.crossing.openHoursPerDay} at ${b.crossing.name}.`;
}
