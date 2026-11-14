/**
 * NFR-LEG-01 — terms of use and a privacy notice.
 * NFR-PRI-03 — export the personal data held about you, and request its deletion.
 * NFR-LEG-02 — state plainly that this is not a licensed customs clearing agent.
 *
 * These are written to be read by the person they concern, not by a lawyer. Rwanda's
 * Law No. 058/2021 gives a data subject rights of access and erasure; a notice that
 * nobody can follow does not deliver them.
 */
import Link from 'next/link';
import { requestDeletionAction } from '../actions';
import { Notice, PageTitle, StatusPill } from '../ui';
import { currentUser } from '@/lib/session';
import { withLanguage } from '@/lib/language';
import { isConfigured } from '@/lib/db';
import { openDeletionRequest } from '@/lib/store';
import { SESSION_TTL_DAYS } from '@/lib/auth';
import { REPORT_WINDOW_HOURS } from '@/lib/border';

export const dynamic = 'force-dynamic';

export default async function PrivacyPage({
  searchParams,
}: {
  searchParams: { error?: string; requested?: string };
}) {
  const user = await currentUser();
  const { tr } = await withLanguage();
  const pending = user && isConfigured() ? await openDeletionRequest(user.id) : null;

  return (
    <div className="space-y-6">
      <PageTitle
        title="Terms and privacy"
        subtitle="What BorderBridge does with what you tell it, and what it will not do."
      />

      {searchParams.requested && (
        <Notice kind="ok">
          Your deletion request has been recorded. An administrator will act on it and you will be
          told what was done.
        </Notice>
      )}
      {searchParams.error && <Notice kind="error">{searchParams.error}</Notice>}

      {/* NFR-LEG-02 */}
      <section className="rounded-md border-l-4 border-gold-bright bg-gold-pale p-4">
        <h2 className="text-base font-semibold text-gold">What this is not</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-800">
          BorderBridge is not a licensed customs clearing agent, and nothing it tells you is a
          decision by a customs authority. It reads published trade rules and works out what they
          mean for your consignment. The authority at the border decides, and may decide
          differently. Every cost estimate carries this statement, and you cannot dismiss it.
        </p>
      </section>

      {/* NFR-PRI-01 */}
      <section>
        <h2 className="text-base font-semibold text-ink">What we collect, and why</h2>
        <div className="mt-3 overflow-hidden rounded-md border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <tbody>
              <Row what="Your phone number" why="It is how you sign in, and how we confirm the account is yours. We do not sell it, share it, or use it for marketing." />
              <Row what="Your name" why="So the people you trade with know who they are dealing with." />
              <Row what="Business name, usual route, products" why="Optional. They pre-fill your plans so you answer fewer questions." />
              <Row what="Your consignments and shipments" why="So you can track them, and so we can measure how close our cost estimates were." />
              <Row what="Border reports you file" why="Other traders rely on them. They fade after twelve hours." />
              <Row what="Marketplace and transport listings" why="They are meant to be seen — that is what publishing one is for." />
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-600">
          We do not ask for your national identity number or passport number. The checklist tells
          you that you need them at the border; it does not need them itself.
        </p>
      </section>

      {/* NFR-PRI-04 */}
      <section>
        <h2 className="text-base font-semibold text-ink">Your phone number is not published</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">
          A marketplace listing shows your business name, or your first name and an initial. A
          transport offering shows the same. Your number reaches another person only when you
          accept their enquiry or request — never because you listed something. This is enforced in
          the database query, not left to each page to remember.
        </p>
      </section>

      {/* NFR-SEC-02, NFR-SEC-08 */}
      <section>
        <h2 className="text-base font-semibold text-ink">How it is kept</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
          <li>• Everything travels over an encrypted connection. Plain HTTP is refused.</li>
          <li>• Your password is stored as a salted scrypt hash. Nobody, including us, can read it back.</li>
          <li>• A session ends after {SESSION_TTL_DAYS} days without use, and changing your password ends every session everywhere.</li>
          <li>• Border reports stop counting after {REPORT_WINDOW_HOURS} hours, whoever filed them.</li>
        </ul>
      </section>

      {/* NFR-PRI-03 */}
      <section className="border-t border-gray-200 pt-5">
        <h2 className="text-base font-semibold text-ink">Your rights over your data</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">
          Under Rwanda&rsquo;s Law No. 058/2021 you may see what is held about you, and ask for it
          to be erased. Both are buttons here rather than a letter you have to write.
        </p>

        {!user ? (
          <p className="mt-3 text-sm text-gray-700">
            <Link href="/login?next=/privacy" className="tappable font-medium text-brand underline">
              Sign in
            </Link>{' '}
            to use them.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            <Link
              href="/privacy/export"
              className="tappable flex items-center justify-center rounded-md border border-brand bg-white px-4 py-3 text-base font-semibold text-brand"
            >
              See everything held about me
            </Link>

            {pending ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-gray-800">
                    You asked for your data to be deleted on{' '}
                    {new Date(pending.createdAt).toLocaleDateString('en-GB')}. An administrator is
                    handling it.
                  </p>
                  <StatusPill label="Open" tone="amber" />
                </div>
              </div>
            ) : (
              <form action={requestDeletionAction} className="space-y-2">
                <label htmlFor="reason" className="block text-sm font-medium text-ink">
                  Ask for your data to be deleted
                </label>
                <input
                  id="reason" name="reason"
                  placeholder="Why, if you want to say (optional)"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base"
                />
                <button
                  type="submit"
                  className="w-full rounded-md border border-gray-300 bg-white px-4 py-3 text-base font-medium text-ink"
                >
                  Request deletion
                </button>
              </form>
            )}

            <p className="text-xs leading-relaxed text-gray-600">
              Some things cannot simply be erased, and we would rather say so than pretend. A border
              report other traders acted on, and an audit record of who changed a regulatory rule,
              are records of events rather than facts about you. Where that applies, your account
              and contact details go and the record is anonymised. An administrator will tell you
              exactly what was done.
            </p>
          </div>
        )}
      </section>

      {/* NFR-LEG-04 */}
      <section className="border-t border-gray-200 pt-5">
        <h2 className="text-base font-semibold text-ink">If we have a rule wrong</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">
          Everything BorderBridge tells you cites the instrument it came from, so you can check it.
          If you check and we are wrong, tell us — that is the other half of the promise.
        </p>
        <Link
          href="/report-content"
          className="tappable mt-3 flex items-center justify-center rounded-md border border-brand bg-white px-4 py-3 text-base font-semibold text-brand"
        >
          Report incorrect regulatory content
        </Link>
      </section>

      {/* NFR-LEG-03 */}
      <section className="border-t border-gray-200 pt-5">
        <h2 className="text-base font-semibold text-ink">Where the rules come from</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">
          Regulatory content is summarised from public instruments of the East African Community and
          the revenue authorities of Rwanda and Uganda. Each is attributed where it is shown, with
          the date it was last checked. Summaries are ours; errors in them are ours, not theirs.
        </p>
      </section>

      <p className="text-xs text-gray-500">{tr('app.disclaimer')}</p>
    </div>
  );
}

function Row({ what, why }: { what: string; why: string }) {
  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="w-1/3 px-3 py-2 align-top font-medium text-ink">{what}</td>
      <td className="px-3 py-2 align-top text-gray-700">{why}</td>
    </tr>
  );
}
