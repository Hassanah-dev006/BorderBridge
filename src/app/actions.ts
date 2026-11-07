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
import {
  PhoneAlreadyRegisteredError, AlreadyRequestedError,
  upsertOffering, setOfferingActive, getOffering, sendTransportRequest,
  respondToRequest, withdrawRequest, acceptedCarrier, rateProvider,
} from '@/lib/store';
import { quote } from '@/lib/transport';
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

// --- FR-TRN-01: a provider publishes what they offer -----------------------

export async function saveOfferingAction(formData: FormData): Promise<void> {
  const user = await requireUser('/provider');
  if (user.role !== 'provider') back('/provider', 'Only a transport provider can publish an offering.');

  const corridorId = str(formData, 'corridorId');
  const capacityKg = Number(str(formData, 'capacityKg'));
  const ratePerKg = Number(str(formData, 'ratePerKg'));
  const minimumCharge = Number(str(formData, 'minimumCharge') || '0');

  if (!corridorId) back('/provider', 'Choose the route you serve.');
  if (!Number.isFinite(capacityKg) || capacityKg <= 0 || capacityKg > 60000) {
    back('/provider', 'Enter your vehicle capacity in kilograms, between 1 and 60,000.');
  }
  if (!Number.isFinite(ratePerKg) || ratePerKg < 0) back('/provider', 'Enter a rate of zero or more.');
  if (!Number.isFinite(minimumCharge) || minimumCharge < 0) back('/provider', 'Enter a minimum charge of zero or more.');

  const productClasses = formData.getAll('productClasses').map(String);
  if (productClasses.length === 0) back('/provider', 'Choose at least one class of goods you carry.');

  await upsertOffering(user.id, {
    corridorId,
    vehicleType: str(formData, 'vehicleType') || 'Pickup',
    capacityKg,
    productClasses,
    permits: str(formData, 'permits'),
    ratePerKg,
    minimumCharge,
    baseLocation: str(formData, 'baseLocation'),
    notes: str(formData, 'notes'),
    active: str(formData, 'active') !== 'false',
  });

  revalidatePath('/provider');
  redirect('/provider?saved=1');
}

export async function toggleOfferingAction(formData: FormData): Promise<void> {
  const user = await requireUser('/provider');
  await setOfferingActive(str(formData, 'offeringId'), user.id, str(formData, 'active') === 'true');
  revalidatePath('/provider');
  redirect('/provider');
}

// --- FR-TRN-02: a trader requests transport --------------------------------

export async function sendTransportRequestAction(formData: FormData): Promise<void> {
  const shipmentId = str(formData, 'shipmentId');
  const user = await requireUser(`/shipments/${shipmentId}/transport`);

  const shipment = await getShipment(shipmentId);
  if (!shipment || shipment.userId !== user.id) back('/shipments', 'That shipment is not yours.');

  const offering = await getOffering(str(formData, 'offeringId'));
  if (!offering) back(`/shipments/${shipmentId}/transport`, 'That provider is no longer available.');

  // Re-quoted here rather than trusted from the form, so a tampered price cannot
  // become a binding figure in the provider's inbox.
  const { usd } = quote(offering, shipment.quantity);

  try {
    await sendTransportRequest({
      shipmentId,
      offeringId: offering.id,
      traderId: user.id,
      providerId: offering.providerId,
      quotedUsd: usd,
      message: str(formData, 'message'),
    });
  } catch (e) {
    if (e instanceof AlreadyRequestedError) {
      back(`/shipments/${shipmentId}/transport`, 'You have already contacted that provider about this shipment.');
    }
    throw e;
  }

  revalidatePath(`/shipments/${shipmentId}/transport`);
  redirect(`/shipments/${shipmentId}/transport?sent=1`);
}

export async function respondToRequestAction(formData: FormData): Promise<void> {
  const user = await requireUser('/requests');
  if (user.role !== 'provider') back('/requests', 'Only a transport provider can answer a request.');

  const status = str(formData, 'status');
  if (status !== 'accepted' && status !== 'declined') back('/requests', 'Choose accept or decline.');

  await respondToRequest(str(formData, 'requestId'), user.id, status);
  revalidatePath('/requests');
  redirect(`/requests?${status === 'accepted' ? 'accepted' : 'declined'}=1`);
}

export async function withdrawRequestAction(formData: FormData): Promise<void> {
  const shipmentId = str(formData, 'shipmentId');
  const user = await requireUser(`/shipments/${shipmentId}/transport`);
  await withdrawRequest(str(formData, 'requestId'), user.id);
  revalidatePath(`/shipments/${shipmentId}/transport`);
  redirect(`/shipments/${shipmentId}/transport`);
}

export async function rateProviderAction(formData: FormData): Promise<void> {
  const shipmentId = str(formData, 'shipmentId');
  const user = await requireUser(`/shipments/${shipmentId}`);

  const shipment = await getShipment(shipmentId);
  if (!shipment || shipment.userId !== user.id) back('/shipments', 'That shipment is not yours.');
  if (shipment.status !== 'delivered') {
    back(`/shipments/${shipmentId}`, 'You can rate a provider once the shipment has been delivered.');
  }

  const carrier = await acceptedCarrier(shipmentId);
  if (!carrier) back(`/shipments/${shipmentId}`, 'No provider carried this shipment.');

  const stars = Number(str(formData, 'stars'));
  if (!Number.isFinite(stars) || stars < 1 || stars > 5) {
    back(`/shipments/${shipmentId}`, 'Choose a rating from one to five.');
  }

  await rateProvider({
    shipmentId,
    providerId: carrier.providerId,
    traderId: user.id,
    stars,
    comment: str(formData, 'comment'),
  });

  revalidatePath(`/shipments/${shipmentId}`);
  redirect(`/shipments/${shipmentId}?rated=1`);
}
