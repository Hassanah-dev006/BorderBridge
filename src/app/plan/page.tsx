/**
 * The trade plan: checklist, eligibility and itemised cost.
 * Realises FR-REQ-02, FR-REQ-03, FR-CST-01, FR-CST-03 and FR-CST-04.
 */
import Link from 'next/link';
import { buildTradePlan, fmtUsd, fmtLocal, UnsupportedCorridorError, UnknownProductError } from '@/lib/engines';
import { recentReports } from '@/lib/store';
import { isConfigured } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { createShipmentAction } from '../actions';
import type { BorderReport, TradePlan } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Search = { [k: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function PlanPage({ searchParams }: { searchParams: Search }) {
  const corridorId = one(searchParams.corridor) ?? '';
  const productId = one(searchParams.product) ?? '';
  const quantity = Number(one(searchParams.quantity) ?? 0);
  const declaredValue = Number(one(searchParams.value) ?? 0);
  const currency = one(searchParams.currency) ?? 'USD';

  if (!corridorId || !productId || !(quantity > 0) || !(declaredValue > 0)) {
    return <Problem title="Something was missing" body="Please go back and complete every field." />;
  }

  // FR-BRD-03 submissions feed the FR-BRD-01 ranking. Fetched here and passed in, so
  // the engine itself stays free of I/O and unit testable.
  const live: BorderReport[] = isConfigured() ? await recentReports() : [];
  const user = await currentUser();

  let plan: TradePlan;
  try {
    plan = buildTradePlan({ corridorId, productId, quantity, declaredValue, currency }, live);
  } catch (e) {
    if (e instanceof UnsupportedCorridorError) {
      return (
        <Problem
          title="This route is not yet covered"
          body="BorderBridge currently covers the Rwanda–Uganda corridor. We are adding more."
        />
      );
    }
    if (e instanceof UnknownProductError) {
      return <Problem title="We do not recognise that product" body="Please go back and pick one from the list." />;
    }
    throw e;
  }

  const { eligibility: el, cost, checklist, crossingRanking: cr } = plan;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="tappable inline-flex items-center text-sm text-brand">← Change details</Link>
        <h1 className="mt-2 text-xl font-semibold text-ink">
          {plan.product.name} · {plan.intention.quantity} {plan.product.unit}
        </h1>
        <p className="text-sm text-gray-600">
          {plan.corridor.originName} → {plan.corridor.destinationName} · recommended crossing:{' '}
          <strong className="font-medium text-ink">{plan.recommendedCrossing}</strong>
        </p>
      </div>

      {plan.hasUnverifiedContent && (
        <div className="rounded-md border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">
          <strong className="font-semibold">Some items are pending re-verification.</strong> Entries marked
          below were last confirmed more than six months ago. Treat them as indicative and check with the
          issuing authority.
        </div>
      )}

      {/* FR-REQ-03 — eligibility */}
      <section
        className={`rounded-md border p-4 ${
          el.eligible ? 'border-green-300 bg-green-50' : 'border-gray-300 bg-white'
        }`}
      >
        <h2 className="text-base font-semibold text-ink">
          {el.eligible ? 'Qualifies for the Simplified Trade Regime' : 'Full customs procedure applies'}
        </h2>
        <ul className="mt-2 space-y-1 text-sm text-gray-700">
          {el.reasons.map((r, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="text-gray-400">•</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-gray-500">
          {el.sourceCitation} · last verified {el.lastVerifiedDate}
        </p>
      </section>

      {/* FR-BRD-01 — crossing recommendation, FR-BRD-05 — report age */}
      <section>
        <h2 className="text-base font-semibold text-ink">Which crossing to use</h2>
        {cr.recommended ? (
          <>
            <div className="mt-3 rounded-md border border-brand-light bg-brand-pale p-3">
              <p className="font-medium text-ink">{cr.recommended.crossing.name}</p>
              <p className="mt-1 text-sm text-gray-700">
                <span className="font-medium">Decided by:</span> {cr.decidedBy}
              </p>
              <dl className="mt-2 space-y-0.5 text-xs text-gray-600">
                <div><dt className="inline font-medium">Status: </dt><dd className="inline">{cr.recommended.crossing.officialStatus}</dd></div>
                <div><dt className="inline font-medium">Open: </dt><dd className="inline">{cr.recommended.crossing.openingHours}</dd></div>
                <div><dt className="inline font-medium">Distance: </dt><dd className="inline">{cr.recommended.crossing.roadDistanceKm} km</dd></div>
                <div><dt className="inline font-medium">Reported wait: </dt><dd className="inline">{cr.recommended.meanWaitMinutes === null ? `no report in the last ${cr.windowHours} hours` : `${cr.recommended.meanWaitMinutes} minutes`}</dd></div>
                <div><dt className="inline font-medium">Source: </dt><dd className="inline">{cr.recommended.crossing.sourceCitation} · verified {cr.recommended.crossing.lastVerifiedDate}</dd></div>
              </dl>
            </div>

            {cr.ranked.length > 1 && (
              <div className="mt-3">
                <p className="text-sm font-medium text-ink">Also considered</p>
                <ul className="mt-1 space-y-1">
                  {cr.ranked.slice(1).map((r) => (
                    <li key={r.crossing.id} className="text-sm text-gray-700">
                      {r.crossing.name} — {r.crossing.officialStatus}, {r.crossing.roadDistanceKm} km,{' '}
                      {r.meanWaitMinutes === null ? 'no current report' : `${r.meanWaitMinutes} min reported wait`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {cr.excluded.length > 0 && (
              <p className="mt-2 text-xs text-gray-500">
                Not considered: {cr.excluded.map((e) => `${e.name} (${e.reason.toLowerCase()})`).join(' · ')}
              </p>
            )}

            <div className="mt-3">
              <p className="text-sm font-medium text-ink">Recent reports from other traders</p>
              {cr.recommended.reports.filter((r) => !r.expired).length === 0 ? (
                <p className="mt-1 text-sm text-gray-600">No report in the last {cr.windowHours} hours.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {cr.recommended.reports.filter((r) => !r.expired).map((r) => (
                    <li key={r.id} className="text-sm text-gray-700">
                      <span className="font-medium">{r.category.replace('-', ' ')}</span> · about {r.waitMinutes} min ·{' '}
                      <span className="text-gray-500">{r.ageHours}h ago</span>
                      {r.note && <span className="text-gray-600"> — {r.note}</span>}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-xs text-gray-500">
                Reports lose weight as they age and are dropped after {12} hours, so nothing stale is shown as current.
              </p>
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-gray-700">
            No crossing on this corridor is able to process this consignment.
          </p>
        )}
      </section>

      {/* FR-REQ-02 — checklist */}
      <section>
        <h2 className="text-base font-semibold text-ink">
          Documents you need <span className="font-normal text-gray-500">({checklist.length})</span>
        </h2>
        <ol className="mt-3 space-y-3">
          {checklist.map((item, i) => (
            <li key={item.ruleId} className="rounded-md border border-gray-200 bg-white p-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-light text-xs font-semibold text-brand">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">
                    {item.name}
                    {item.mandatory && <span className="ml-2 text-xs font-normal text-red-700">required</span>}
                    {item.verificationStatus === 'needs-verification' && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-900">
                        pending re-verification
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-sm text-gray-700">{item.reason}</p>
                  <dl className="mt-2 space-y-0.5 text-xs text-gray-600">
                    <div><dt className="inline font-medium">Issued by: </dt><dd className="inline">{item.issuingAuthority}</dd></div>
                    <div><dt className="inline font-medium">Typically takes: </dt><dd className="inline">{item.estimatedProcessingTime}</dd></div>
                    <div><dt className="inline font-medium">Source: </dt><dd className="inline">{item.sourceCitation} · verified {item.lastVerifiedDate}</dd></div>
                  </dl>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* FR-CST-01 / FR-CST-03 — itemised cost with per-line attribution */}
      <section>
        <h2 className="text-base font-semibold text-ink">What it should cost</h2>
        <div className="mt-3 overflow-hidden rounded-md border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <tbody>
              {cost.lines.map((l, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium text-ink">
                      {l.description}
                      {l.verificationStatus === 'needs-verification' && (
                        <span className="ml-1.5 text-xs font-normal text-amber-700">(unverified)</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-600">{l.detail}</div>
                    <div className="text-xs text-gray-500">{l.sourceCitation}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right align-top font-medium tabular-nums text-ink">
                    {fmtUsd(l.amountUsd)}
                  </td>
                </tr>
              ))}
              <tr className="bg-brand-pale">
                <td className="px-3 py-3 font-semibold text-ink">
                  Estimated total
                  <div className="text-xs font-normal text-gray-600">± {cost.confidencePercent}%</div>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-base font-bold tabular-nums text-brand">
                  {fmtUsd(cost.totalUsd)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-2 text-xs text-gray-600">
          Also{' '}
          {cost.conversions.map((c, i) => (
            <span key={c.currency}>
              {i > 0 && ' · '}
              <strong className="font-medium">{fmtLocal(c.amount, c.currency)}</strong>
            </span>
          ))}
          {' '}· rate retrieved {cost.exchangeRateAgeHours}h ago
        </p>

        {/* FR-CST-04 — non-dismissible limitation statement */}
        <p className="mt-3 rounded-md border-l-4 border-brand bg-brand-pale p-3 text-xs leading-relaxed text-gray-700">
          This is an estimate, not a binding determination. Duties, taxes and fees are finally assessed
          by the customs authority at the border, which may reach a different figure.
        </p>
      </section>

      {/* FR-SHP-01 — turn the plan into something trackable */}
      <section className="border-t border-gray-200 pt-5">
        <h2 className="text-base font-semibold text-ink">Ready to go ahead?</h2>
        <p className="mt-1 text-sm text-gray-700">
          Create a shipment and this plan is frozen as it stands. You can then tick off each document
          as you obtain it, and track the consignment to delivery.
        </p>
        <form action={createShipmentAction} className="mt-3">
          <input type="hidden" name="corridor" value={corridorId} />
          <input type="hidden" name="product" value={productId} />
          <input type="hidden" name="quantity" value={quantity} />
          <input type="hidden" name="value" value={declaredValue} />
          <input type="hidden" name="currency" value={currency} />
          <input
            type="hidden"
            name="query"
            value={`corridor=${corridorId}&product=${productId}&quantity=${quantity}&value=${declaredValue}&currency=${currency}`}
          />
          <button
            type="submit"
            className="w-full rounded-md bg-brand px-4 py-3 text-base font-semibold text-white hover:bg-[#17395A]"
          >
            Create shipment from this plan
          </button>
        </form>
        {!user && (
          <p className="mt-2 text-xs text-gray-600">
            You will be asked to sign in first, then brought straight back here.
          </p>
        )}
        <p className="mt-3 text-center text-sm">
          <Link href={`/report?crossingId=${cr.recommended?.crossing.id ?? ''}`} className="tappable font-medium text-brand underline">
            At the border now? Report the queue
          </Link>
        </p>
      </section>
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
