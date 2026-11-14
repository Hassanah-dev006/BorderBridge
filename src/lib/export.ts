/**
 * FR-REQ-05 — export a checklist as a printable document and a plain-text summary,
 * in the trader's selected language.
 *
 * The plain-text half is not an afterthought. The target user is on an entry-level
 * phone and will almost certainly share this by message rather than print it, so the
 * text is laid out to survive being pasted into WhatsApp: no tables, no markdown, no
 * characters a basic keyboard cannot reproduce, and lines short enough not to wrap
 * badly on a small screen.
 *
 * Pure: it takes a plan and returns a string, so the wording can be tested without
 * rendering anything.
 */
import { t } from './i18n';
import type { Language, TradePlan } from './types';

const RULE = '-'.repeat(40);

function money(n: number): string {
  return `USD ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * The whole plan as plain text.
 *
 * Deliberately includes the citations and the limitation statement. A summary that
 * dropped them would be more readable and less honest — and it is the version most
 * likely to be forwarded to someone who never saw the application.
 */
export function plainTextChecklist(plan: TradePlan, lang: Language = 'en', now = new Date()): string {
  const lines: string[] = [];
  const say = (key: string, vars?: Record<string, string>) => t(key, lang, vars);

  lines.push('BORDERBRIDGE');
  lines.push(say('export.title').toUpperCase());
  lines.push(RULE);
  lines.push('');

  // What this is for
  lines.push(`${plan.product.name} - ${plan.intention.quantity} ${plan.product.unit}`);
  lines.push(`${plan.corridor.originName} -> ${plan.corridor.destinationName}`);
  lines.push(`${say('plan.crossing')}: ${plan.recommendedCrossing}`);
  lines.push('');

  // Eligibility
  lines.push(plan.eligibility.eligible ? say('plan.qualifies') : say('plan.notQualifies'));
  for (const reason of plan.eligibility.reasons) lines.push(`  - ${reason}`);
  lines.push(`  ${say('plan.source')}: ${plan.eligibility.sourceCitation}`);
  lines.push('');

  // The checklist itself
  lines.push(`${say('plan.documents').toUpperCase()} (${plan.checklist.length})`);
  lines.push(RULE);
  plan.checklist.forEach((item, i) => {
    const flag = item.mandatory ? ` [${say('plan.required')}]` : '';
    lines.push(`${i + 1}. ${item.name}${flag}`);
    lines.push(`   ${say('plan.issuedBy')}: ${item.issuingAuthority}`);
    lines.push(`   ${say('plan.takes')}: ${item.estimatedProcessingTime}`);
    lines.push(`   ${say('plan.source')}: ${item.sourceCitation} (${say('plan.verified')} ${item.lastVerifiedDate})`);
    if (item.verificationStatus === 'needs-verification') {
      // Not asterisks: a message app would render them as bold and swallow them.
      lines.push(`   (!) ${say('plan.pendingReview')}`);
    }
    lines.push('');
  });

  // Cost
  lines.push(`${say('plan.cost').toUpperCase()}`);
  lines.push(RULE);
  for (const line of plan.cost.lines) {
    const flag = line.verificationStatus === 'needs-verification' ? ' (*)' : '';
    lines.push(`${line.description}${flag}: ${money(line.amountUsd)}`);
    lines.push(`   ${line.detail}`);
  }
  lines.push('');
  lines.push(`${say('plan.total')}: ${money(plan.cost.totalUsd)} +/- ${plan.cost.confidencePercent}%`);
  for (const c of plan.cost.conversions) {
    lines.push(`   ${c.currency} ${Math.round(c.amount).toLocaleString('en-US')}`);
  }
  if (plan.cost.lines.some((l) => l.verificationStatus === 'needs-verification')) {
    lines.push('');
    lines.push(`(*) ${say('plan.pendingReview')}`);
  }
  lines.push('');

  // The statement that must travel with the numbers (FR-CST-04)
  lines.push(RULE);
  lines.push(say('plan.notBinding'));
  lines.push('');
  lines.push(`${say('export.generated')}: ${now.toISOString().slice(0, 10)}`);

  return lines.join('\n');
}

/** A short version for a message that only needs the documents. */
export function plainTextDocumentsOnly(plan: TradePlan, lang: Language = 'en'): string {
  const say = (key: string) => t(key, lang);
  const lines: string[] = [
    `${plan.product.name} - ${plan.intention.quantity} ${plan.product.unit}`,
    `${plan.corridor.originName} -> ${plan.corridor.destinationName}`,
    '',
    `${say('plan.documents')}:`,
  ];
  plan.checklist.forEach((item, i) => {
    lines.push(`${i + 1}. ${item.name}${item.mandatory ? ` [${say('plan.required')}]` : ''} - ${item.issuingAuthority}`);
  });
  return lines.join('\n');
}

/** A filename a trader will recognise among their downloads. */
export function exportFilename(plan: TradePlan, now = new Date()): string {
  const product = plan.product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `borderbridge-${product}-${now.toISOString().slice(0, 10)}.pdf`;
}
