/**
 * FR-ACC-03 — authenticate a returning user and establish a session.
 *
 * Rate limiting and progressive delay are enforced server-side in store.ts; this page
 * only reports the outcome. The error message never distinguishes "no such number"
 * from "wrong password", so the form cannot be used to discover who is registered.
 */
import Link from 'next/link';
import { loginAction } from '../actions';
import { Field, Submit, Notice, PageTitle, DatabaseMissing } from '../ui';
import { isConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string; phone?: string; reset?: string };
}) {
  const next = searchParams.next ?? '/';

  return (
    <div className="space-y-5">
      <PageTitle title="Sign in" subtitle="Use the phone number you registered with." />

      {!isConfigured() && <DatabaseMissing />}
      {searchParams.reset && (
        <Notice kind="ok">Your password has been changed. Sign in with the new one.</Notice>
      )}
      {searchParams.next && searchParams.next !== '/' && !searchParams.error && (
        <Notice kind="info">Sign in to continue to that page.</Notice>
      )}
      {searchParams.error && <Notice kind="error">{searchParams.error}</Notice>}

      <form action={loginAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <Field
          label="Phone number" name="phone" type="tel" required
          defaultValue={searchParams.phone} autoComplete="tel" inputMode="tel"
        />
        <Field label="Password" name="password" type="password" required autoComplete="current-password" />
        <Submit>Sign in</Submit>
      </form>

      <div className="flex flex-col gap-2 text-sm text-gray-600">
        <Link href="/recover" className="tappable font-medium text-brand underline">
          I have forgotten my password
        </Link>
        <span>
          No account yet?{' '}
          <Link href="/register" className="tappable font-medium text-brand underline">Create one</Link>
        </span>
      </div>
    </div>
  );
}
