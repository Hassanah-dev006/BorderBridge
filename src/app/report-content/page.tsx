/**
 * NFR-LEG-04 — a documented channel through which a user may report regulatory
 * content they believe to be inaccurate.
 *
 * This is the complement to every citation on the site. Telling a trader which
 * instrument requires a certificate is only useful if, when they check it and find
 * us wrong, they can say so and something happens.
 *
 * Open to signed-out users on purpose: a customs officer or an agency official who
 * spots an error should not have to register an account to correct it.
 */
import Link from 'next/link';
import { reportContentAction } from '../actions';
import { Field, Select, Submit, Notice, PageTitle, DatabaseMissing } from '../ui';
import { currentUser } from '@/lib/session';
import { isConfigured } from '@/lib/db';
import { listSupportedCorridors, getRulesForCorridor } from '@/lib/repository';

export const dynamic = 'force-dynamic';

export default async function ReportContentPage({
  searchParams,
}: {
  searchParams: { error?: string; thanks?: string; rule?: string };
}) {
  const user = await currentUser();
  const corridors = listSupportedCorridors();
  const rules = corridors.flatMap((c) => getRulesForCorridor(c.id));

  return (
    <div className="space-y-6">
      <PageTitle
        title="Report incorrect content"
        subtitle="If a rule here is wrong, out of date, or missing, tell us."
        back={{ href: '/privacy', label: 'Terms and privacy' }}
      />

      {searchParams.thanks && (
        <Notice kind="ok">
          <strong className="font-semibold">Thank you.</strong> An administrator will check it
          against the instrument you cited. If you are right, the rule is amended and everyone
          following that corridor is told.
        </Notice>
      )}
      {searchParams.error && <Notice kind="error">{searchParams.error}</Notice>}

      {!isConfigured() && <DatabaseMissing />}

      <Notice kind="info">
        Every figure and requirement on this site names the instrument it came from and the date it
        was last checked. That is so you can check it. This is where you tell us what you found.
      </Notice>

      <form action={reportContentAction} className="space-y-4">
        <Select
          label="Which corridor" name="corridorId" defaultValue={corridors[0]?.id}
          options={corridors.map((c) => ({ value: c.id, label: `${c.originName} → ${c.destinationName}` }))}
        />

        <Select
          label="Which rule" name="ruleId" defaultValue={searchParams.rule ?? ''}
          options={[
            { value: '', label: 'Not sure, or something missing entirely' },
            ...rules.map((r) => ({ value: r.id, label: `${r.name} (${r.id})` })),
          ]}
          hint="Each rule identifier appears beside the citation wherever that rule is shown."
        />

        <Field
          label="What is wrong" name="whatIsWrong" required
          hint="For example: the rate changed in the 2026 Finance Act, or this certificate is no longer required."
        />

        <Field
          label="Where it says otherwise" name="source"
          hint="The instrument, notice or page that shows the correct position. This is what makes a report actionable rather than a complaint."
        />

        <Submit>Send report</Submit>
      </form>

      <p className="text-xs leading-relaxed text-gray-500">
        {user
          ? 'Your report is linked to your account so we can tell you the outcome.'
          : 'You can report without an account. Sign in first if you would like to be told the outcome.'}{' '}
        Reports are reviewed by an administrator, and an accepted one becomes a versioned amendment
        with its own audit entry.{' '}
        <Link href="/privacy" className="font-medium text-brand underline">
          How we handle your data
        </Link>
      </p>
    </div>
  );
}
