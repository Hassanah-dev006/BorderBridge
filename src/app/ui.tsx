/**
 * Small presentational pieces shared across pages.
 *
 * Every control here meets the 44 CSS px touch target required by SRS NFR-USA-04,
 * and labels are always present rather than relying on placeholder text, which
 * disappears the moment a user starts typing.
 */
import Link from 'next/link';

export function Field({
  label, name, type = 'text', defaultValue, required, hint, autoComplete, inputMode, min, max, step,
}: {
  label: string; name: string; type?: string; defaultValue?: string | number;
  required?: boolean; hint?: string; autoComplete?: string;
  inputMode?: 'text' | 'numeric' | 'tel'; min?: number; max?: number; step?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-ink">
        {label}
        {!required && <span className="ml-1 font-normal text-gray-500">(optional)</span>}
      </label>
      <input
        id={name} name={name} type={type} defaultValue={defaultValue} required={required}
        autoComplete={autoComplete} inputMode={inputMode} min={min} max={max} step={step}
        className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base"
      />
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

export function Select({
  label, name, defaultValue, options, hint,
}: {
  label: string; name: string; defaultValue?: string;
  options: { value: string; label: string }[]; hint?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-ink">{label}</label>
      <select
        id={name} name={name} defaultValue={defaultValue}
        className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

export function Submit({ children, variant = 'primary' }: { children: React.ReactNode; variant?: 'primary' | 'quiet' }) {
  const cls = variant === 'primary'
    ? 'w-full rounded-md bg-brand px-4 py-3 text-base font-semibold text-white hover:bg-[#17395A]'
    : 'w-full rounded-md border border-gray-300 bg-white px-4 py-3 text-base font-medium text-ink hover:bg-gray-50';
  return <button type="submit" className={cls}>{children}</button>;
}

export function Notice({ kind, children }: { kind: 'error' | 'ok' | 'info'; children: React.ReactNode }) {
  const styles = {
    error: 'border-red-400 bg-red-50 text-red-900',
    ok: 'border-green-400 bg-green-50 text-green-900',
    info: 'border-brand bg-brand-pale text-gray-800',
  }[kind];
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-md border-l-4 p-3 text-sm ${styles}`}>
      {children}
    </div>
  );
}

/**
 * Shown when a one-time code is issued. The prototype has no SMS gateway, so the code
 * appears here. Saying so plainly is better than implying a message was sent.
 */
export function DemoCode({ code }: { code: string }) {
  return (
    <div className="rounded-md border border-dashed border-brand bg-brand-pale p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-brand">Your one-time code</p>
      <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-ink">{code}</p>
      <p className="mt-1 text-xs text-gray-600">
        Shown on screen because this prototype has no SMS gateway. In production this
        arrives by text message and is never displayed.
      </p>
    </div>
  );
}

export function PageTitle({ title, subtitle, back }: { title: string; subtitle?: string; back?: { href: string; label: string } }) {
  return (
    <div>
      {back && (
        <Link href={back.href} className="tappable inline-flex items-center text-sm text-brand">
          ← {back.label}
        </Link>
      )}
      <h1 className="mt-2 text-xl font-semibold text-ink">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-gray-600">{subtitle}</p>}
    </div>
  );
}

export function StatusPill({ label, tone }: { label: string; tone: 'green' | 'amber' | 'grey' | 'brand' }) {
  const styles = {
    green: 'bg-green-100 text-green-900',
    amber: 'bg-amber-100 text-amber-900',
    grey: 'bg-gray-100 text-gray-700',
    brand: 'bg-brand-light text-brand',
  }[tone];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${styles}`}>{label}</span>;
}

/** Shown instead of a stack trace when DATABASE_URL has not been set. */
export function DatabaseMissing() {
  return (
    <Notice kind="error">
      <strong className="font-semibold">The database is not configured.</strong>
      <p className="mt-1">
        Copy <code className="rounded bg-white px-1">.env.example</code> to{' '}
        <code className="rounded bg-white px-1">.env.local</code>, paste your Postgres
        connection string into it, then run <code className="rounded bg-white px-1">npm run db:migrate</code>.
        The README section &ldquo;Set up the database&rdquo; has the full steps.
      </p>
    </Notice>
  );
}
