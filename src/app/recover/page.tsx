/**
 * FR-ACC-04 — recover access through the verified phone number.
 *
 * Two steps on one page: request a code, then set a new password with it. Requesting
 * a code for an unregistered number reports the same thing as for a registered one,
 * so the form cannot be used to find out who holds an account.
 */
import Link from 'next/link';
import { requestRecoveryAction, completeRecoveryAction } from '../actions';
import { Field, Submit, Notice, PageTitle, DemoCode } from '../ui';

export const dynamic = 'force-dynamic';

export default function RecoverPage({
  searchParams,
}: {
  searchParams: { error?: string; sent?: string; demo?: string; unknown?: string };
}) {
  const sent = Boolean(searchParams.sent);

  return (
    <div className="space-y-5">
      <PageTitle
        title="Recover access"
        subtitle="We send a code to your registered phone number, then you choose a new password."
        back={{ href: '/login', label: 'Back to sign in' }}
      />

      {searchParams.error && <Notice kind="error">{searchParams.error}</Notice>}

      {!sent ? (
        <form action={requestRecoveryAction} className="space-y-4">
          <Field label="Phone number" name="phone" type="tel" required autoComplete="tel" inputMode="tel" />
          <Submit>Send me a code</Submit>
        </form>
      ) : (
        <div className="space-y-5">
          <Notice kind="ok">
            If that number has an account, a code has been issued. It expires in ten minutes.
          </Notice>

          {searchParams.demo && <DemoCode code={searchParams.demo} />}

          {searchParams.unknown ? (
            <p className="text-sm text-gray-600">
              Check the number and{' '}
              <Link href="/recover" className="tappable font-medium text-brand underline">try again</Link>, or{' '}
              <Link href="/register" className="tappable font-medium text-brand underline">create an account</Link>.
            </p>
          ) : (
            <form action={completeRecoveryAction} className="space-y-4">
              <Field label="Six-digit code" name="code" required inputMode="numeric" autoComplete="one-time-code" />
              <Field
                label="New password" name="password" type="password" required
                autoComplete="new-password" hint="At least 8 characters, and not only digits."
              />
              <Submit>Set new password</Submit>
              <p className="text-xs text-gray-500">
                Changing your password signs you out on every device.
              </p>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
