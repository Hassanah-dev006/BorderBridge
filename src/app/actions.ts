'use server';

/**
 * Server actions — every write the interface can perform.
 *
 * These are deliberately plain form actions rather than client-side fetch calls. The
 * pages work with JavaScript disabled and on a slow connection, which is what
 * SRS NFR-PRF-01 and NFR-USA-02 ask for: the target user is on an entry-level phone
 * over a 3G link, not a laptop.
 *
 * Errors are reported by redirecting back with a message, so no page needs client
 * state to display a validation failure.
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  registerUser, authenticate, issueOtp, consumeOtp, findUserByPhone, findUserById,
  updateProfile, resetPassword, setAdminVerified, createShipment, recordMilestone,
  setChecklistItem, getShipment, submitReport, recentReports, listObtained,
} from '@/lib/store';
import { PhoneAlreadyRegisteredError } from '@/lib/store';
import { passwordProblem, phoneProblem, normalisePhone } from '@/lib/auth';
import {
  startSession, endSession, requireUser, currentUser,
  setPendingUser, getPendingUser, clearPendingUser,
} from '@/lib/session';
import { buildTradePlan } from '@/lib/engines';
import { readiness, allowedNextStatuses } from '@/lib/shipments';
import type { BorderReport, Language, ShipmentStatus, UserRole } from '@/lib/types';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

function back(path: string, error: string, extra: Record<string, string> = {}): never {
  const q = new URLSearchParams({ error, ...extra });
  redirect(`${path}?${q.toString()}`);
}

// --- FR-ACC-01 / FR-ACC-02: registration and phone verification ------------

export async function registerAction(formData: FormData): Promise<void> {
  const phone = str(formData, 'phone');
  const displayName = str(formData, 'displayName');
  const password = str(formData, 'password');
  const role = (str(formData, 'role') || 'trader') as UserRole;
  const language = (str(formData, 'language') || 'en') as Language;

  if (displayName.length < 2) back('/register', 'Enter your name.');

  const phoneIssue = phoneProblem(phone);
  if (phoneIssue) back('/register', phoneIssue);

  const passwordIssue = passwordProblem(password);
  if (passwordIssue) back('/register', passwordIssue);

  let userId: string;
  try {
    const user = await registerUser({ phone, displayName, password, role, language });
    userId = user.id;
  } catch (e) {
    if (e instanceof PhoneAlreadyRegisteredError) {
      back('/register', 'That phone number already has an account. Sign in instead.');
    }
    throw e;
  }

  const code = await issueOtp(userId, 'verify-phone');
  setPendingUser(userId);
  // The code is shown on the next screen because this prototype has no SMS gateway.
  redirect(`/verify?sent=1&demo=${code}`);
}

export async function resendCodeAction(): Promise<void> {
  const userId = getPendingUser();
  if (!userId) redirect('/register');
  const code = await issueOtp(userId, 'verify-phone');
  redirect(`/verify?sent=1&demo=${code}`);
}

export async function verifyAction(formData: FormData): Promise<void> {
  const userId = getPendingUser();
  if (!userId) redirect('/register');

  const result = await consumeOtp(userId, 'verify-phone', str(formData, 'code'));
  if (result === 'wrong-code') back('/verify', 'That code is not correct. Check and try again.');
  if (result === 'expired') back('/verify', 'That code has expired. Ask for a new one.');
  if (result === 'none-outstanding') back('/verify', 'No code is outstanding. Ask for a new one.');

  clearPendingUser();
  await startSession(userId);
  redirect('/profile?welcome=1');
}

// --- FR-ACC-03: authentication ---------------------------------------------

export async function loginAction(formData: FormData): Promise<void> {
  const phone = str(formData, 'phone');
  const password = str(formData, 'password');
  const next = str(formData, 'next') || '/';

  if (!phone || !password) back('/login', 'Enter your phone number and password.', { next });

  const result = await authenticate(phone, password);

  if (!result.ok && result.reason === 'unverified') {
    const user = await findUserByPhone(phone);
    if (user) {
      const code = await issueOtp(user.id, 'verify-phone');
      setPendingUser(user.id);
      redirect(`/verify?sent=1&demo=${code}`);
    }
  }
  if (!result.ok) back('/login', result.message, { next, phone });

  await startSession(result.user.id);
  redirect(next);
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect('/?signedout=1');
}

// --- FR-ACC-04: recovery through the verified phone ------------------------

export async function requestRecoveryAction(formData: FormData): Promise<void> {
  const phone = str(formData, 'phone');
  const user = await findUserByPhone(phone);

  // Does not reveal whether the number is registered — an enumeration guard.
  if (!user) redirect('/recover?sent=1&unknown=1');

  const code = await issueOtp(user.id, 'recover-access');
  setPendingUser(user.id);
  redirect(`/recover?sent=1&demo=${code}`);
}

export async function completeRecoveryAction(formData: FormData): Promise<void> {
  const userId = getPendingUser();
  if (!userId) back('/recover', 'Start again by entering your phone number.');

  const password = str(formData, 'password');
  const passwordIssue = passwordProblem(password);
  if (passwordIssue) back('/recover', passwordIssue, { sent: '1' });

  const result = await consumeOtp(userId, 'recover-access', str(formData, 'code'));
  if (result !== 'ok') {
    back('/recover', result === 'expired' ? 'That code has expired. Ask for a new one.' : 'That code is not correct.', { sent: '1' });
  }

  await resetPassword(userId, password);
  clearPendingUser();
  redirect('/login?reset=1');
}

// --- FR-ACC-05 / FR-ACC-06: profile and administrative verification --------

export async function updateProfileAction(formData: FormData): Promise<void> {
  const user = await requireUser('/profile');
  const displayName = str(formData, 'displayName');
  if (displayName.length < 2) back('/profile', 'Enter your name.');

  await updateProfile(user.id, {
    displayName,
    businessName: str(formData, 'businessName'),
    homeCorridorId: str(formData, 'homeCorridorId'),
    principalProducts: str(formData, 'principalProducts'),
    language: (str(formData, 'language') || 'en') as Language,
  });
  revalidatePath('/profile');
  redirect('/profile?saved=1');
}

export async function verifyAccountAction(formData: FormData): Promise<void> {
  const admin = await requireUser('/admin');
  if (admin.role !== 'admin') back('/admin', 'Only an administrator can verify accounts.');

  const targetId = str(formData, 'userId');
  const target = await findUserById(targetId);
  if (!target) back('/admin', 'No such account.');

  await setAdminVerified(targetId, str(formData, 'verified') === 'true');
  revalidatePath('/admin');
  redirect('/admin?saved=1');
}

// --- FR-SHP-01 / FR-SHP-02: shipments --------------------------------------

export async function createShipmentAction(formData: FormData): Promise<void> {
  const planUrl = `/plan?${str(formData, 'query')}`;
  const user = await requireUser(planUrl);

  const intention = {
    corridorId: str(formData, 'corridor'),
    productId: str(formData, 'product'),
    quantity: Number(str(formData, 'quantity')),
    declaredValue: Number(str(formData, 'value')),
    currency: str(formData, 'currency') || 'USD',
  };

  const live: BorderReport[] = await recentReports();
  const plan = buildTradePlan(intention, live);
  const shipment = await createShipment(user.id, plan);

  revalidatePath('/shipments');
  redirect(`/shipments/${shipment.id}?created=1`);
}

export async function toggleChecklistAction(formData: FormData): Promise<void> {
  const shipmentId = str(formData, 'shipmentId');
  const user = await requireUser(`/shipments/${shipmentId}`);

  const shipment = await getShipment(shipmentId);
  if (!shipment || shipment.userId !== user.id) back('/shipments', 'That shipment is not yours.');

  await setChecklistItem(shipmentId, str(formData, 'ruleId'), str(formData, 'obtained') === 'true');

  // Reaching a complete mandatory set advances the shipment on its own — the trader
  // should not have to tell the system something the system already knows.
  const obtained = await listObtained(shipmentId);
  const r = readiness(shipment, obtained);
  if (r.readyToTravel && shipment.status === 'planned') {
    await recordMilestone(shipmentId, 'documents-ready', 'All mandatory documents obtained.');
  }

  revalidatePath(`/shipments/${shipmentId}`);
  redirect(`/shipments/${shipmentId}`);
}

export async function advanceShipmentAction(formData: FormData): Promise<void> {
  const shipmentId = str(formData, 'shipmentId');
  const user = await requireUser(`/shipments/${shipmentId}`);

  const shipment = await getShipment(shipmentId);
  if (!shipment || shipment.userId !== user.id) back('/shipments', 'That shipment is not yours.');

  const status = str(formData, 'status') as ShipmentStatus;
  const obtained = await listObtained(shipmentId);
  const r = readiness(shipment, obtained);

  // Re-checked on the server: the form only offers legal transitions, but the form is
  // not where the rule lives.
  if (!allowedNextStatuses(shipment.status, r.readyToTravel).includes(status)) {
    back(`/shipments/${shipmentId}`, 'That is not a valid next step for this shipment.');
  }

  await recordMilestone(shipmentId, status, str(formData, 'note'));
  revalidatePath(`/shipments/${shipmentId}`);
  redirect(`/shipments/${shipmentId}`);
}

// --- FR-BRD-03: community condition report ---------------------------------

export async function submitReportAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  const crossingId = str(formData, 'crossingId');
  const waitMinutes = Number(str(formData, 'waitMinutes'));

  if (!crossingId) back('/report', 'Choose a crossing.');
  if (!Number.isFinite(waitMinutes) || waitMinutes < 0 || waitMinutes > 2880) {
    back('/report', 'Enter the waiting time in minutes, between 0 and 2880.', { crossingId });
  }

  await submitReport({
    crossingId,
    userId: user?.id ?? null,
    category: (str(formData, 'category') || 'normal') as BorderReport['category'],
    waitMinutes,
    note: str(formData, 'note'),
  });

  revalidatePath('/report');
  revalidatePath('/plan');
  redirect('/report?thanks=1');
}

export async function normalisePhoneAction(phone: string): Promise<string> {
  return normalisePhone(phone);
}
