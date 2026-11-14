/**
 * FR-ADM-01 — create, amend and retire rules, stored as new versions.
 * FR-ADM-02 — an explicit publication step, recorded in the audit log.
 * FR-ADM-03 — a rule without its governing instrument and verification date is
 *             rejected, not stored and flagged.
 *
 * The base knowledge base is still data/rules.json, hand-editable and reviewable in
 * version control. What is written here are overlays on top of it, so constraint C1
 * survives a deployment that cannot write to its own source.
 */
import Link from 'next/link';
import { draftRuleAction, publishRuleAction, discardDraftAction } from '../../actions';
import { Field, Select, Submit, Notice, PageTitle, StatusPill, DatabaseMissing } from '../../ui';
import { requireUser } from '@/lib/session';
import { isConfigured } from '@/lib/db';
import { listOverlays, listAudit } from '@/lib/store';
import { listSupportedCorridors, getRulesForCorridor } from '@/lib/repository';
import { effectiveRules, overlayStateOf } from '@/lib/rules-admin';

export const dynamic = 'force-dynamic';

const STATE_LABEL: Record<string, { label: string; tone: 'green' | 'amber' | 'grey' | 'brand' }> = {
  base: { label: 'From the file', tone: 'grey' },
  amended: { label: 'Amended here', tone: 'brand' },
  retired: { label: 'Retired', tone: 'amber' },
  added: { label: 'Added here', tone: 'green' },
  'draft-pending': { label: 'Draft waiting', tone: 'amber' },
};

