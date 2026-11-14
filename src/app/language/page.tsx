/**
 * FR-LOC-01 — choose a language, and keep that choice across sessions.
 *
 * The page reports its own coverage rather than presenting four equal flags. A
 * trader who picks Kinyarwanda and then sees English headings should have been told
 * in advance, not left wondering whether the application is broken.
 */
import Link from 'next/link';
import { setLanguageAction } from '../actions';
import { Notice, PageTitle, StatusPill } from '../ui';
import { currentUser } from '@/lib/session';
import { withLanguage } from '@/lib/language';
import { LANGUAGES, coverage, needsReview } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export default async function LanguagePage({
  searchParams,
}: {
  searchParams: { saved?: string };
}) {
  const { lang, tr } = await withLanguage();
  const user = await currentUser();

  return (
    <div className="space-y-6">
      <PageTitle title={tr('lang.title')} subtitle={tr('lang.choose')} />

      {searchParams.saved && <Notice kind="ok">{tr('lang.saved')}</Notice>}

      <section>
        <ul className="space-y-2">
          {LANGUAGES.map((l) => {
            const c = coverage(l.code);
            const selected = l.code === lang;
            const review = needsReview.includes(l.code);
            return (
              <li key={l.code}>
                <form action={setLanguageAction}>
                  <input type="hidden" name="lang" value={l.code} />
                  <button
                    type="submit"
                    className={`tappable flex w-full items-center justify-between gap-3 rounded-md border p-4 text-left ${
                      selected ? 'border-brand bg-brand-pale' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-base font-medium text-ink">{l.endonym}</span>
                      <span className="block text-sm text-gray-600">
                        {l.name} · {c.percent}% of the interface
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1.5">
                      {selected && <StatusPill label="Selected" tone="brand" />}
                      {review && <StatusPill label="Needs review" tone="amber" />}
                    </span>
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>

      <Notice kind="info">{tr('lang.fallbackNote')}</Notice>

      <section className="border-t border-gray-200 pt-5">
        <h2 className="text-base font-semibold text-ink">Why two languages are incomplete</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">
          The machinery is finished — every string is a key, a missing translation falls back to
          English, and the figures above are measured rather than claimed. What is unfinished is
          the regulatory vocabulary in Kiswahili and Kinyarwanda.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">
          That gap is deliberate. A mistranslated document name could send a trader to a border
          with the wrong paper, which is worse than English they can ask someone about. Those
          terms stay in English until a fluent speaker has reviewed them.
        </p>
      </section>

      {user && (
        <p className="text-sm text-gray-600">
          Your choice is saved to your profile, so it follows you to any device.{' '}
          <Link href="/profile" className="tappable font-medium text-brand underline">
            Profile
          </Link>
        </p>
      )}
      {!user && (
        <p className="text-sm text-gray-600">
          Your choice is kept on this device for a year.{' '}
          <Link href="/register" className="tappable font-medium text-brand underline">
            Create an account
          </Link>{' '}
          to carry it to your other devices.
        </p>
      )}
    </div>
  );
}
