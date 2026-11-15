/**
 * FR-NOT-02 — notify subscribed users when a regulation, duty rate or document
 * requirement affecting them changes.
 *
 * The regulatory knowledge base is a JSON file a non-developer can edit (constraint
 * C1), so there is no database trigger to hang this on. Instead we keep a fingerprint
 * of each corridor's rules and compare it when someone opens the application. That is
 * polling, not pushing, and the interface says so rather than implying a background
 * service that does not exist.
 *
 * On the very first check we record the mark and announce nothing — otherwise every
 * user would be told the entire rule book had "changed" the day they signed up.
 */
import { listSupportedCorridors, getRulesForCorridor } from './repository';
import { ruleFingerprint, ruleSnapshot, diffSnapshots, changeSummary } from './notify';
import type { RuleMark } from './notify';
import { getWatermark, subscribersFor, notify } from './store';
import { db } from './db';
import { log } from './log';
import type { RuleChange } from './types';

/** The stored snapshot behind a corridor's watermark. */
async function readSnapshot(corridorId: string): Promise<RuleMark[]> {
  const sql = db();
  const rows = await sql`SELECT snapshot FROM rule_watermarks WHERE corridor_id = ${corridorId}`;
  const raw = rows[0]?.snapshot;
  return Array.isArray(raw) ? (raw as RuleMark[]) : [];
}

async function writeWatermark(corridorId: string, fingerprint: string, snap: RuleMark[]): Promise<void> {
  const sql = db();
  await sql`
    INSERT INTO rule_watermarks (corridor_id, fingerprint, snapshot)
    VALUES (${corridorId}, ${fingerprint}, ${sql.json(snap as never)})
    ON CONFLICT (corridor_id) DO UPDATE SET
      fingerprint = EXCLUDED.fingerprint,
      snapshot = EXCLUDED.snapshot,
      checked_at = NOW()
  `;
}

/**
 * Compare every supported corridor's rules against its watermark, notify the people
 * who subscribed to that corridor, and move the mark.
 *
 * Safe to call on every page load: when nothing has changed it is one cheap query
 * per corridor and no writes.
 */
export async function syncRuleChanges(): Promise<RuleChange[]> {
  const results: RuleChange[] = [];

  for (const corridor of listSupportedCorridors()) {
    const rules = getRulesForCorridor(corridor.id);
    const fingerprint = ruleFingerprint(rules);
    const previousFingerprint = await getWatermark(corridor.id);

    if (previousFingerprint === fingerprint) {
      results.push({
        corridorId: corridor.id, fingerprint, previousFingerprint,
        changed: false, added: [], amended: [], removed: [],
      });
      continue;
    }

    const snap = ruleSnapshot(rules);

    // First time we have seen this corridor: record the mark, announce nothing.
    if (previousFingerprint === null) {
      await writeWatermark(corridor.id, fingerprint, snap);
      results.push({
        corridorId: corridor.id, fingerprint, previousFingerprint: null,
        changed: false, added: [], amended: [], removed: [],
      });
      continue;
    }

    const before = await readSnapshot(corridor.id);
    const diff = diffSnapshots(before, snap);
    const anything = diff.added.length + diff.amended.length + diff.removed.length > 0;

    if (anything) {
      const name = `${corridor.originName} → ${corridor.destinationName}`;
      const { title, body } = changeSummary(name, diff);
      const recipients = await subscribersFor({ corridorId: corridor.id });
      await notify({ userIds: recipients, kind: 'rule-change', title, body, link: '/' });
    }

    await writeWatermark(corridor.id, fingerprint, snap);
    results.push({
      corridorId: corridor.id, fingerprint, previousFingerprint,
      changed: anything, ...diff,
    });
  }

  return results;
}

/** Never let a notification check break a page a trader was trying to read. */
export async function syncRuleChangesQuietly(): Promise<void> {
  try {
    await syncRuleChanges();
  } catch (error) {
    // A page that renders without its badge is better than a page that does not
    // render — but a failure that is swallowed in silence is one nobody fixes, so it
    // is swallowed in writing instead (NFR-MNT-05).
    log.error('rulewatch.syncFailed', { error });
  }
}
