/**
 * Terms of use and the privacy notice (NFR-LEG-01, NFR-LEG-02).
 *
 * "The system shall present terms of use and a privacy notice, in every supported
 * language, and shall record the user's acceptance with a timestamp and version
 * reference."
 *
 * The version is the part that is easy to skip and the part that does the work.
 * Without it, an acceptance record says only that someone once agreed to something,
 * and cannot answer the question that actually gets asked: what exactly did this
 * person agree to, and when. With it, a change to the notice is a new version, and
 * everyone is asked again.
 *
 * Language coverage is deliberately narrower than the requirement asks. English and
 * French are complete; Kiswahili and Kinyarwanda are not, for the same reason the rest
 * of the regulatory content is not — these are legal statements about a trader's
 * rights, and a machine translation of one is worse than an honest gap. The gap is
 * declared in `REVIEWED_LANGUAGES` rather than hidden, and /privacy says so.
 */
import type { Language } from './types';

/**
 * Raise this whenever the substance of /privacy changes, and everyone who accepted an
 * earlier version is asked again. Do not raise it for a typo: asking a trader to
 * re-read a notice they have already read, for no reason, teaches them to click
 * through it without reading, which is the failure mode the record exists to prevent.
 */
export const TERMS_VERSION = '1.0';

/** The date this version took effect, shown beside it so it is not just a number. */
export const TERMS_EFFECTIVE = '2026-11-15';

/** Languages in which the notice has been written by a person who reads it fluently. */
export const REVIEWED_LANGUAGES: Language[] = ['en', 'fr'];

export function isReviewed(language: Language): boolean {
  return REVIEWED_LANGUAGES.includes(language);
}

/**
 * The language the notice is actually shown in.
 *
 * A trader who reads Kinyarwanda is shown English rather than a translation nobody has
 * checked, and /privacy tells them that is what is happening.
 */
export function noticeLanguage(preferred: Language): Language {
  return isReviewed(preferred) ? preferred : 'en';
}

export type TermsAcceptance = {
  version: string;
  language: Language;
  acceptedAt: string;
};

/**
 * Whether this user must be asked again.
 *
 * Never accepted, or accepted something older, both mean yes. Comparison is on
 * equality rather than ordering: a version that is merely *different* from the current
 * one is not evidence of agreement to the current one, and ordering version strings is
 * a place to introduce a bug for no benefit.
 */
export function needsAcceptance(latest: TermsAcceptance | null | undefined): boolean {
  if (!latest) return true;
  return latest.version !== TERMS_VERSION;
}

/** How the acceptance reads back to the person who gave it. */
export function acceptanceSummary(latest: TermsAcceptance | null | undefined): string {
  if (!latest) return 'You have not yet accepted the terms.';
  const when = new Date(latest.acceptedAt);
  const date = Number.isNaN(when.getTime())
    ? 'an unrecorded date'
    : when.toISOString().slice(0, 10);
  const current = latest.version === TERMS_VERSION ? '' : ' An updated version is now in force.';
  return `You accepted version ${latest.version} on ${date}.${current}`;
}
