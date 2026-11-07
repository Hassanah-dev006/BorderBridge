/**
 * FR-ACC-06 — an administrator verifies a transport provider or buyer account.
 * FR-ADM-04 — rules past their review interval are surfaced for re-verification.
 *
 * Reachable only by a user whose role is 'admin'. The README explains how to promote
 * an account, since there is deliberately no self-service route to this role.
 */
import { verifyAccountAction } from '../actions';
import { Notice, PageTitle, StatusPill } from '../ui';
import { requireUser } from '@/lib/session';
import { listUsers } from '@/lib/store';
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

  const users = await listUsers();
  const overdue = listCorridors()
    .flatMap((c) => getRulesForCorridor(c.id))
    .filter((r) => isOverdue(r));

  return (
    <div className="space-y-6">
      <PageTitle title="Administration" subtitle="Account verification and rule review." />

      {searchParams.saved && <Notice kind="ok">Saved.</Notice>}
      {searchParams.error && <Notice kind="error">{searchParams.error}</Notice>}

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
