/**
 * FR-NOT-01 — subscribe to corridors, crossings and product categories.
 * FR-NOT-02 — be told when a regulation, duty rate or document requirement changes.
 *
 * The rule check runs when this page is opened rather than on a schedule, because
 * the knowledge base is a file a non-developer edits and there is no background
 * service in this prototype. The page says so, rather than implying one exists.
 */
import Link from 'next/link';
import { addSubscriptionAction, removeSubscriptionAction, markAllReadAction } from '../actions';
import { Select, Submit, Notice, PageTitle, StatusPill, DatabaseMissing } from '../ui';
import { requireUser } from '@/lib/session';
import { isConfigured } from '@/lib/db';
import { listNotifications, listSubscriptions } from '@/lib/store';
import { syncRuleChangesQuietly } from '@/lib/rulewatch';
import { describeSubscription } from '@/lib/notify';
import { listSupportedCorridors } from '@/lib/repository';
import { listCrossings } from '@/lib/border';
import { PRODUCT_CLASSES } from '@/lib/transport';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = {
  'rule-change': 'Rules',
  border: 'Border',
  transport: 'Transport',
  market: 'Marketplace',
  shipment: 'Shipment',
};

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: { error?: string; subscribed?: string };
}) {
  const user = await requireUser('/notifications');
  if (!isConfigured()) {
    return (
      <div className="space-y-4">
        <PageTitle title="Notifications" />
        <DatabaseMissing />
      </div>
    );
  }

  // FR-NOT-02 — compare the knowledge base against the watermark before reading.
  await syncRuleChangesQuietly();

  const [items, subs] = await Promise.all([
    listNotifications(user.id),
    listSubscriptions(user.id),
  ]);

  const corridors = listSupportedCorridors();
  const crossings = corridors.flatMap((c) => listCrossings(c.id));
  const corridorName = (id: string | null) =>
    id ? corridors.find((c) => c.id === id)?.originName + ' → ' + corridors.find((c) => c.id === id)?.destinationName : undefined;
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <div className="space-y-6">
      <PageTitle
        title="Notifications"
        subtitle="What has changed on the routes, crossings and goods you follow."
      />

      {searchParams.subscribed && <Notice kind="ok">Subscription added.</Notice>}
      {searchParams.error && <Notice kind="error">{searchParams.error}</Notice>}

      <section>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">
            Recent {unread > 0 && <span className="font-normal text-brand">({unread} unread)</span>}
          </h2>
          {unread > 0 && (
            <form action={markAllReadAction}>
              <button type="submit" style={{ minHeight: 44 }} className="text-sm font-medium text-brand underline">
                Mark all read
              </button>
            </form>
          )}
        </div>

        {items.length === 0 ? (
          <div className="mt-3 rounded-md border border-dashed border-gray-300 bg-white p-6 text-center">
            <p className="text-sm text-gray-700">Nothing yet.</p>
            <p className="mt-2 text-xs text-gray-500">
              Subscribe below. We will tell you when the rules on that route change. We will also
              tell you when another trader reports a long wait at a crossing you follow.
            </p>
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {items.map((n) => (
              <li
                key={n.id}
                className={`rounded-md border p-3 ${
                  n.readAt ? 'border-gray-200 bg-white' : 'border-brand bg-brand-pale'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{n.title}</p>
                    {n.body && <p className="mt-1 text-sm text-gray-700">{n.body}</p>}
                    <p className="mt-1 text-xs text-gray-500">
                      {new Date(n.createdAt).toLocaleString('en-GB')}
                    </p>
                  </div>
                  <StatusPill label={KIND_LABEL[n.kind] ?? n.kind} tone="grey" />
                </div>
                {n.link && (
                  <Link href={n.link} className="tappable mt-2 inline-block text-sm font-medium text-brand underline">
                    Open
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* FR-NOT-01 */}
      <section className="border-t border-gray-200 pt-5">
        <h2 className="text-base font-semibold text-ink">What you follow</h2>

        {subs.length === 0 ? (
          <p className="mt-2 text-sm text-gray-700">You are not following anything yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {subs.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white p-3">
                <p className="text-sm text-ink">{describeSubscription(s, corridorName(s.corridorId))}</p>
                <form action={removeSubscriptionAction} className="shrink-0">
                  <input type="hidden" name="subscriptionId" value={s.id} />
                  <button
                    type="submit" style={{ minHeight: 44 }}
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-ink"
                  >
                    Stop
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <form action={addSubscriptionAction} className="mt-4 space-y-4">
          <Select
            label="Route" name="corridorId" defaultValue=""
            options={[
              { value: '', label: 'Any route' },
              ...corridors.map((c) => ({ value: c.id, label: `${c.originName} → ${c.destinationName}` })),
            ]}
          />
          <Select
            label="Crossing" name="crossingId" defaultValue=""
            options={[
              { value: '', label: 'Any crossing' },
              ...crossings.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <Select
            label="Goods" name="productCategory" defaultValue=""
            options={[
              { value: '', label: 'Any goods' },
              ...PRODUCT_CLASSES.map((c) => ({ value: c, label: c })),
            ]}
            hint="Leave everything as “any” to follow the whole system."
          />
          <Submit>Follow this</Submit>
        </form>

        <p className="mt-3 text-xs leading-relaxed text-gray-500">
          Alerts appear here when you open BorderBridge. This prototype has no SMS gateway and no
          background service. Nothing is pushed to your phone. The rules are compared when this
          page loads.
        </p>
      </section>
    </div>
  );
}