export default async function RulesAdminPage({
  searchParams,
}: {
  searchParams: { error?: string; drafted?: string; published?: string; discarded?: string; corridor?: string };
}) {
  const admin = await requireUser('/admin/rules');

  if (admin.role !== 'admin') {
    return (
      <div className="space-y-4">
        <PageTitle title="Rule management" back={{ href: '/admin', label: 'Administration' }} />
        <Notice kind="error">This area is for administrators.</Notice>
      </div>
    );
  }
  if (!isConfigured()) {
    return (
      <div className="space-y-4">
        <PageTitle title="Rule management" />
        <DatabaseMissing />
      </div>
    );
  }

  const corridors = listSupportedCorridors();
  const corridorId = searchParams.corridor && corridors.some((c) => c.id === searchParams.corridor)
    ? searchParams.corridor
    : corridors[0].id;

  const [overlays, audit] = await Promise.all([listOverlays(), listAudit(20)]);
  const base = getRulesForCorridor(corridorId);
  const inForce = effectiveRules(base, overlays).filter((r) => r.corridorId === corridorId);
  const drafts = overlays.filter((o) => o.status === 'draft');

  return (
    <div className="space-y-6">
      <PageTitle
        title="Rule management"
        subtitle="Amendments to the knowledge base. Nothing here reaches a trader until it is published."
        back={{ href: '/admin', label: 'Administration' }}
      />

      {searchParams.drafted && (
        <Notice kind="ok">
          <strong className="font-semibold">Draft saved.</strong> It changes nothing yet — publish it
          below when you are satisfied.
        </Notice>
      )}
      {searchParams.published && (
        <Notice kind="ok">
          <strong className="font-semibold">Published.</strong> Every plan generated from now on uses
          it, and everyone following that corridor has been told.
        </Notice>
      )}
      {searchParams.discarded && <Notice kind="ok">Draft discarded. Nothing a trader saw changed.</Notice>}
      {searchParams.error && <Notice kind="error">{searchParams.error}</Notice>}

      <Notice kind="info">
        <strong className="font-semibold">Where rules live.</strong> The base knowledge base is{' '}
        <code className="rounded bg-white px-1">data/rules.json</code>, reviewable in version control
        (constraint C1). This page writes versioned overlays on top of it, because a deployed
        application cannot edit its own source. Nothing is changed in place.
      </Notice>

      {/* FR-ADM-02 — drafts awaiting publication */}
      {drafts.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-ink">
            Waiting to be published <span className="font-normal text-gray-500">({drafts.length})</span>
          </h2>
          <ul className="mt-3 space-y-3">
            {drafts.map((o) => (
              <li key={o.id} className="rounded-md border border-amber-300 bg-amber-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {o.action === 'retire' ? 'Retire: ' : o.action === 'create' ? 'New: ' : 'Amend: '}
                      {o.payload.name}
                    </p>
                    <p className="font-mono text-xs text-gray-600">{o.ruleId} · version {o.version}</p>
                    <p className="mt-1 text-xs text-gray-600">
                      Drafted by {o.createdByName}, {new Date(o.createdAt).toLocaleString('en-GB')}
                    </p>
                    {o.note && <p className="mt-2 text-sm text-gray-700">{o.note}</p>}
                  </div>
                  <StatusPill label="Not in force" tone="amber" />
                </div>

                {o.action !== 'retire' && (
                  <dl className="mt-3 space-y-0.5 text-xs text-gray-700">
                    <div><dt className="inline font-medium">Source: </dt><dd className="inline">{o.payload.sourceCitation}</dd></div>
                    <div><dt className="inline font-medium">Verified: </dt><dd className="inline">{o.payload.lastVerifiedDate}</dd></div>
                    <div><dt className="inline font-medium">Reason: </dt><dd className="inline">{o.payload.reason}</dd></div>
                  </dl>
                )}

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <form action={publishRuleAction}>
                    <input type="hidden" name="overlayId" value={o.id} />
                    <button
                      type="submit"
                      className="w-full rounded-md bg-brand px-4 py-3 text-base font-semibold text-white hover:bg-[#17395A]"
                    >
                      Publish
                    </button>
                  </form>
                  <form action={discardDraftAction}>
                    <input type="hidden" name="overlayId" value={o.id} />
                    <button
                      type="submit"
                      className="w-full rounded-md border border-gray-300 bg-white px-4 py-3 text-base font-medium text-ink"
                    >
                      Discard
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Rules in force */}
      <section className="border-t border-gray-200 pt-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">
            In force <span className="font-normal text-gray-500">({inForce.length})</span>
          </h2>
          <div className="flex gap-2 text-sm">
            {corridors.map((c) => (
              <Link
                key={c.id}
                href={`/admin/rules?corridor=${c.id}`}
                className={`tappable inline-flex items-center rounded-md px-3 py-2 font-medium ${
                  c.id === corridorId ? 'bg-brand text-white' : 'border border-gray-300 bg-white text-ink'
                }`}
              >
                {c.originCountry}–{c.destinationCountry}
              </Link>
            ))}
          </div>
        </div>

        <ul className="mt-3 space-y-2">
          {inForce.map((r) => {
            const state = overlayStateOf(r.id, base, overlays);
            const s = STATE_LABEL[state];
            return (
              <li key={r.id} className="rounded-md border border-gray-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{r.name}</p>
                    <p className="text-xs text-gray-600">{r.ruleType} · {r.sourceCitation}</p>
                    <p className="font-mono text-xs text-gray-500">{r.id} v{r.version} · verified {r.lastVerifiedDate}</p>
                  </div>
                  <StatusPill label={s.label} tone={s.tone} />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* FR-ADM-01 — draft a change */}
      <section className="border-t border-gray-200 pt-5">
        <h2 className="text-base font-semibold text-ink">Draft a change</h2>
        <p className="mt-1 text-xs text-gray-500">
          Saved as a new version. It changes nothing a trader sees until you publish it.
        </p>

        <form action={draftRuleAction} className="mt-4 space-y-4">
          <Select
            label="What are you doing" name="action" defaultValue="amend"
            options={[
              { value: 'amend', label: 'Amending an existing rule' },
              { value: 'create', label: 'Creating a new rule' },
              { value: 'retire', label: 'Retiring a rule — it no longer applies' },
            ]}
          />
          <Select
            label="Corridor" name="corridorId" defaultValue={corridorId}
            options={corridors.map((c) => ({ value: c.id, label: `${c.originName} → ${c.destinationName}` }))}
          />
          <Field
            label="Rule identifier" name="id" required
            hint="For an amendment or retirement, the identifier of the existing rule — for example RW-UG-RATE-002."
          />
          <Select
            label="Kind" name="ruleType" defaultValue="document"
            options={[
              { value: 'document', label: 'Document requirement' },
              { value: 'duty', label: 'Import duty' },
              { value: 'tax', label: 'Tax' },
              { value: 'fee', label: 'Fee' },
              { value: 'threshold', label: 'Threshold' },
              { value: 'transport', label: 'Indicative transport rate' },
            ]}
          />
          <Field label="Name" name="name" required hint="What a trader would call it." />
          <Field label="Why it applies" name="reason" required hint="Shown to the trader, not kept internally." />

          <Field
            label="Governing instrument" name="sourceCitation" required
            hint="Required. A rule without a citation cannot be published (FR-ADM-03)."
          />
          <Field label="Link to the instrument" name="sourceUrl" />
          <Field
            label="Last verified" name="lastVerifiedDate" required
            hint="YYYY-MM-DD. Required, and cannot be in the future."
          />

          <Select
            label="Who it applies to" name="scope" defaultValue="all"
            options={[
              { value: 'all', label: 'Every consignment on the corridor' },
              { value: 'str-eligible', label: 'Simplified Trade Regime consignments only' },
              { value: 'str-ineligible', label: 'Full customs procedure only' },
              { value: 'eac-origin', label: 'EAC-originating goods' },
              { value: 'hs-prefix', label: 'Specific HS code prefixes' },
            ]}
          />
          <Field label="HS prefixes" name="hsPrefixes" hint="Comma separated, for example 06, 07, 09. Only used with the HS prefix scope." />

          <Field label="Issuing authority" name="issuingAuthority" hint="Required for a document rule — the trader has to know who to ask." />
          <Field label="Typical processing time" name="estimatedProcessingTime" hint="For example: 2–5 working days." />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Rate %" name="ratePercent" type="number" inputMode="numeric" min={0} max={100} step="0.01" />
            <Field label="Flat amount" name="flatAmount" type="number" inputMode="numeric" min={0} step="0.01" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Threshold value" name="thresholdValue" type="number" inputMode="numeric" min={0} step="1" />
            <Select
              label="Currency" name="flatCurrency" defaultValue="USD"
              options={[{ value: 'USD', label: 'USD' }, { value: 'RWF', label: 'RWF' }, { value: 'UGX', label: 'UGX' }]}
            />
          </div>

          <Field label="Note for the audit log" name="note" hint="Why this change is being made." />

          <Submit>Save as draft</Submit>
        </form>
      </section>

      {/* FR-ADM-02 — the audit log */}
      <section className="border-t border-gray-200 pt-5">
        <h2 className="text-base font-semibold text-ink">Audit log</h2>
        <p className="mt-1 text-xs text-gray-500">
          Who changed what, and when. The actor&rsquo;s name is copied in rather than only
          referenced, so closing an account does not erase who published a change.
        </p>
        {audit.length === 0 ? (
          <p className="mt-3 text-sm text-gray-700">Nothing recorded yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {audit.map((a) => (
              <li key={a.id} className="rounded-md border border-gray-200 bg-white p-3">
                <p className="text-sm font-medium text-ink">
                  <span className="font-mono text-xs text-brand">{a.action}</span> · {a.subject}
                </p>
                {a.detail && <p className="mt-0.5 text-sm text-gray-700">{a.detail}</p>}
                <p className="mt-1 text-xs text-gray-500">
                  {a.actorName} · {new Date(a.createdAt).toLocaleString('en-GB')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
