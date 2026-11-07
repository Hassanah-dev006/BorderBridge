/**
 * Session helpers for server components and server actions.
 *
 * Kept separate from auth.ts because this module touches next/headers, which makes it
 * server-only; auth.ts stays pure so that it can be unit tested under plain Node.
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, signSessionId, unsignSessionId, SESSION_TTL_DAYS } from './auth';
import { getSessionUser, createSession, destroySession } from './store';
import type { User } from './types';

/** The signed-in user, or null. Never throws, so layouts can call it unconditionally. */
export async function currentUser(): Promise<User | null> {
  if (!process.env.DATABASE_URL) return null;
  const token = cookies().get(SESSION_COOKIE)?.value;
  const id = unsignSessionId(token);
  if (!id) return null;
  try {
    return await getSessionUser(id);
  } catch {
    return null;
  }
}

/**
 * For pages that require a signed-in user. Redirects to /login carrying the intended
 * destination, so the user lands where they were going rather than on the home page.
 */
export async function requireUser(returnTo: string): Promise<User> {
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return user;
}

export async function startSession(userId: string): Promise<void> {
  const session = await createSession(userId);
  cookies().set(SESSION_COOKIE, signSessionId(session.id), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_DAYS * 86_400,
  });
}

export async function endSession(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const id = unsignSessionId(token);
  if (id) {
    try {
      await destroySession(id);
    } catch {
      /* already gone */
    }
  }
  cookies().delete(SESSION_COOKIE);
}

/**
 * The pending-verification user id, held in a short-lived cookie between registering
 * and confirming the code. Not a session: it grants nothing except the ability to
 * finish verifying that one account.
 */
const PENDING_COOKIE = 'bb_pending';

export function setPendingUser(userId: string): void {
  cookies().set(PENDING_COOKIE, signSessionId(userId), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: 1800,
  });
}

export function getPendingUser(): string | null {
  return unsignSessionId(cookies().get(PENDING_COOKIE)?.value);
}

export function clearPendingUser(): void {
  cookies().delete(PENDING_COOKIE);
}
