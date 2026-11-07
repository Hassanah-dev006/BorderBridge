/**
 * FR-ACC-02 — confirm ownership of the registered phone number by one-time code
 * before the account may be used.
 *
 * The code is hashed in storage, expires after ten minutes and works once. Only its
 * delivery is stubbed: the prototype shows it on screen rather than sending an SMS,
 * and says so.
 */
import { verifyAction, resendCodeAction } from '../actions';
import { Field, Submit, Notice, PageTitle, DemoCode } from '../ui';
import { OTP_TTL_MINUTES } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default function VerifyPage({
  searchParams,
}: {
  searchParams: { error?: string; sent?: string; demo?: string };
}) {
  return (
    <div className="space-y-5">
      <PageTitle
        title="Confirm your phone number"
        subtitle={`Enter the six-digit code. It expires in ${OTP_TTL_MINUTES} minutes and can be used once.`}
      />

      {searchParams.sent && <Notice kind="ok">A new code has been issued.</Notice>}
      {searchParams.demo && <DemoCode code={searchParams.demo} />}
      {searchParams.error && <Notice kind="error">{searchParams.error}</Notice>}

      <form action={verifyAction} className="space-y-4">
        <Field
          label="Six-digit code" name="code" required
          inputMode="numeric" autoComplete="one-time-code"
        />
        <Submit>Confirm and continue</Submit>
      </form>

      <form action={resendCodeAction}>
        <Submit variant="quiet">Send me a new code</Submit>
      </form>
    </div>
  );
}
