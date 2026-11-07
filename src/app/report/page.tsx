/**
 * FR-BRD-03 — report current conditions at a crossing.
 *
 * This closes the loop the border module was missing: until now every report in the
 * system was seed data. What is submitted here is weighted by FR-BRD-05 and feeds the
 * FR-BRD-01 ranking immediately.
 */
import Link from 'next/link';
import { submitReportAction } from '../actions';
import { Field, Select, Submit, Notice, PageTitle, StatusPill, DatabaseMissing } from '../ui';
import { currentUser } from '@/lib/session';
import { isConfigured } from '@/lib/db';
import { recentReports } from '@/lib/store';
import { listCrossings, weightedReports, REPORT_WINDOW_HOURS, allReports } from '@/lib/border';
import { listSupportedCorridors } from '@/lib/repository';

export const dynamic = 'force-dynamic';

export default async function ReportPage({
  searchParams,
}: {
  searchParams: { error?: string; thanks?: string; crossingId?: string };
}) {
  const user = await currentUser();
  const crossings = listSupportedCorridors().flatMap((c) => listCrossings(c.id));
  const live = isConfigured() ? await recentReports() : [];
  const pool = allReports(live);

  return (
    <div className="space-y-6">
      <PageTitle
        title="Report border conditions"
        subtitle="Tell other traders what the queue is like right now. It takes fifteen seconds."
      />

      {!isConfigured() && <DatabaseMissing />}
      {searchParams.thanks && (
        <Notice kind="ok">
          <strong className="font-semibold">Thank you.</strong> Your report is already counting
          towards the crossing recommendation, and will fade out over the next {REPORT_WINDOW_HOURS} hours.
        </Notice>
      )}
      {searchParams.error && <Notice kind="error">{searchParams.error}</Notice>}

      {!user && (
        <Notice kind="info">
          You can report without signing in.{' '}
          <Link href="/login?next=/report" className="font-medium text-brand underline">Sign in</Link>{' '}
          to have reports counted towards your profile.
        </Notice>
      )}

      <form action={submitReportAction} className="space-y-4">
        <Select
          label="Which crossing" name="crossingId" defaultValue={searchParams.crossingId}
          options={crossings.map((c) => ({ value: c.id, label: c.name }))}
        />
        <Select
          label="How is it" name="category" defaultValue="normal"
          options={[
            { value: 'normal', label: 'Normal — moving steadily' },
            { value: 'busy', label: 'Busy — longer than usual' },
            { value: 'severe-delay', label: 'Severe delay — several hours' },
            { value: 'closed', label: 'Closed — nothing moving' },
          ]}
        />
        <Field
          label="Roughly how long is the wait" name="waitMinutes" type="number" required
          inputMode="numeric" min={0} max={2880} defaultValue={60}
          hint="In minutes. An estimate is fine — reports are averaged."
        />
        <Field label="Anything else" name="note" hint="For example: scanner down, long truck queue on the Rwandan side." />
        <Submit>Submit report</Submit>
      </form>

      {/* What the community is currently saying */}
      <section className="border-t border-gray-200 pt-5">
        <h2 className="text-base font-semibold text-ink">What others are reporting</h2>
        <p className="mt-1 text-xs text-gray-500">
          Reports lose weight as they age and are dropped entirely after {REPORT_WINDOW_HOURS} hours,
          so nothing stale is presented as current.
        </p>

        <ul className="mt-3 space-y-3">
          {crossings.map((c) => {
            const rs = weightedReports(c.id, new Date(), pool).filter((r) => !r.expired);
            return (
              <li key={c.id} className="rounded-md border border-gray-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-ink">{c.name}</p>
                  <StatusPill
                    label={rs.length === 0 ? 'No current report' : `${rs.length} report${rs.length === 1 ? '' : 's'}`}
                    tone={rs.length === 0 ? 'grey' : 'brand'}
                  />
                </div>
                {rs.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {rs.slice(0, 4).map((r) => (
                      <li key={r.id} className="text-sm text-gray-700">
                        <span className="font-medium">{r.category.replace('-', ' ')}</span> · about{' '}
                        {r.waitMinutes} min · <span className="text-gray-500">{r.ageHours}h ago</span>
                        <span className="text-gray-400"> · weight {r.weight.toFixed(2)}</span>
                        {r.note && <span className="text-gray-600"> — {r.note}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
