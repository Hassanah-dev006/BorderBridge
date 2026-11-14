/**
 * FR-REQ-05 — a printable checklist and a plain-text summary, in the trader's
 * selected language.
 *
 * "Printable PDF" is the browser's own print-to-PDF against a print stylesheet,
 * rather than a server-side PDF library. That is a deliberate choice: it adds no
 * dependency, works on a phone, and produces a file the trader already knows how to
 * save and share. The plain-text half matters more in practice — most of these will
 * be sent by message, not printed.
 */
import Link from 'next/link';
import { buildTradePlan, fmtUsd, fmtLocal, UnsupportedCorridorError, UnknownProductError } from '@/lib/engines';
import { recentReports, publishedOverlays } from '@/lib/store';
import { effectiveRules } from '@/lib/rules-admin';
import { getRulesForCorridor } from '@/lib/repository';
import { isConfigured } from '@/lib/db';
import { withLanguage } from '@/lib/language';
import { plainTextChecklist } from '@/lib/export';
import type { BorderReport, TradePlan } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Search = { [k: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function PrintPlanPage({ searchParams }: { searchParams: Search }) {
  const corridorId = one(searchParams.corridor) ?? '';
  const productId = one(searchParams.product) ?? '';
  const quantity = Number(one(searchParams.quantity) ?? 0);
  const declaredValue = Number(one(searchParams.value) ?? 0);
  const currency = one(searchParams.currency) ?? 'USD';

  const { lang, tr } = await withLanguage();

  if (!corridorId || !productId || !(quantity > 0) || !(declaredValue > 0)) {
    return <Problem title="Something was missing" body="Go back and complete every field." />;
  }

  const live: BorderReport[] = isConfigured() ? await recentReports() : [];
  const overlays = isConfigured() ? await publishedOverlays() : [];
  const rules = effectiveRules(getRulesForCorridor(corridorId), overlays);

  let plan: TradePlan;
  try {
    plan = buildTradePlan({ corridorId, productId, quantity, declaredValue, currency }, live, rules);
  } catch (e) {
    if (e instanceof UnsupportedCorridorError || e instanceof UnknownProductError) {
      return <Problem title="We cannot prepare that" body="Go back and choose a route and product from the lists." />;
    }
    throw e;
  }

  const query = `corridor=${corridorId}&product=${productId}&quantity=${quantity}&value=${declaredValue}&currency=${currency}`;
  const text = plainTextChecklist(plan, lang);

  return (
    <div className="space-y-6">
      {/* Everything in here is hidden when printing */}
      <div className="no-print space-y-3">
        <Link href={`/plan?${query}`} className="tappable inline-flex items-center text-sm text-brand">
          ← {tr('action.back')}
        </Link>
        <p className="text-sm text-gray-700">{tr('export.lede')}</p>
      </div>

      {/* The printable document */}
      <article className="print-sheet rounded-md border border-gray-200 bg-white p-6">
        <header className="border-b border-gray-300 pb-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand">BorderBridge</p>
          <h1 className="mt-1 text-xl font-semibold text-ink">{tr('export.title')}</h1>
          <p className="mt-1 text-sm text-gray-700">
            {plan.product.name} · {plan.intention.quantity} {plan.product.unit} ·{' '}
            {plan.corridor.originName} → {plan.corridor.destinationName}
          </p>
          <p className="text-xs text-gray-600">
            {tr('plan.crossing')}: {plan.recommendedCrossing}
          </p>
        </header>

        {/* Eligibility */}
        <section className="mt-4">
          <h2 className="text-sm font-semibold text-ink">
            {plan.eligibility.eligible ? tr('plan.qualifies') : tr('plan.notQualifies')}
          </h2>
          <ul className="mt-1 space-y-0.5">
            {plan.eligibility.reasons.map((r, i) => (
              <li key={i} className="text-sm text-gray-700">• {r}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-gray-600">
            {tr('plan.source')}: {plan.eligibility.sourceCitation}
          </p>
        </section>

        {/* The checklist, with a box to tick on paper */}
        <section className="mt-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">
            {tr('plan.documents')} ({plan.checklist.length})
          </h2>
          <ol className="mt-2 space-y-3">
            {plan.checklist.map((item) => (
              <li key={item.ruleId} className="flex gap-3">
                <span className="mt-1 inline-block h-4 w-4 shrink-0 border border-gray-500" aria-hidden />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {item.name}
                    {item.mandatory && <span className="ml-2 text-xs font-normal">[{tr('plan.required')}]</span>}
                    {item.verificationStatus === 'needs-verification' && (
                      <span className="ml-2 text-xs font-normal">({tr('plan.pendingReview')})</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-700">{tr('plan.issuedBy')}: {item.issuingAuthority}</p>
                  <p className="text-xs text-gray-700">{tr('plan.takes')}: {item.estimatedProcessingTime}</p>
                  <p className="text-xs text-gray-600">
                    {tr('plan.source')}: {item.sourceCitation} · {tr('plan.verified')} {item.lastVerifiedDate}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Cost */}
        <section className="mt-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">{tr('plan.cost')}</h2>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {plan.cost.lines.map((l, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-1 align-top">
                    <span className="text-ink">{l.description}</span>
                    {l.verificationStatus === 'needs-verification' && <span className="text-xs"> (*)</span>}
                    <div className="text-xs text-gray-600">{l.detail}</div>
                  </td>
                  <td className="whitespace-nowrap py-1 text-right align-top tabular-nums text-ink">
                    {fmtUsd(l.amountUsd)}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="py-2 font-semibold text-ink">
                  {tr('plan.total')} <span className="text-xs font-normal">± {plan.cost.confidencePercent}%</span>
                </td>
                <td className="whitespace-nowrap py-2 text-right font-bold tabular-nums text-ink">
                  {fmtUsd(plan.cost.totalUsd)}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-1 text-xs text-gray-700">
            {plan.cost.conversions.map((c, i) => (
              <span key={c.currency}>{i > 0 && ' · '}{fmtLocal(c.amount, c.currency)}</span>
            ))}
          </p>
          {plan.cost.lines.some((l) => l.verificationStatus === 'needs-verification') && (
            <p className="mt-1 text-xs text-gray-600">(*) {tr('plan.pendingReview')}</p>
          )}
        </section>

        <footer className="mt-5 border-t border-gray-300 pt-3">
          <p className="text-xs leading-relaxed text-gray-700">{tr('plan.notBinding')}</p>
          <p className="mt-1 text-xs text-gray-500">
            {tr('export.generated')}: {new Date().toISOString().slice(0, 10)} · borderbridge
          </p>
        </footer>
      </article>

      {/* The plain-text half — hidden when printing, since the sheet above is the print version */}
      <section className="no-print">
        <h2 className="text-base font-semibold text-ink">{tr('export.plainText')}</h2>
        <p className="mt-1 text-xs text-gray-500">
          Select all of this and copy it. It is laid out to survive being pasted into a message.
        </p>
        <pre className="mt-2 max-h-96 overflow-auto rounded-md border border-gray-300 bg-white p-3 text-xs leading-relaxed text-ink">
{text}
        </pre>
      </section>

      <p className="no-print text-xs text-gray-500">
        To save as a PDF, use your browser&rsquo;s print option and choose &ldquo;Save as PDF&rdquo;
        as the destination. Only the sheet above is printed.
      </p>
    </div>
  );
}

function Problem({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-gray-300 bg-white p-5">
      <h1 className="text-lg font-semibold text-ink">{title}</h1>
      <p className="mt-1 text-sm text-gray-700">{body}</p>
      <Link href="/" className="tappable mt-4 inline-flex items-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
        Start again
      </Link>
    </div>
  );
}
