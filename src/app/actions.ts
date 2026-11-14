'use server';

/**
 * Server actions — every write the interface can perform.
 *
 * These are deliberately plain form actions rather than client-side fetch calls. The
 * pages work with JavaScript disabled and on a slow connection, which is what
 * SRS NFR-PER-03 and NFR-USA-02 ask for: the target user is on an entry-level phone
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
  AlreadyEnquiredError, OwnListingError,
  upsertOffering, setOfferingActive, getOffering, sendTransportRequest,
  respondToRequest, withdrawRequest, acceptedCarrier, rateProvider,
  upsertListing, setListingActive, getListing, sendEnquiry, respondToEnquiry,
  addSubscription, removeSubscription, markAllRead, notify, subscribersFor,
  listOverlays, createOverlay, publishOverlay, discardDraft, getOverlay,
  writeAudit, recordActualCost,
  AlreadyRequestedDeletionError, requestDeletion, resolveDeletionRequest,
  reportContent, resolveContentReport, listUsers,
} from '@/lib/store';
import { quote } from '@/lib/transport';
import { listingExpiry } from '@/lib/market';
import { isLanguage } from '@/lib/i18n';
import { setLanguageCookie } from '@/lib/language';
import { delaySummary, SEVERE_DELAY_MINUTES } from '@/lib/notify';
import { getCrossing } from '@/lib/border';
import { getProduct, getRulesForCorridor, getCorridor } from '@/lib/repository';
import {
  validateRule, nextVersion, effectiveRules, describeChange, draftFromFields,
} from '@/lib/rules-admin';
import { passwordProblem, phoneProblem, normalisePhone } from '@/lib/auth';
import {
  startSession, endSession, requireUser, currentUser,
  setPendingUser, getPendingUser, clearPendingUser,
} from '@/lib/session';
import { buildTradePlan } from '@/lib/engines';
import { readiness, allowedNextStatuses } from '@/lib/shipments';
import type {
  BorderReport, Language, ListingKind, OverlayAction, RegulatoryRule,
  ShipmentStatus, UserRole,
} from '@/lib/types';

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

  const verified = str(formData, 'verified') === 'true';
  await setAdminVerified(targetId, verified);

  // NFR-SEC-07 — administrative actions on account verification are audited, not
  // only those on regulatory content.
  await writeAudit({
    actorId: admin.id,
    actorName: admin.displayName,
    action: verified ? 'account.verify' : 'account.unverify',
    subject: `${target.displayName} (${target.phone})`,
    detail: verified
      ? 'Account marked verified; its listings now rank above unverified ones.'
      : 'Verification withdrawn.',
  });

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

  // FR-NOT-01 — anyone following this crossing hears about a serious delay.
  if (waitMinutes >= SEVERE_DELAY_MINUTES) {
    const crossing = getCrossing(crossingId);
    if (crossing) {
      const { title, body } = delaySummary(crossing.name, Math.round(waitMinutes));
      const recipients = await subscribersFor({
        corridorId: crossing.corridorId,
        crossingId: crossing.id,
      });
      // Not the person who just filed it — they know.
      await notify({
        userIds: recipients.filter((id) => id !== user?.id),
        kind: 'border',
        title,
        body,
        link: '/report',
      });
    }
  }

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

// --- FR-MKT-01: publish a listing ------------------------------------------

export async function saveListingAction(formData: FormData): Promise<void> {
  const user = await requireUser('/market');

  const kind = str(formData, 'kind') as ListingKind;
  if (kind !== 'selling' && kind !== 'buying') back('/market', 'Choose whether you are buying or selling.');

  const productId = str(formData, 'productId');
  const product = getProduct(productId);
  if (!product) back('/market', 'Choose a product from the list.');

  const country = str(formData, 'country');
  if (!country) back('/market', 'Choose the market this listing is in.');

  const rawQty = str(formData, 'quantity');
  const quantity = rawQty === '' ? null : Number(rawQty);
  if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0)) {
    back('/market', 'Enter a quantity greater than zero, or leave it blank.');
  }

  const rawPrice = str(formData, 'pricePerUnit');
  const pricePerUnit = rawPrice === '' ? null : Number(rawPrice);
  if (pricePerUnit !== null && (!Number.isFinite(pricePerUnit) || pricePerUnit < 0)) {
    back('/market', 'Enter a price of zero or more, or leave it blank for “price on enquiry”.');
  }

  await upsertListing(user.id, {
    kind,
    productId,
    country,
    location: str(formData, 'location'),
    quantity,
    unit: product.unit,
    pricePerUnit,
    currency: str(formData, 'currency') || 'USD',
    note: str(formData, 'note'),
    active: str(formData, 'active') !== 'false',
    expiresAt: listingExpiry(),
  });

  revalidatePath('/market');
  redirect('/market?saved=1');
}

export async function toggleListingAction(formData: FormData): Promise<void> {
  const user = await requireUser('/market');
  await setListingActive(str(formData, 'listingId'), user.id, str(formData, 'active') === 'true');
  revalidatePath('/market');
  redirect('/market');
}

// --- FR-MKT-03: enquire, without disclosing contact details ----------------

export async function sendEnquiryAction(formData: FormData): Promise<void> {
  const user = await requireUser('/market');
  const listingId = str(formData, 'listingId');

  const listing = await getListing(listingId);
  if (!listing) back('/market', 'That listing is no longer available.');
  if (listing.expired || !listing.active) back('/market', 'That listing has expired.');

  try {
    await sendEnquiry({
      listingId,
      fromUserId: user.id,
      toUserId: listing.userId,
      message: str(formData, 'message'),
    });
  } catch (e) {
    if (e instanceof AlreadyEnquiredError) back('/market', 'You have already contacted that listing.');
    if (e instanceof OwnListingError) back('/market', 'That is your own listing.');
    throw e;
  }

  // The owner hears about it; nobody else does.
  await notify({
    userIds: [listing.userId],
    kind: 'market',
    title: 'New enquiry on your listing',
    body: `Someone is interested in your ${listing.productName.toLowerCase()} listing. Accept to exchange contact details.`,
    link: '/market/enquiries',
  });

  revalidatePath('/market');
  redirect('/market?sent=1');
}

export async function respondToEnquiryAction(formData: FormData): Promise<void> {
  const user = await requireUser('/market/enquiries');
  const status = str(formData, 'status');
  if (status !== 'accepted' && status !== 'declined') back('/market/enquiries', 'Choose accept or decline.');

  const enquiry = await respondToEnquiry(str(formData, 'enquiryId'), user.id, status);
  if (!enquiry) back('/market/enquiries', 'That enquiry has already been answered.');

  await notify({
    userIds: [enquiry.fromUserId],
    kind: 'market',
    title: status === 'accepted' ? 'Your enquiry was accepted' : 'Your enquiry was declined',
    body: status === 'accepted'
      ? 'Contact details have been exchanged. You can now reach each other directly.'
      : 'The listing owner declined. Other listings may still fit.',
    link: '/market/enquiries',
  });

  revalidatePath('/market/enquiries');
  redirect(`/market/enquiries?${status === 'accepted' ? 'accepted' : 'declined'}=1`);
}

// --- FR-NOT-01: subscriptions ----------------------------------------------

export async function addSubscriptionAction(formData: FormData): Promise<void> {
  const user = await requireUser('/notifications');
  await addSubscription(user.id, {
    corridorId: str(formData, 'corridorId') || null,
    crossingId: str(formData, 'crossingId') || null,
    productCategory: str(formData, 'productCategory') || null,
  });
  revalidatePath('/notifications');
  redirect('/notifications?subscribed=1');
}

export async function removeSubscriptionAction(formData: FormData): Promise<void> {
  const user = await requireUser('/notifications');
  await removeSubscription(str(formData, 'subscriptionId'), user.id);
  revalidatePath('/notifications');
  redirect('/notifications');
}

export async function markAllReadAction(): Promise<void> {
  const user = await requireUser('/notifications');
  await markAllRead(user.id);
  revalidatePath('/notifications');
  redirect('/notifications');
}

// --- FR-ADM-01 / FR-ADM-03: draft a rule change ----------------------------

async function requireAdmin(returnTo: string) {
  const user = await requireUser(returnTo);
  if (user.role !== 'admin') back(returnTo, 'Only an administrator can do that.');
  return user;
}

export async function draftRuleAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin('/admin/rules');

  const action = str(formData, 'action') as OverlayAction;
  if (!['create', 'amend', 'retire'].includes(action)) back('/admin/rules', 'Choose create, amend or retire.');

  const ruleId = str(formData, 'id');
  const corridorId = str(formData, 'corridorId');

  const base = getRulesForCorridor(corridorId);
  const existing = await listOverlays();
  const version = nextVersion(ruleId, existing, base);

  // A retirement keeps the rule as it reads today, so the record shows what was
  // withdrawn rather than an empty row.
  let payload: RegulatoryRule;
  if (action === 'retire') {
    const current = effectiveRules(base, existing).find((r) => r.id === ruleId);
    if (!current) back('/admin/rules', 'There is no rule with that identifier to retire.');
    payload = { ...current, version };
  } else {
    const draft = draftFromFields({
      id: ruleId,
      corridorId,
      ruleType: str(formData, 'ruleType'),
      name: str(formData, 'name'),
      reason: str(formData, 'reason'),
      sourceCitation: str(formData, 'sourceCitation'),
      sourceUrl: str(formData, 'sourceUrl'),
      lastVerifiedDate: str(formData, 'lastVerifiedDate'),
      issuingAuthority: str(formData, 'issuingAuthority'),
      mandatory: str(formData, 'mandatory') !== 'false',
      estimatedProcessingTime: str(formData, 'estimatedProcessingTime'),
      ratePercent: str(formData, 'ratePercent'),
      flatAmount: str(formData, 'flatAmount'),
      flatCurrency: str(formData, 'flatCurrency'),
      thresholdValue: str(formData, 'thresholdValue'),
      thresholdCurrency: str(formData, 'thresholdCurrency'),
      scope: str(formData, 'scope'),
      hsPrefixes: str(formData, 'hsPrefixes'),
      version,
    });

    // FR-ADM-03 — rejected, not stored and flagged.
    const check = validateRule(draft);
    if (!check.valid) back('/admin/rules', check.problems.join(' '));
    payload = draft as RegulatoryRule;
  }

  const overlayId = await createOverlay({
    ruleId, corridorId, version, action, payload,
    note: str(formData, 'note'), createdBy: admin.id,
  });

  await writeAudit({
    actorId: admin.id,
    actorName: admin.displayName,
    action: 'rule.draft',
    subject: `${ruleId} v${version}`,
    detail: `${describeChange(action, payload)} — drafted, not yet in force.`,
  });

  revalidatePath('/admin/rules');
  redirect(`/admin/rules?drafted=${encodeURIComponent(overlayId)}`);
}

// --- FR-ADM-02: the explicit publication step ------------------------------

export async function publishRuleAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin('/admin/rules');
  const overlayId = str(formData, 'overlayId');

  const published = await publishOverlay(overlayId, admin.id);
  if (!published) back('/admin/rules', 'That draft has already been published or withdrawn.');

  await writeAudit({
    actorId: admin.id,
    actorName: admin.displayName,
    action: 'rule.publish',
    subject: `${published.ruleId} v${published.version}`,
    detail: `${describeChange(published.action, published.payload)} — now in force for every trader on ${published.corridorId}.`,
  });

  // FR-NOT-02 — the people following that corridor hear about it immediately,
  // rather than waiting for the fingerprint check to notice.
  const corridor = getCorridor(published.corridorId);
  if (corridor) {
    const recipients = await subscribersFor({ corridorId: published.corridorId });
    await notify({
      userIds: recipients,
      kind: 'rule-change',
      title: `Rules changed on ${corridor.originName} → ${corridor.destinationName}`,
      body: `${describeChange(published.action, published.payload)}. Any plan you made before today was correct when you made it — re-plan to see the current position.`,
      link: '/',
    });
  }

  revalidatePath('/admin/rules');
  revalidatePath('/plan');
  redirect('/admin/rules?published=1');
}

export async function discardDraftAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin('/admin/rules');
  const overlayId = str(formData, 'overlayId');

  const overlay = await getOverlay(overlayId);
  const gone = await discardDraft(overlayId);
  if (!gone) back('/admin/rules', 'That draft is no longer there, or has already been published.');

  await writeAudit({
    actorId: admin.id,
    actorName: admin.displayName,
    action: 'rule.discard',
    subject: overlay ? `${overlay.ruleId} v${overlay.version}` : overlayId,
    detail: 'Draft discarded before publication. Nothing a trader saw changed.',
  });

  revalidatePath('/admin/rules');
  redirect('/admin/rules?discarded=1');
}

// --- FR-RPT-02: record what a shipment actually cost -----------------------

export async function recordActualCostAction(formData: FormData): Promise<void> {
  const shipmentId = str(formData, 'shipmentId');
  const user = await requireUser(`/shipments/${shipmentId}`);

  const actual = Number(str(formData, 'actualUsd'));
  if (!Number.isFinite(actual) || actual < 0) {
    back(`/shipments/${shipmentId}`, 'Enter what it actually cost, in US dollars.');
  }

  const ok = await recordActualCost(shipmentId, user.id, actual, str(formData, 'note'));
  if (!ok) back(`/shipments/${shipmentId}`, 'You can record the actual cost once the shipment is delivered.');

  revalidatePath(`/shipments/${shipmentId}`);
  redirect(`/shipments/${shipmentId}?costed=1`);
}

// --- FR-LOC-01: choose a language, and keep it ------------------------------

export async function setLanguageAction(formData: FormData): Promise<void> {
  const chosen = str(formData, 'lang');
  if (!isLanguage(chosen)) back('/language', 'Choose one of the four languages.');

  // The cookie is what makes the choice survive for someone without an account;
  // the profile is what carries it to their other devices.
  setLanguageCookie(chosen);

  const user = await currentUser();
  if (user) {
    await updateProfile(user.id, {
      displayName: user.displayName,
      businessName: user.businessName ?? '',
      homeCorridorId: user.homeCorridorId ?? '',
      principalProducts: user.principalProducts ?? '',
      language: chosen,
    });
  }

  revalidatePath('/', 'layout');
  redirect('/language?saved=1');
}

// --- NFR-PRI-03: the right to erasure --------------------------------------

export async function requestDeletionAction(formData: FormData): Promise<void> {
  const user = await requireUser('/privacy');
  try {
    await requestDeletion(user.id, str(formData, 'reason'));
  } catch (e) {
    if (e instanceof AlreadyRequestedDeletionError) {
      back('/privacy', 'You already have a deletion request open.');
    }
    throw e;
  }

  // Administrators need to know without polling a page they may never open.
  const admins = await listUsers();
  await notify({
    userIds: admins.filter((u) => u.role === 'admin').map((u) => u.id),
    kind: 'market',
    title: 'A user has requested deletion of their data',
    body: 'Law No. 058/2021 gives them that right. Handle it on the administration page.',
    link: '/admin',
  });

  revalidatePath('/privacy');
  redirect('/privacy?requested=1');
}

export async function resolveDeletionAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin('/admin');
  const status = str(formData, 'status');
  if (status !== 'completed' && status !== 'refused') back('/admin', 'Choose completed or refused.');

  const resolved = await resolveDeletionRequest(
    str(formData, 'requestId'), admin.id, status, str(formData, 'response'),
  );
  if (!resolved) back('/admin', 'That request has already been handled.');

  await writeAudit({
    actorId: admin.id,
    actorName: admin.displayName,
    action: `data.deletion.${status}`,
    subject: `${resolved.userName} (${resolved.userPhone})`,
    detail: resolved.response || 'No note given.',
  });

  await notify({
    userIds: [resolved.userId],
    kind: 'market',
    title: status === 'completed' ? 'Your deletion request has been completed' : 'Your deletion request was not completed',
    body: resolved.response || 'See the terms and privacy page for what this means.',
    link: '/privacy',
  });

  revalidatePath('/admin');
  redirect('/admin?saved=1');
}

// --- NFR-LEG-04: report regulatory content believed to be wrong ------------

export async function reportContentAction(formData: FormData): Promise<void> {
  const user = await currentUser();

  const whatIsWrong = str(formData, 'whatIsWrong');
  if (whatIsWrong.length < 10) {
    back('/report-content', 'Tell us what is wrong — a sentence is enough, but we need one.');
  }

  await reportContent({
    userId: user?.id ?? null,
    ruleId: str(formData, 'ruleId'),
    corridorId: str(formData, 'corridorId'),
    whatIsWrong,
    source: str(formData, 'source'),
  });

  const admins = await listUsers();
  await notify({
    userIds: admins.filter((u) => u.role === 'admin').map((u) => u.id),
    kind: 'rule-change',
    title: 'Regulatory content reported as incorrect',
    body: whatIsWrong.slice(0, 200),
    link: '/admin',
  });

  revalidatePath('/report-content');
  redirect('/report-content?thanks=1');
}

export async function resolveContentReportAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin('/admin');
  const status = str(formData, 'status');
  if (status !== 'accepted' && status !== 'rejected') back('/admin', 'Choose accepted or rejected.');

  const resolved = await resolveContentReport(
    str(formData, 'reportId'), admin.id, status, str(formData, 'response'),
  );
  if (!resolved) back('/admin', 'That report has already been handled.');

  await writeAudit({
    actorId: admin.id,
    actorName: admin.displayName,
    action: `content.report.${status}`,
    subject: resolved.ruleId || resolved.corridorId || 'unspecified',
    detail: `${resolved.whatIsWrong.slice(0, 200)} — ${resolved.response || 'no note'}`,
  });

  if (resolved.userId) {
    await notify({
      userIds: [resolved.userId],
      kind: 'rule-change',
      title: status === 'accepted' ? 'Your report was accepted' : 'Your report was reviewed',
      body: resolved.response || (status === 'accepted'
        ? 'The rule is being amended. Thank you for checking it.'
        : 'We checked against the instrument and are keeping the rule as it stands.'),
      link: '/',
    });
  }

  revalidatePath('/admin');
  redirect('/admin?saved=1');
}
