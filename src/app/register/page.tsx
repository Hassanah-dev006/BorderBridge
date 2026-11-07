/**
 * FR-ACC-01 — register using a mobile phone number as the primary identifier.
 *
 * Phone rather than email is a deliberate choice recorded in the SRS: the target user
 * is a small-scale cross-border trader, and phone ownership is near-universal in the
 * EAC where email accounts are not.
 */
import Link from 'next/link';
import { registerAction } from '../actions';
import { Field, Select, Submit, Notice, PageTitle, DatabaseMissing } from '../ui';
import { isConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default function RegisterPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="space-y-5">
      <PageTitle
        title="Create your account"
        subtitle="Your phone number is your account. We send a code to confirm it is yours."
      />

      {!isConfigured() && <DatabaseMissing />}
      {searchParams.error && <Notice kind="error">{searchParams.error}</Notice>}

      <form action={registerAction} className="space-y-4">
        <Field label="Your name" name="displayName" required autoComplete="name" />

        <Field
          label="Phone number" name="phone" type="tel" required
          autoComplete="tel" inputMode="tel"
          hint="Include the country code — +250 for Rwanda, +256 for Uganda. A local number starting 07 is read as Rwandan."
        />

        <Select
          label="I am a" name="role" defaultValue="trader"
          options={[
            { value: 'trader', label: 'Trader — I move goods across the border' },
            { value: 'provider', label: 'Transport provider — I carry goods for others' },
          ]}
          hint="Transport providers are verified by an administrator before their listings appear."
        />

        <Select
          label="Language" name="language" defaultValue="en"
          options={[
            { value: 'en', label: 'English' },
            { value: 'fr', label: 'Français' },
            { value: 'sw', label: 'Kiswahili' },
            { value: 'rw', label: 'Kinyarwanda' },
          ]}
          hint="Recorded on your profile (FR-LOC-01). The pilot interface is in English."
        />

        <Field
          label="Password" name="password" type="password" required
          autoComplete="new-password" hint="At least 8 characters, and not only digits."
        />

        <Submit>Create account</Submit>
      </form>

      <p className="text-sm text-gray-600">
        Already registered?{' '}
        <Link href="/login" className="tappable font-medium text-brand underline">Sign in</Link>
      </p>
    </div>
  );
}
