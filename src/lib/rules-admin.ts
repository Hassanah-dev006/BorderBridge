/**
 * Rule management (FR-ADM-01, FR-ADM-02, FR-ADM-03).
 *
 * Pure functions: validation, versioning and merging. The storage and the audit
 * trail live in store.ts, and pages pass the published overlays into the engines the
 * same way they pass live border reports — so engines.ts stays free of I/O.
 *
 * ## Why overlays rather than editing the file
 *
 * Constraint C1 says the knowledge base is data a trained non-developer can amend: a
 * JSON file, reviewable in version control. FR-ADM-01 says an administrator creates,
 * amends and retires rules through the interface. A deployed application cannot write
 * to its own source, so both cannot be satisfied by editing that file at runtime.
 *
 * So data/rules.json stays the base, and the interface writes versioned overlays on
 * top of it. A published overlay replaces the base rule of the same id, or withdraws
 * it. The file remains the thing a reviewer reads; the overlays are the thing an
 * administrator can change between deployments.
 */
import type {
  OverlayAction, RegulatoryRule, RuleOverlay, RuleValidation, VerificationStatus,
} from './types';

/**
 * FR-ADM-03 — every rule must carry its governing instrument and the date it was
 * last verified, and a rule without them is rejected rather than stored and flagged.
 *
 * This is the requirement that makes the whole system contestable: a trader who is
 * told they need a certificate can see which instrument requires it. A rule with no
 * citation cannot support that, so it is not a rule we will hold.
 */
export function validateRule(draft: Partial<RegulatoryRule>): RuleValidation {
  const problems: string[] = [];

  if (!draft.id || !/^[A-Za-z0-9._-]{3,64}$/.test(draft.id)) {
    problems.push('Give the rule an identifier of 3–64 characters, letters, digits, dot, dash or underscore.');
  }
  if (!draft.corridorId) problems.push('Choose the corridor this rule applies to.');
  if (!draft.name || draft.name.trim().length < 3) {
    problems.push('Give the rule a name a trader would recognise.');
  }
  if (!draft.reason || draft.reason.trim().length < 10) {
    problems.push('Explain why the rule applies — this is shown to the trader, not kept internally.');
  }

  // FR-ADM-03, the two that are not negotiable.
  if (!draft.sourceCitation || draft.sourceCitation.trim().length < 3) {
    problems.push('Name the governing instrument. A rule without a citation cannot be published.');
  }
  if (!draft.lastVerifiedDate || !/^\d{4}-\d{2}-\d{2}$/.test(draft.lastVerifiedDate)) {
    problems.push('Give the date this was last verified, as YYYY-MM-DD.');
  } else if (Number.isNaN(new Date(draft.lastVerifiedDate).getTime())) {
    problems.push('That verification date is not a real date.');
  } else if (new Date(draft.lastVerifiedDate).getTime() > Date.now()) {
    problems.push('The verification date is in the future.');
  }

  if (!draft.ruleType) problems.push('Choose what kind of rule this is.');

  // A rule has to actually do something.
  if (draft.ruleType === 'duty' || draft.ruleType === 'tax') {
    if (draft.ratePercent === undefined || draft.ratePercent === null) {
      problems.push('A duty or tax needs a rate.');
    } else if (draft.ratePercent < 0 || draft.ratePercent > 100) {
      problems.push('A rate must be between 0 and 100 percent.');
    }
  }
  if (draft.ruleType === 'fee' && (draft.flatAmount === undefined || draft.flatAmount === null)) {
    problems.push('A fee needs an amount.');
  }
  if (draft.ruleType === 'threshold' && (draft.thresholdValue === undefined || draft.thresholdValue === null)) {
    problems.push('A threshold needs a value.');
  }
  if (draft.ruleType === 'document' && !draft.issuingAuthority) {
    problems.push('A document rule needs an issuing authority — the trader has to know who to ask.');
  }

  return { valid: problems.length === 0, problems };
}

/** The next version number for a rule, given everything already recorded for it. */
export function nextVersion(ruleId: string, overlays: Pick<RuleOverlay, 'ruleId' | 'version'>[], base: RegulatoryRule[]): number {
  const fromBase = base.find((r) => r.id === ruleId)?.version ?? 0;
  const fromOverlays = overlays
    .filter((o) => o.ruleId === ruleId)
    .reduce((max, o) => Math.max(max, o.version), 0);
  return Math.max(fromBase, fromOverlays) + 1;
}

