/**
 * FR-RPT-01 — operational metrics.
 * FR-RPT-02 — the accuracy of cost estimates against recorded actual outcomes,
 *             identifying the rules responsible.
 *
 * The second one is the honest one: a system that tells traders what a movement will
 * cost ought to be able to say how often it was right. Where the sample is too small
 * to mean anything, the page says so rather than drawing a confident chart.
 */
import { Notice, PageTitle, StatusPill, DatabaseMissing } from '../../ui';
import { requireUser } from '@/lib/session';
import { isConfigured } from '@/lib/db';
import { operationalMetrics, shipmentsWithOutcomes } from '@/lib/store';
import { outcomeOf, accuracyReport, biasLabel, confidenceCaveat } from '@/lib/reporting';
import { fmtUsd } from '@/lib/engines';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const admin = await requireUser('/admin/reports');

  if (admin.role !== 'admin') {
    return (
      <div className="space-y-4">
        <PageTitle title="Reporting" back={{ href: '/admin', label: 'Administration' }} />
        <Notice kind="error">This area is for administrators.</Notice>
      </div>
    );
  }
  if (!isConfigured()) {
    return (
      <div className="space-y-4">
        <PageTitle title="Reporting" />
        <DatabaseMissing />
      </div>
    );
  }

  const [metrics, rows] = await Promise.all([operationalMetrics(), shipmentsWithOutcomes()]);
  const report = accuracyReport(rows.map((r) => outcomeOf(r.shipment, r.actualUsd, r.recordedAt)));
  const caveat = confidenceCaveat(report.count);

  return (
    <div className="space-y-6">
      <PageTitle
        title="Reporting"
        subtitle="What the system is doing, and how close its estimates have been."
        back={{ href: '/admin', label: 'Administration' }}
      />

      {/* FR-RPT-01 */}
      <section>
        <h2 className="text-base font-semibold text-ink">Operational metrics</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Metric label="Registered accounts" value={metrics.registrations} />
          <Metric label="Active in last 30 days" value={metrics.activeUsers30d} />
          <Metric label="Shipments created" value={metrics.shipmentsCreated} />
          <Metric label="Shipments delivered" value={metrics.shipmentsDelivered} />
          <Metric label="Documents obtained" value={metrics.checklistItemsObtained} />
          <Metric label="Border reports filed" value={metrics.borderReports} />
          <Metric label="Transport requests" value={metrics.transportRequests} />
          <Metric label="Active market listings" value={metrics.marketListings} />
          <Metric label="Transport providers" value={metrics.providers} />
          <Metric label="Verified accounts" value={metrics.verifiedAccounts} />
        </div>
      </section>

      {/* FR-RPT-02 */}
      <section className="border-t border-gray-200 pt-5">
        <h2 className="text-base font-semibold text-ink">Estimate accuracy</h2>

        {caveat && (
          <div className="mt-3">
            <Notice kind="info">{caveat}</Notice>
          </div>
        )}

        {report.count > 0 && (
          <>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Metric
                label="Outcomes recorded"
                value={report.count}
              />
              <Metric
                label="Mean error"
                value={report.meanAbsolutePercent === null ? '—' : `${report.meanAbsolutePercent.toFixed(1)}%`}
              />
              <Metric
                label="Inside stated range"
                value={`${report.withinConfidence} of ${report.count}`}
              />
            </div>

            <p className="mt-3 rounded-md border-l-4 border-brand bg-brand-pale p-3 text-sm text-gray-800">
              {biasLabel(report.biasPercent)}
            </p>

            {/* The rules appearing in the estimates that missed by the most */}
            {report.suspectRules.length > 0 && (
              <div className="mt-5">
                <h3 className="text-sm font-semibold text-ink">Rules to look at first</h3>
                <p className="mt-1 text-xs text-gray-500">
                  Rules that appear in the estimates that missed by the most. This is a lead, not a
                  verdict — the transport rate appears in nearly every estimate, so it will head
                  this list whether or not it is the cause.
                </p>
                <div className="mt-3 overflow-hidden rounded-md border border-gray-200 bg-white">
                  <table className="w-full text-sm">
                    <tbody>
                      {report.suspectRules.map((s) => (
                        <tr key={s.ruleId} className="border-b border-gray-100 last:border-0">
                          <td className="px-3 py-2 font-mono text-xs text-ink">{s.ruleId}</td>
                          <td className="px-3 py-2 text-right text-gray-600">
                            {s.appearances} estimate{s.appearances === 1 ? '' : 's'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums text-ink">
                            {s.meanAbsolutePercent.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* The individual outcomes */}
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-ink">Recorded outcomes</h3>
              <ul className="mt-3 space-y-2">
                {report.outcomes.slice(0, 12).map((o) => {
                  const band = o.unverifiedAtPlanning ? 20 : 12;
                  const inside = Math.abs(o.variancePercent) <= band;
                  return (
                    <li key={o.shipmentId} className="rounded-md border border-gray-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-ink">{o.productName}</p>
                          <p className="text-sm text-gray-600">
                            Estimated {fmtUsd(o.estimatedUsd)} · actual {fmtUsd(o.actualUsd)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {o.variancePercent >= 0 ? 'Under-estimated' : 'Over-estimated'} by{' '}
                            {Math.abs(o.variancePercent).toFixed(1)}% · stated range was ±{band}%
                          </p>
                        </div>
                        <StatusPill
                          label={inside ? 'Within range' : 'Outside range'}
                          tone={inside ? 'green' : 'amber'}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}

        <p className="mt-5 text-xs leading-relaxed text-gray-500">
          Outcomes are recorded by traders on a delivered shipment, against the plan frozen when
          that shipment was created. Comparing today&rsquo;s rules against a cost incurred months
          ago would measure nothing.
        </p>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{value}</p>
    </div>
  );
}
