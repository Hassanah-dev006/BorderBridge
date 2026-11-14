/**
 * FR-MKT-03 — the two sides of an enquiry, and the moment contact details are
 * released.
 *
 * `counterpartyPhone` is computed in the store, not here: it is null unless the
 * enquiry was accepted and the viewer is one of the two parties. A page cannot
 * forget the rule because a page never applies it.
 */
import Link from 'next/link';
import { respondToEnquiryAction } from '../../actions';
import { Notice, PageTitle, StatusPill } from '../../ui';
import { requireUser } from '@/lib/session';
import { listEnquiriesFor } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: { error?: string; accepted?: string; declined?: string };
}) {
  const user = await requireUser('/market/enquiries');
  const all = await listEnquiriesFor(user.id);

  const received = all.filter((e) => e.toUserId === user.id);
  const sent = all.filter((e) => e.fromUserId === user.id);
  const waiting = received.filter((e) => e.status === 'sent');

  return (
    <div className="space-y-6">
      <PageTitle
        title="Enquiries"
        subtitle="Messages about your listings, and listings you have contacted."
        back={{ href: '/market', label: 'Back to marketplace' }}
      />

      {searchParams.accepted && (
        <Notice kind="ok">
          <strong className="font-semibold">Accepted.</strong> Contact details have been exchanged —
          you can both see each other&rsquo;s number below.
        </Notice>
      )}
      {searchParams.declined && <Notice kind="ok">Declined. They have been told.</Notice>}
      {searchParams.error && <Notice kind="error">{searchParams.error}</Notice>}

      <section>
        <h2 className="text-base font-semibold text-ink">
          Waiting for you <span className="font-normal text-gray-500">({waiting.length})</span>
        </h2>

        {waiting.length === 0 ? (
          <p className="mt-3 text-sm text-gray-700">Nothing waiting.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {waiting.map((e) => (
              <li key={e.id} className="rounded-md border border-brand bg-brand-pale p-4">
                <p className="font-medium text-ink">
                  {e.listingKind === 'buying' ? 'Your wanted listing: ' : 'Your listing: '}
                  {e.productName}
                </p>
                <p className="text-sm text-gray-700">From {e.fromName}</p>

                {e.message && (
                  <p className="mt-3 rounded-md border-l-2 border-gray-300 bg-white px-3 py-2 text-sm text-gray-700">
                    {e.message}
                  </p>
                )}

                <p className="mt-2 text-xs text-gray-500">
                  Asked {new Date(e.createdAt).toLocaleString('en-GB')}
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <form action={respondToEnquiryAction}>
                    <input type="hidden" name="enquiryId" value={e.id} />
                    <input type="hidden" name="status" value="accepted" />
                    <button
                      type="submit"
                      className="w-full rounded-md bg-brand px-4 py-3 text-base font-semibold text-white hover:bg-[#17395A]"
                    >
                      Accept
                    </button>
                  </form>
                  <form action={respondToEnquiryAction}>
                    <input type="hidden" name="enquiryId" value={e.id} />
                    <input type="hidden" name="status" value="declined" />
                    <button
                      type="submit"
                      className="w-full rounded-md border border-gray-300 bg-white px-4 py-3 text-base font-medium text-ink"
                    >
                      Decline
                    </button>
                  </form>
                </div>

                <p className="mt-2 text-xs text-gray-600">
                  Accepting shares your phone number with this trader, and theirs with you.
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Thread title="Answered" rows={received.filter((e) => e.status !== 'sent')} viewer="owner" />
      <Thread title="You contacted" rows={sent} viewer="sender" />

      {all.length === 0 && (
        <div className="rounded-md border border-dashed border-gray-300 bg-white p-6 text-center">
          <p className="text-sm text-gray-700">No enquiries yet.</p>
          <Link
            href="/market"
            className="tappable mt-4 inline-flex items-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            Browse the marketplace
          </Link>
        </div>
      )}
    </div>
  );
}

function Thread({
  title, rows, viewer,
}: {
  title: string;
  rows: Awaited<ReturnType<typeof listEnquiriesFor>>;
  viewer: 'owner' | 'sender';
}) {
  if (rows.length === 0) return null;

  return (
    <section className="border-t border-gray-200 pt-5">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <ul className="mt-3 space-y-2">
        {rows.map((e) => (
          <li key={e.id} className="rounded-md border border-gray-200 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-ink">{e.productName}</p>
                <p className="text-sm text-gray-600">
                  {viewer === 'owner' ? `From ${e.fromName}` : `To ${e.toName}`}
                </p>
                {e.counterpartyPhone && (
                  <p className="mt-1 text-sm text-gray-700">
                    Contact:{' '}
                    <a href={`tel:${e.counterpartyPhone}`} className="tappable font-medium text-brand underline">
                      {e.counterpartyPhone}
                    </a>
                  </p>
                )}
              </div>
              <StatusPill
                label={e.status === 'accepted' ? 'Accepted' : e.status === 'declined' ? 'Declined' : 'Waiting'}
                tone={e.status === 'accepted' ? 'green' : e.status === 'declined' ? 'grey' : 'brand'}
              />
            </div>
            {e.status === 'sent' && viewer === 'sender' && (
              <p className="mt-1 text-xs text-gray-500">
                They have not answered yet. Your number stays private until they do.
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