/**
 * The rule set actually in force: the JSON base, with published overlays applied.
 *
 * Only the newest published overlay per rule counts — an amendment to an amendment
 * supersedes it. Drafts are invisible here, which is the whole point of FR-ADM-02.
 */
export function effectiveRules(base: RegulatoryRule[], overlays: RuleOverlay[]): RegulatoryRule[] {
  const live = new Map<string, RuleOverlay>();
  for (const o of overlays) {
    if (o.status !== 'published') continue;
    const held = live.get(o.ruleId);
    if (!held || o.version > held.version) live.set(o.ruleId, o);
  }

  const out: RegulatoryRule[] = [];
  const seen = new Set<string>();

  for (const r of base) {
    const o = live.get(r.id);
    seen.add(r.id);
    if (!o) { out.push(r); continue; }
    if (o.action === 'retire') continue;          // withdrawn
    out.push(o.payload);                          // amended
  }

  // Rules that exist only as overlays — created through the interface.
  for (const [ruleId, o] of live) {
    if (seen.has(ruleId)) continue;
    if (o.action === 'retire') continue;
    out.push(o.payload);
  }

  return out;
}

/** What an administrator sees as the current state of one rule. */
export function overlayStateOf(
  ruleId: string, base: RegulatoryRule[], overlays: RuleOverlay[],
): 'base' | 'amended' | 'retired' | 'added' | 'draft-pending' {
  const published = overlays
    .filter((o) => o.ruleId === ruleId && o.status === 'published')
    .sort((a, b) => b.version - a.version)[0];
  const hasDraft = overlays.some((o) => o.ruleId === ruleId && o.status === 'draft');
  const inBase = base.some((r) => r.id === ruleId);

  if (hasDraft && !published) return 'draft-pending';
  if (!published) return 'base';
  if (published.action === 'retire') return 'retired';
  return inBase ? 'amended' : 'added';
}

/** A one-line description of a change, for the audit log and the interface. */
export function describeChange(action: OverlayAction, rule: RegulatoryRule): string {
  const what = `${rule.name} (${rule.id} v${rule.version})`;
  if (action === 'create') return `Created ${what}`;
  if (action === 'retire') return `Retired ${what}`;
  return `Amended ${what}`;
}

/** Shape a form's values into a rule, leaving validation to validateRule. */
export function draftFromFields(fields: {
  id: string; corridorId: string; ruleType: string; name: string; reason: string;
  sourceCitation: string; sourceUrl: string; lastVerifiedDate: string;
  issuingAuthority: string; mandatory: boolean; estimatedProcessingTime: string;
  ratePercent: string; flatAmount: string; flatCurrency: string;
  thresholdValue: string; thresholdCurrency: string; scope: string; hsPrefixes: string;
  version: number;
}): Partial<RegulatoryRule> {
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v));

  const draft: Partial<RegulatoryRule> = {
    id: fields.id.trim(),
    version: fields.version,
    corridorId: fields.corridorId,
    ruleType: fields.ruleType as RegulatoryRule['ruleType'],
    name: fields.name.trim(),
    reason: fields.reason.trim(),
    sourceCitation: fields.sourceCitation.trim(),
    sourceUrl: fields.sourceUrl.trim() || undefined,
    lastVerifiedDate: fields.lastVerifiedDate.trim(),
    // A rule entered by hand today is verified today, by definition of FR-ADM-03.
    verificationStatus: 'verified' as VerificationStatus,
  };

  if (fields.scope === 'hs-prefix') {
    const prefixes = fields.hsPrefixes.split(',').map((p) => p.trim()).filter(Boolean);
    draft.appliesTo = { scope: 'hs-prefix', hsPrefixes: prefixes };
  } else if (fields.scope) {
    draft.appliesTo = { scope: fields.scope } as RegulatoryRule['appliesTo'];
  }

  if (fields.issuingAuthority.trim()) draft.issuingAuthority = fields.issuingAuthority.trim();
  if (fields.estimatedProcessingTime.trim()) draft.estimatedProcessingTime = fields.estimatedProcessingTime.trim();
  if (fields.ruleType === 'document') draft.mandatory = fields.mandatory;

  const rate = num(fields.ratePercent);
  if (rate !== undefined) draft.ratePercent = rate;
  const flat = num(fields.flatAmount);
  if (flat !== undefined) { draft.flatAmount = flat; draft.flatCurrency = fields.flatCurrency || 'USD'; }
  const threshold = num(fields.thresholdValue);
  if (threshold !== undefined) { draft.thresholdValue = threshold; draft.thresholdCurrency = fields.thresholdCurrency || 'USD'; }

  return draft;
}
