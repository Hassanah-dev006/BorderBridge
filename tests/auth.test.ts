/**
 * Unit tests for the authentication primitives (FR-ACC-02, FR-ACC-03, FR-ACC-04).
 *
 * These run without a database, because auth.ts is deliberately free of I/O.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword, verifyPassword, passwordProblem, MIN_PASSWORD_LENGTH,
  normalisePhone, phoneProblem,
  generateOtp, hashOtp, otpMatches, otpExpiry, OTP_TTL_MINUTES,
  signSessionId, unsignSessionId,
  throttle, LOCKOUT_THRESHOLD,
} from '../src/lib/auth';

describe('password hashing', () => {
  test('a password verifies against its own hash', () => {
    const stored = hashPassword('correct horse battery');
    assert.equal(verifyPassword('correct horse battery', stored), true);
  });

  test('a wrong password does not verify', () => {
    const stored = hashPassword('correct horse battery');
    assert.equal(verifyPassword('correct horse batterz', stored), false);
  });

  test('the same password hashes differently each time', () => {
    // Different salts, so two users with the same password are not visibly identical.
    assert.notEqual(hashPassword('same-password'), hashPassword('same-password'));
  });

  test('the stored value never contains the password', () => {
    assert.ok(!hashPassword('hunter2-hunter2').includes('hunter2'));
  });

  test('a malformed stored value is rejected rather than throwing', () => {
    assert.equal(verifyPassword('anything', 'not-a-real-hash'), false);
    assert.equal(verifyPassword('anything', ''), false);
  });
});

describe('password rules', () => {
  test('rejects anything shorter than the stated minimum', () => {
    assert.ok(passwordProblem('a'.repeat(MIN_PASSWORD_LENGTH - 1)));
    assert.equal(passwordProblem('a'.repeat(MIN_PASSWORD_LENGTH)), null);
  });

  test('rejects an all-digit password of any length', () => {
    assert.ok(passwordProblem('12345678901234'));
  });
});

describe('phone normalisation (FR-ACC-01)', () => {
  test('a local Rwandan number gains the country code', () => {
    assert.equal(normalisePhone('0788123456'), '+250788123456');
  });

  test('a local number can be read against Uganda instead', () => {
    assert.equal(normalisePhone('0788123456', '256'), '+256788123456');
  });

  test('spaces and dashes are ignored', () => {
    assert.equal(normalisePhone('+250 788-123 456'), '+250788123456');
  });

  test('00 is treated as the international prefix', () => {
    assert.equal(normalisePhone('00250788123456'), '+250788123456');
  });

  test('an already-normalised number is unchanged', () => {
    assert.equal(normalisePhone('+256700000000'), '+256700000000');
  });

  test('something too short is reported as a problem', () => {
    assert.ok(phoneProblem('123'));
    assert.equal(phoneProblem('0788123456'), null);
  });
});

describe('one-time codes (FR-ACC-02)', () => {
  test('a code is six digits', () => {
    for (let i = 0; i < 50; i += 1) assert.match(generateOtp(), /^\d{6}$/);
  });

  test('a code verifies against its hash', () => {
    const code = generateOtp();
    assert.equal(otpMatches(code, hashOtp(code)), true);
  });

  test('a different code does not', () => {
    assert.equal(otpMatches('000000', hashOtp('123456')), false);
  });

  test('the stored hash is not the code', () => {
    assert.ok(!hashOtp('123456').includes('123456'));
  });

  test('expiry is the stated number of minutes ahead', () => {
    const now = new Date('2026-10-22T12:00:00Z');
    const mins = (otpExpiry(now).getTime() - now.getTime()) / 60_000;
    assert.equal(mins, OTP_TTL_MINUTES);
  });
});

describe('session cookie signing', () => {
  test('a signed id round-trips', () => {
    const id = 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6';
    assert.equal(unsignSessionId(signSessionId(id)), id);
  });

  test('an invented id is rejected', () => {
    assert.equal(unsignSessionId('made-up-id.fake-signature'), null);
  });

  test('a tampered id is rejected even with a valid-looking signature', () => {
    const token = signSessionId('session-one');
    const sig = token.split('.').pop()!;
    assert.equal(unsignSessionId(`session-two.${sig}`), null);
  });

  test('a missing or malformed cookie is rejected without throwing', () => {
    assert.equal(unsignSessionId(undefined), null);
    assert.equal(unsignSessionId(''), null);
    assert.equal(unsignSessionId('no-dot-here'), null);
  });
});

describe('progressive delay and lockout (FR-ACC-03)', () => {
  test('the first two failures are not delayed', () => {
    assert.equal(throttle(0, 0).allowed, true);
    assert.equal(throttle(1, 0).allowed, true);
  });

  test('the delay doubles with each further failure', () => {
    assert.equal(throttle(2, 0).waitSeconds, 5);
    assert.equal(throttle(3, 0).waitSeconds, 10);
    assert.equal(throttle(4, 0).waitSeconds, 20);
  });

  test('waiting out the delay allows the next attempt', () => {
    assert.equal(throttle(3, 0).allowed, false);
    assert.equal(throttle(3, 10).allowed, true);
  });

  test('the fifth failure locks the account for fifteen minutes', () => {
    const t = throttle(LOCKOUT_THRESHOLD, 0);
    assert.equal(t.allowed, false);
    assert.equal(t.waitSeconds, 900);
    assert.match(t.message, /recover access/i);
  });

  test('the lockout lifts once the window has passed', () => {
    assert.equal(throttle(LOCKOUT_THRESHOLD, 901).allowed, true);
  });
});
