/**
 * FR-ACC-06 — an administrator verifies a transport provider or buyer account.
 * FR-ADM-04 — rules past their review interval are surfaced for re-verification.
 *
 * Reachable only by a user whose role is 'admin'. The README explains how to promote
 * an account, since there is deliberately no self-service route to this role.
 */
import Link from 'next/link';
import { verifyAccountAction, resolveDeletionAction, resolveContentReportAction } from '../actions';
import { Notice, PageTitle, StatusPill } from '../ui';
import { requireUser } from '@/lib/session';
import { listUsers, listDeletionRequests, listContentReports } from '@/lib/store';
import { getRulesForCorridor, isOverdue, REVIEW_INTERVAL_DAYS, listCorridors } from '@/lib/repository';

export const dynamic = 'force-dynamic';

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { error?: string; saved?: string };
}) {
  const admin = await requireUser('/admin');

  if (admin.role !== 'admin') {
    return (
      <div className="space-y-4">
        <PageTitle title="Administration" />
        <Notice kind="error">
          This area is for administrators. Your account is registered as a{' '}
          {admin.role === 'provider' ? 'transport provider' : 'trader'}.
        </Notice>
      </div>
    );
  }

  const [users, deletions, contentReports] = await Promise.all([
    listUsers(), listDeletionRequests(), listContentReports(),
  ]);
  const openDeletions = deletions.filter((d) => d.status === 'open');
  const openContent = contentReports.filter((r) => r.status === 'open');
  const overdue = listCorridors()
    .flatMap((c) => getRulesForCorridor(c.id))
    .filter((r) => isOverdue(r));

  return (
    <div className="space-y-6">
      <PageTitle title="Administration" subtitle="Account verification and rule review." />

      {searchParams.saved && <Notice kind="ok">Saved.</Notice>}
      {searchParams.error && <Notice kind="error">{searchParams.error}</Notice>}

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/admin/rules"
          className="tappable flex flex-col gap-1 rounded-md border border-brand bg-brand-pale p-4"
        >
          <span className="text-base font-semibold text-brand">Rule management</span>
          <span className="text-sm text-gray-700">Create, amend and retire rules</span>
        </Link>
        <Link
          href="/admin/reports"
          className="tappable flex flex-col gap-1 rounded-md border border-brand bg-brand-pale p-4"
        >
          <span className="text-base font-semibold text-brand">Reporting</span>
          <span className="text-sm text-gray-700">Metrics and estimate accuracy</span>
        </Link>
      </div>

      {/* NFR-PRI-03 — data subject requests take priority: they are a legal obligation */}
      {openDeletions.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-ink">
            Deletion requests <span className="font-normal text-gray-500">({openDeletions.length})</span>
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            A right under Law No. 058/2021. Erase the account and contact details; anonymise rather
            than delete anything other traders relied on, and say which you did.
          </p>
          <ul className="mt-3 space-y-3">
            {openDeletions.map((d) => (
              <li key={d.id} className="rounded-md border border-amber-300 bg-amber-50 p-4">
                <p className="font-medium text-ink">{d.userName}</p>
                <p className="text-sm text-gray-700">{d.userPhone}</p>
                {d.reason && <p className="mt-2 text-sm text-gray-700">“{d.reason}”</p>}
                <p className="mt-1 text-xs text-gray-600">
                  Asked {new Date(d.createdAt).toLocaleString('en-GB')}
                </p>
                <form action={resolveDeletionAction} className="mt-3 space-y-2">
                  <input type="hidden" name="requestId" value={d.id} />
                  <input
                    name="response" required
                    placeholder="What you did, in words they will understand"
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button type="submit" name="status" value="completed"
                      className="rounded-md bg-brand px-4 py-3 text-base font-semibold text-white hover:bg-brand-dark">
                      Completed
                    </button>
                    <button type="submit" name="status" value="refused"
                      className="rounded-md border border-gray-300 bg-white px-4 py-3 text-base font-medium text-ink">
                      Cannot complete
                    </button>
                  </div>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* NFR-LEG-04 — content reported as wrong */}
      {openContent.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-ink">
            Content reported as wrong <span className="font-normal text-gray-500">({openContent.length})</span>
          </h2>
          <ul className="mt-3 space-y-3">
            {openContent.map((r) => (
              <li key={r.id} className="rounded-md border border-gold-bright bg-gold-pale p-4">
                <p className="font-medium text-ink">{r.ruleId || 'Not attributed to a rule'}</p>
                <p className="mt-1 text-sm text-gray-800">{r.whatIsWrong}</p>
                {r.source && (
                  <p className="mt-1 text-sm text-gray-700">
                    <span className="font-medium">They cite:</span> {r.source}
                  </p>
                )}
                <p className="mt-1 text-xs text-gray-600">
                  {r.reporterName} · {new Date(r.createdAt).toLocaleString('en-GB')}
                </p>
                <form action={resolveContentReportAction} className="mt-3 space-y-2">
                  <input type="hidden" name="reportId" value={r.id} />
                  <input
                    name="response"
                    placeholder="What you found when you checked (optional)"
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button type="submit" name="status" value="accepted"
                      className="rounded-md bg-brand px-4 py-3 text-base font-semibold text-white hover:bg-brand-dark">
                      They are right
                    </button>
                    <button type="submit" name="status" value="rejected"
                      className="rounded-md border border-gray-300 bg-white px-4 py-3 text-base font-medium text-ink">
                      Rule stands
                    </button>
                  </div>
                </form>
                {r.status === 'accepted' && (
                  <p className="mt-2 text-xs text-gray-700">
                    Now draft the amendment on the rule management page.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* FR-ACC-06 */}
      <section>
        <h2 className="text-base font-semibold text-ink">Accounts ({users.length})</h2>
        <ul className="mt-3 space-y-2">
          {users.map((u) => (
            <li key={u.id} className="rounded-md border border-gray-200 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{u.displayName}</p>
                  <p className="text-sm text-gray-600">{u.phone}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <StatusPill label={u.role} tone="brand" />
                    <StatusPill
                      label={u.phoneVerifiedAt ? 'Phone confirmed' : 'Phone unconfirmed'}
                      tone={u.phoneVerifiedAt ? 'green' : 'amber'}
                    />
                    {u.verifiedByAdmin && <StatusPill label="Verified" tone="green" />}
                  </div>
                </div>
                {u.role !== 'trader' && (
                  <form action={verifyAccountAction} className="shrink-0">
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="verified" value={u.verifiedByAdmin ? 'false' : 'true'} />
                    <button
                      type="submit"
                      className={`rounded-md px-3 py-2 text-sm font-medium ${
                        u.verifiedByAdmin ? 'border border-gray-300 bg-white text-ink' : 'bg-brand text-white'
                      }`}
                      style={{ minHeight: 44 }}
                    >
                      {u.verifiedByAdmin ? 'Withdraw' : 'Verify'}
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* FR-ADM-04 */}
      <section className="border-t border-gray-200 pt-5">
        <h2 className="text-base font-semibold text-ink">Rules due for re-verification</h2>
        <p className="mt-1 text-xs text-gray-500">
          A rule is queued once {REVIEW_INTERVAL_DAYS} days have passed since it was last confirmed,
          or when it is explicitly marked as needing verification. Output derived from these rules is
          flagged to the trader.
        </p>
        {overdue.length === 0 ? (
          <p className="mt-3 text-sm text-gray-700">Nothing is overdue.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {overdue.map((r) => (
              <li key={r.id} className="rounded-md border border-amber-300 bg-amber-50 p-3">
                <p className="font-medium text-ink">{r.name}</p>
                <p className="text-xs text-gray-700">{r.sourceCitation}</p>
                <p className="text-xs text-gray-600">
                  <span className="font-mono">{r.id}</span> · last verified {r.lastVerifiedDate}
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-gray-500">
          Rules are edited in <code className="rounded bg-gray-100 px-1">data/rules.json</code>, not here —
          SRS constraint C1 keeps the knowledge base as data a non-developer can amend and review.
        </p>
      </section>
    </div>
  );
}
