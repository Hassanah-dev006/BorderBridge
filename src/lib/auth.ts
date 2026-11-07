/**
 * Authentication primitives — hashing, one-time codes, session tokens, throttling.
 *
 * Realises SRS FR-ACC-02 (phone verification), FR-ACC-03 (authentication with rate
 * limiting and progressive delay) and FR-ACC-04 (recovery through the verified phone).
 *
 * Everything here is pure computation over node:crypto, with no I/O, so it is unit
 * testable without a database. The storage side lives in store.ts.
 *
 * Prototype scope, stated honestly: one-time codes are delivered on screen rather than
 * by SMS, because SMS delivery needs a paid gateway. The verification logic — hashing,
 * expiry, single use — is the real thing; only the transport is stubbed.
 */
import {
  randomBytes, randomUUID, scryptSync, timingSafeEqual, createHmac,
} from 'node:crypto';
import type { ThrottleState } from './types';

// --- passwords -------------------------------------------------------------

const SCRYPT_KEYLEN = 64;

/**
 * Hash a password with a per-user random salt. Stored as `salt:hash`, never the
 * password itself — so the user table is useless to anyone who obtains a dump.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

/** Constant-time comparison, so that response timing does not leak how much matched. */
export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

/** Minimum the prototype enforces. Stated in the UI rather than silently failing. */
export const MIN_PASSWORD_LENGTH = 8;

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (/^\d+$/.test(password)) {
    return 'Choose a password that is not only digits — it would be guessed quickly.';
  }
  return null;
}

// --- phone numbers ---------------------------------------------------------

/**
 * Normalise to E.164-ish form. Rwanda (+250) and Uganda (+256) are the pilot
 * corridor, so a local 07… number is interpreted against the stated default.
 */
export function normalisePhone(raw: string, defaultCountry: '250' | '256' = '250'): string {
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.startsWith('250') || digits.startsWith('256')) return `+${digits}`;
  if (digits.startsWith('0')) return `+${defaultCountry}${digits.slice(1)}`;
  return `+${defaultCountry}${digits}`;
}

export function phoneProblem(phone: string): string | null {
  const n = normalisePhone(phone);
  if (!/^\+\d{10,15}$/.test(n)) {
    return 'Enter a phone number including the country code, for example +250 7xx xxx xxx.';
  }
  return null;
}

// --- one-time codes (FR-ACC-02, FR-ACC-04) ---------------------------------

export const OTP_TTL_MINUTES = 10;

/** Six digits, from a cryptographic source rather than Math.random. */
export function generateOtp(): string {
  return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, '0');
}

/** Codes are stored hashed, so a leaked table does not hand out working codes. */
export function hashOtp(code: string): string {
  return scryptSync(code, 'bb-otp', 32).toString('hex');
}

export function otpMatches(code: string, storedHash: string): boolean {
  const candidate = scryptSync(code, 'bb-otp', 32);
  const expected = Buffer.from(storedHash, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

export function otpExpiry(now = new Date()): Date {
  return new Date(now.getTime() + OTP_TTL_MINUTES * 60_000);
}

// --- sessions (FR-ACC-03) --------------------------------------------------

export const SESSION_TTL_DAYS = 14;
export const SESSION_COOKIE = 'bb_session';

export function newId(): string {
  return randomUUID();
}

export function sessionExpiry(now = new Date()): Date {
  return new Date(now.getTime() + SESSION_TTL_DAYS * 86_400_000);
}

function secret(): string {
  return process.env.SESSION_SECRET || 'bb-dev-secret-change-me';
}

/**
 * The cookie carries `id.signature`. The signature means a tampered or invented id is
 * rejected before it ever reaches the database.
 */
export function signSessionId(id: string): string {
  const sig = createHmac('sha256', secret()).update(id).digest('base64url');
  return `${id}.${sig}`;
}

export function unsignSessionId(token: string | undefined): string | null {
  if (!token) return null;
  const idx = token.lastIndexOf('.');
  if (idx < 1) return null;
  const id = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = createHmac('sha256', secret()).update(id).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? id : null;
}

// --- rate limiting with progressive delay (FR-ACC-03) ----------------------

export const LOCKOUT_THRESHOLD = 5;

/**
 * Progressive delay: nothing for the first two failures, then doubling — 5s, 10s,
 * 20s, 40s — and a hard stop at five, which is the requirement's wording. Derived
 * from the recorded attempts rather than held in memory, so it survives the
 * serverless cold starts that would otherwise reset it.
 */
export function throttle(recentFailures: number, secondsSinceLastFailure: number): ThrottleState {
  if (recentFailures >= LOCKOUT_THRESHOLD) {
    const waitSeconds = Math.max(0, 900 - Math.floor(secondsSinceLastFailure));
    return {
      allowed: waitSeconds === 0,
      failedAttempts: recentFailures,
      waitSeconds,
      message:
        waitSeconds === 0
          ? ''
          : `Too many failed attempts. Try again in ${Math.ceil(waitSeconds / 60)} minute(s), or recover access using your phone.`,
    };
  }

  if (recentFailures < 2) {
    return { allowed: true, failedAttempts: recentFailures, waitSeconds: 0, message: '' };
  }

  const required = 5 * 2 ** (recentFailures - 2);
  const waitSeconds = Math.max(0, required - Math.floor(secondsSinceLastFailure));
  return {
    allowed: waitSeconds === 0,
    failedAttempts: recentFailures,
    waitSeconds,
    message: waitSeconds === 0 ? '' : `Please wait ${waitSeconds} second(s) before trying again.`,
  };
}
