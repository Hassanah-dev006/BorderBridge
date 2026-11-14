/**
 * Resolving the language for a request (FR-LOC-01).
 *
 * Kept apart from i18n.ts because this touches next/headers, which makes it
 * server-only; i18n.ts stays pure so the dictionary and the fallback rule can be
 * unit tested under plain Node.
 *
 * Order of precedence: the signed-in user's stored choice, then the cookie set
 * before they had an account, then English. The cookie is what makes the choice
 * persist across sessions for someone who has not registered — FR-LOC-01 says
 * across sessions, not across accounts.
 */
import { cookies } from 'next/headers';
import { LANGUAGE_COOKIE, isLanguage, translator } from './i18n';
import { currentUser } from './session';
import type { Language } from './types';

export async function currentLanguage(): Promise<Language> {
  const user = await currentUser();
  if (user && isLanguage(user.preferredLanguage)) return user.preferredLanguage;

  const cookie = cookies().get(LANGUAGE_COOKIE)?.value;
  if (isLanguage(cookie)) return cookie;

  return 'en';
}

/** The language plus a translator bound to it — what a page usually wants. */
export async function withLanguage(): Promise<{ lang: Language; tr: ReturnType<typeof translator> }> {
  const lang = await currentLanguage();
  return { lang, tr: translator(lang) };
}

export function setLanguageCookie(lang: Language): void {
  cookies().set(LANGUAGE_COOKIE, lang, {
    httpOnly: false,       // harmless, and lets the choice survive a static response
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 365 * 86_400,  // a year: "across sessions" means not asking again
  });
}
