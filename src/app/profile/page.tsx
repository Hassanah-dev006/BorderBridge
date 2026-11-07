/**
 * FR-ACC-05 — the reusable trader profile.
 *
 * Stated once, then reused: the home corridor pre-selects the route on the planning
 * form, so a returning trader answers fewer questions each time.
 */
import Link from 'next/link';
import { updateProfileAction, logoutAction } from '../actions';
import { Field, Select, Submit, Notice, PageTitle, StatusPill } from '../ui';
import { requireUser } from '@/lib/session';
import { listSupportedCorridors } from '@/lib/repository';
import { countReportsByUser, listShipments } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: { error?: string; saved?: string; welcome?: string };
}) {
  const user = await requireUser('/profile');
  const corridors = listSupportedCorridors();
  const [reports, shipments] = await Promise.all([
    countReportsByUser(user.id),
    listShipments(user.id),
  ]);

  return (
    <div className="space-y-6">
      <PageTitle title="Your profile" subtitle={user.phone} />

      {searchParams.welcome && (
        <Notice kind="ok">
          <strong className="font-semibold">Your phone number is confirmed.</strong> Fill in the
          rest of your details so we can pre-fill your trade plans.
        </Notice>
      )}
      {searchParams.saved && <Notice kind="ok">Profile saved.</Notice>}
      {searchParams.error && <Notice kind="error">{searchParams.error}</Notice>}

      <div className="flex flex-wrap items-center gap-2">
        <StatusPill label={user.role === 'trader' ? 'Trader' : user.role === 'provider' ? 'Transport provider' : 'Administrator'} tone="brand" />
        <StatusPill label="Phone confirmed" tone="green" />
        {user.role !== 'trader' && (
          <StatusPill
            label={user.verifiedByAdmin ? 'Verified by administrator' : 'Awaiting verification'}
            tone={user.verifiedByAdmin ? 'green' : 'amber'}
          />
        )}
      </div>

      <dl className="grid grid-cols-2 gap-3 rounded-md border border-gray-200 bg-white p-4 text-sm">
        <div>
          <dt className="text-gray-500">Shipments</dt>
          <dd className="text-lg font-semibold text-ink">{shipments.length}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Border reports filed</dt>
          <dd className="text-lg font-semibold text-ink">{reports}</dd>
        </div>
      </dl>

      <form action={updateProfileAction} className="space-y-4">
        <Field label="Your name" name="displayName" required defaultValue={user.displayName} autoComplete="name" />
        <Field
          label="Business name" name="businessName" defaultValue={user.businessName ?? ''}
          hint="Shown to transport providers you contact."
        />
        <Select
          label="Route you trade most often" name="homeCorridorId"
          defaultValue={user.homeCorridorId ?? ''}
          options={[
            { value: '', label: 'No preference' },
            ...corridors.map((c) => ({ value: c.id, label: `${c.originName} → ${c.destinationName}` })),
          ]}
          hint="Pre-selected on the planning form next time."
        />
        <Field
          label="Products you usually move" name="principalProducts"
          defaultValue={user.principalProducts ?? ''} hint="For example: coffee, beans, maize."
        />
        <Select
          label="Language" name="language" defaultValue={user.preferredLanguage}
          options={[
            { value: 'en', label: 'English' },
            { value: 'fr', label: 'Français' },
            { value: 'sw', label: 'Kiswahili' },
            { value: 'rw', label: 'Kinyarwanda' },
          ]}
        />
        <Submit>Save profile</Submit>
      </form>

      <div className="space-y-3 border-t border-gray-200 pt-5">
        <Link
          href="/shipments"
          className="tappable flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-3 text-base font-medium text-ink"
        >
          My shipments
        </Link>
        <form action={logoutAction}>
          <Submit variant="quiet">Sign out</Submit>
        </form>
      </div>
    </div>
  );
}
