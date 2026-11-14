/**
 * Persistent store for user-generated state: accounts, sessions, shipments and
 * community border reports.
 *
 * This is the write half of the data-access seam. repository.ts reads the regulatory
 * knowledge base from JSON; this file reads and writes everything the users create.
 * Pages and server actions call these functions and never touch `sql` directly, so the
 * storage technology stays replaceable (SRS NFR-CMP-05).
 */
import { db } from './db';
import {
  hashPassword, verifyPassword, hashOtp, otpMatches, otpExpiry, generateOtp,
  newId, sessionExpiry, normalisePhone, throttle, LOCKOUT_THRESHOLD,
  SESSION_TTL_DAYS, SESSION_SLIDE_AFTER_HOURS,
} from './auth';
import type {
  AuditEntry, BorderReport, ContentReport, DeletionRequest, EnquiryDetail,
  EnquiryStatus, Language, ListingKind, PersonalDataExport, RequestStatus,
  ListingWithOwner, Milestone, Notification, NotificationKind, OfferingWithProvider,
  OperationalMetrics, OverlayAction, OverlayStatus, ProviderRating, RegulatoryRule,
  RequestDetail, RuleOverlay, Session, Shipment, ShipmentStatus, Subscription,
  ThrottleState, TradePlan, TransportRequestStatus, User, UserRole,
} from './types';

// --- row mapping -----------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function toUser(r: any): User {
  return {
    id: r.id,
    phone: r.phone,
    displayName: r.display_name,
    role: r.role as UserRole,
    preferredLanguage: r.preferred_language as Language,
    phoneVerifiedAt: r.phone_verified_at ? new Date(r.phone_verified_at).toISOString() : null,
    verifiedByAdmin: r.verified_by_admin,
    businessName: r.business_name,
    homeCorridorId: r.home_corridor_id,
    principalProducts: r.principal_products,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

function toShipment(r: any): Shipment {
  return {
    id: r.id,
    userId: r.user_id,
    corridorId: r.corridor_id,
    productId: r.product_id,
    quantity: Number(r.quantity),
    declaredValue: Number(r.declared_value),
    currency: r.currency,
    planSnapshot: r.plan_snapshot as TradePlan,
    status: r.status as ShipmentStatus,
    createdAt: new Date(r.created_at).toISOString(),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// --- accounts (FR-ACC-01, FR-ACC-05) ---------------------------------------

export async function findUserByPhone(phone: string): Promise<User | null> {
  const sql = db();
  const rows = await sql`SELECT * FROM users WHERE phone = ${normalisePhone(phone)} LIMIT 1`;
  return rows[0] ? toUser(rows[0]) : null;
}

export async function findUserById(id: string): Promise<User | null> {
  const sql = db();
  const rows = await sql`SELECT * FROM users WHERE id = ${id} LIMIT 1`;
  return rows[0] ? toUser(rows[0]) : null;
}

export class PhoneAlreadyRegisteredError extends Error {}

/**
 * FR-ACC-01 — register with the phone number as the primary identifier.
 * The account exists but is unverified until the one-time code is confirmed.
 */
export async function registerUser(input: {
  phone: string; displayName: string; password: string; role: UserRole; language: Language;
}): Promise<User> {
  const sql = db();
  const phone = normalisePhone(input.phone);

  const existing = await sql`SELECT id FROM users WHERE phone = ${phone} LIMIT 1`;
  if (existing.length > 0) throw new PhoneAlreadyRegisteredError(phone);

  const id = newId();
  await sql`
    INSERT INTO users (id, phone, display_name, role, preferred_language, password_hash)
    VALUES (${id}, ${phone}, ${input.displayName.trim()}, ${input.role},
            ${input.language}, ${hashPassword(input.password)})
  `;
  const user = await findUserById(id);
  return user!;
}

/** FR-ACC-05 — the reusable profile, stated once and reused on every plan. */
export async function updateProfile(userId: string, input: {
  displayName: string; businessName: string; homeCorridorId: string;
  principalProducts: string; language: Language;
}): Promise<void> {
  const sql = db();
  await sql`
    UPDATE users SET
      display_name = ${input.displayName.trim()},
      business_name = ${input.businessName.trim() || null},
      home_corridor_id = ${input.homeCorridorId || null},
      principal_products = ${input.principalProducts.trim() || null},
      preferred_language = ${input.language}
    WHERE id = ${userId}
  `;
}

/** FR-ACC-06 — an administrator verifies a provider or buyer account. */
export async function setAdminVerified(userId: string, verified: boolean): Promise<void> {
  const sql = db();
  await sql`UPDATE users SET verified_by_admin = ${verified} WHERE id = ${userId}`;
}

export async function listUsers(): Promise<User[]> {
  const sql = db();
  const rows = await sql`SELECT * FROM users ORDER BY created_at DESC`;
  return rows.map(toUser);
}

// --- one-time codes (FR-ACC-02, FR-ACC-04) ---------------------------------

/**
 * Issues a code and returns it in plain text exactly once, to the caller.
 *
 * In production this hands the code to an SMS gateway. In this prototype the caller
 * displays it on screen, which is stated plainly in the interface rather than hidden —
 * the hashing, expiry and single-use rules below are the real implementation.
 */
export async function issueOtp(userId: string, purpose: 'verify-phone' | 'recover-access'): Promise<string> {
  const sql = db();
  const code = generateOtp();
  // Supersede any outstanding code for this purpose, so only the newest one works.
  await sql`
    UPDATE otp_codes SET consumed_at = NOW()
    WHERE user_id = ${userId} AND purpose = ${purpose} AND consumed_at IS NULL
  `;
  await sql`
    INSERT INTO otp_codes (id, user_id, purpose, code_hash, expires_at)
    VALUES (${newId()}, ${userId}, ${purpose}, ${hashOtp(code)}, ${otpExpiry()})
  `;
  return code;
}

export type OtpResult = 'ok' | 'wrong-code' | 'expired' | 'none-outstanding';

/** Single use and time limited — a consumed or expired code never succeeds again. */
export async function consumeOtp(
  userId: string, purpose: 'verify-phone' | 'recover-access', code: string,
): Promise<OtpResult> {
  const sql = db();
  const rows = await sql`
    SELECT * FROM otp_codes
    WHERE user_id = ${userId} AND purpose = ${purpose} AND consumed_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `;
  if (rows.length === 0) return 'none-outstanding';

  const row = rows[0];
  if (new Date(row.expires_at).getTime() < Date.now()) return 'expired';
  if (!otpMatches(code.trim(), row.code_hash)) return 'wrong-code';

  await sql`UPDATE otp_codes SET consumed_at = NOW() WHERE id = ${row.id}`;
  if (purpose === 'verify-phone') {
    await sql`UPDATE users SET phone_verified_at = NOW() WHERE id = ${userId}`;
  }
  return 'ok';
}

export async function resetPassword(userId: string, password: string): Promise<void> {
  const sql = db();
  await sql`UPDATE users SET password_hash = ${hashPassword(password)} WHERE id = ${userId}`;
  // Signing out everywhere after a password reset is the point of a password reset.
  await sql`DELETE FROM sessions WHERE user_id = ${userId}`;
}

// --- authentication with throttling (FR-ACC-03) ----------------------------

/** How many failures in the recent window, and how long since the last one. */
export async function throttleState(phone: string): Promise<ThrottleState> {
  const sql = db();
  const normalised = normalisePhone(phone);
  const rows = await sql`
    SELECT successful, attempted_at FROM login_attempts
    WHERE phone = ${normalised} AND attempted_at > NOW() - INTERVAL '15 minutes'
    ORDER BY attempted_at DESC LIMIT 20
  `;
  let failures = 0;
  for (const r of rows) {
    if (r.successful) break; // a success clears the run
    failures += 1;
  }
  const since = rows.length > 0 ? (Date.now() - new Date(rows[0].attempted_at).getTime()) / 1000 : 1e9;
  return throttle(failures, since);
}

async function recordAttempt(phone: string, successful: boolean): Promise<void> {
  const sql = db();
  await sql`INSERT INTO login_attempts (phone, successful) VALUES (${normalisePhone(phone)}, ${successful})`;
}

export type LoginResult =
  | { ok: true; user: User }
  | { ok: false; reason: 'bad-credentials' | 'unverified' | 'throttled'; message: string; throttle?: ThrottleState };

export async function authenticate(phone: string, password: string): Promise<LoginResult> {
  const state = await throttleState(phone);
  if (!state.allowed) {
    return { ok: false, reason: 'throttled', message: state.message, throttle: state };
  }

  const user = await findUserByPhone(phone);
  const sql = db();
  const rows = user ? await sql`SELECT password_hash FROM users WHERE id = ${user.id}` : [];

  if (!user || rows.length === 0 || !verifyPassword(password, rows[0].password_hash)) {
    await recordAttempt(phone, false);
    const next = await throttleState(phone);
    return {
      ok: false,
      reason: 'bad-credentials',
      // Deliberately does not reveal whether the number is registered.
      message:
        next.failedAttempts >= LOCKOUT_THRESHOLD
          ? next.message
          : 'That phone number and password do not match.',
      throttle: next,
    };
  }

  if (!user.phoneVerifiedAt) {
    return { ok: false, reason: 'unverified', message: 'Confirm your phone number first.' };
  }

  await recordAttempt(phone, true);
  return { ok: true, user };
}

// --- sessions --------------------------------------------------------------

export async function createSession(userId: string): Promise<Session> {
  const sql = db();
  const id = newId();
  const expires = sessionExpiry();
  await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${id}, ${userId}, ${expires})`;
  return { id, userId, expiresAt: expires.toISOString() };
}

/**
 * The signed-in user, and the point at which NFR-SEC-08's inactivity clock resets.
 *
 * The window slides on use rather than expiring absolutely, so somebody who opens
 * BorderBridge once a week is never signed out mid-journey. It is only rewritten
 * once a day, so an active session does not mean a write on every page load.
 */
export async function getSessionUser(sessionId: string): Promise<User | null> {
  const sql = db();
  const rows = await sql`
    SELECT u.*, s.expires_at AS session_expires FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ${sessionId} AND s.expires_at > NOW() LIMIT 1
  `;
  if (!rows[0]) return null;

  const expiresAt = new Date(rows[0].session_expires).getTime();
  const fullWindow = SESSION_TTL_DAYS * 86_400_000;
  const slideWhen = fullWindow - SESSION_SLIDE_AFTER_HOURS * 3_600_000;
  if (expiresAt - Date.now() < slideWhen) {
    await sql`
      UPDATE sessions SET expires_at = NOW() + INTERVAL '${sql.unsafe(String(SESSION_TTL_DAYS))} days'
      WHERE id = ${sessionId}
    `;
  }

  return toUser(rows[0]);
}

export async function destroySession(sessionId: string): Promise<void> {
  const sql = db();
  await sql`DELETE FROM sessions WHERE id = ${sessionId}`;
}

// --- shipments (FR-SHP-01, FR-SHP-02) --------------------------------------

/** FR-SHP-01 — freeze the plan. Nothing recomputes it afterwards. */
export async function createShipment(userId: string, plan: TradePlan): Promise<Shipment> {
  const sql = db();
  const id = newId();
  await sql`
    INSERT INTO shipments (id, user_id, corridor_id, product_id, quantity, declared_value, currency, plan_snapshot)
    VALUES (${id}, ${userId}, ${plan.corridor.id}, ${plan.product.id}, ${plan.intention.quantity},
            ${plan.intention.declaredValue}, ${plan.intention.currency}, ${sql.json(plan as never)})
  `;
  await sql`
    INSERT INTO shipment_milestones (id, shipment_id, status, note)
    VALUES (${newId()}, ${id}, 'planned', 'Shipment created from trade plan.')
  `;
  const created = await getShipment(id);
  return created!;
}

export async function getShipment(id: string): Promise<Shipment | null> {
  const sql = db();
  const rows = await sql`SELECT * FROM shipments WHERE id = ${id} LIMIT 1`;
  return rows[0] ? toShipment(rows[0]) : null;
}

export async function listShipments(userId: string): Promise<Shipment[]> {
  const sql = db();
  const rows = await sql`SELECT * FROM shipments WHERE user_id = ${userId} ORDER BY created_at DESC`;
  return rows.map(toShipment);
}

/** FR-SHP-02 — append a milestone and move the shipment's current status. */
export async function recordMilestone(
  shipmentId: string, status: ShipmentStatus, note = '',
): Promise<void> {
  const sql = db();
  await sql`
    INSERT INTO shipment_milestones (id, shipment_id, status, note)
    VALUES (${newId()}, ${shipmentId}, ${status}, ${note})
  `;
  await sql`UPDATE shipments SET status = ${status} WHERE id = ${shipmentId}`;
}

export async function listMilestones(shipmentId: string): Promise<Milestone[]> {
  const sql = db();
  const rows = await sql`
    SELECT * FROM shipment_milestones WHERE shipment_id = ${shipmentId} ORDER BY recorded_at ASC
  `;
  return rows.map((r) => ({
    id: r.id,
    shipmentId: r.shipment_id,
    status: r.status as ShipmentStatus,
    note: r.note,
    recordedAt: new Date(r.recorded_at).toISOString(),
  }));
}

export async function setChecklistItem(
  shipmentId: string, ruleId: string, obtained: boolean,
): Promise<void> {
  const sql = db();
  if (obtained) {
    await sql`
      INSERT INTO checklist_progress (shipment_id, rule_id) VALUES (${shipmentId}, ${ruleId})
      ON CONFLICT (shipment_id, rule_id) DO NOTHING
    `;
  } else {
    await sql`DELETE FROM checklist_progress WHERE shipment_id = ${shipmentId} AND rule_id = ${ruleId}`;
  }
}

export async function listObtained(shipmentId: string): Promise<string[]> {
  const sql = db();
  const rows = await sql`SELECT rule_id FROM checklist_progress WHERE shipment_id = ${shipmentId}`;
  return rows.map((r) => r.rule_id as string);
}

// --- community border reports (FR-BRD-03) ----------------------------------

export async function submitReport(input: {
  crossingId: string; userId: string | null; category: BorderReport['category'];
  waitMinutes: number; note: string;
}): Promise<void> {
  const sql = db();
  await sql`
    INSERT INTO border_reports (id, crossing_id, user_id, category, wait_minutes, note)
    VALUES (${newId()}, ${input.crossingId}, ${input.userId}, ${input.category},
            ${Math.round(input.waitMinutes)}, ${input.note.trim().slice(0, 240)})
  `;
}

/**
 * Reports from the last day. The border service decays and discards them per
 * FR-BRD-05; this just hands over the raw set.
 */
export async function recentReports(): Promise<BorderReport[]> {
  const sql = db();
  const rows = await sql`
    SELECT * FROM border_reports WHERE reported_at > NOW() - INTERVAL '24 hours'
    ORDER BY reported_at DESC LIMIT 200
  `;
  return rows.map((r) => ({
    id: r.id,
    crossingId: r.crossing_id,
    category: r.category as BorderReport['category'],
    waitMinutes: Number(r.wait_minutes),
    reportedAt: new Date(r.reported_at).toISOString(),
    note: r.note,
  }));
}

export async function countReportsByUser(userId: string): Promise<number> {
  const sql = db();
  const rows = await sql`SELECT COUNT(*)::int AS n FROM border_reports WHERE user_id = ${userId}`;
  return rows[0]?.n ?? 0;
}

// --- transport offerings (FR-TRN-01) ---------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function toOffering(r: any): OfferingWithProvider {
  return {
    id: r.id,
    providerId: r.provider_id,
    corridorId: r.corridor_id,
    vehicleType: r.vehicle_type,
    capacityKg: Number(r.capacity_kg),
    productClasses: (r.product_classes ?? []) as string[],
    permits: r.permits,
    ratePerKg: Number(r.rate_per_kg),
    minimumCharge: Number(r.minimum_charge),
    baseLocation: r.base_location,
    notes: r.notes,
    active: r.active,
    createdAt: new Date(r.created_at).toISOString(),
    providerName: r.provider_name ?? '',
    providerPhone: r.provider_phone ?? '',
    providerBusiness: r.provider_business ?? null,
    verifiedByAdmin: r.verified_by_admin ?? false,
    meanRating: r.mean_rating === null || r.mean_rating === undefined ? null : Number(r.mean_rating),
    ratingCount: Number(r.rating_count ?? 0),
    completedJobs: Number(r.completed_jobs ?? 0),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Offerings with their provider's details and reputation already joined.
 *
 * The rating is computed here rather than stored on the offering, so it can never
 * drift out of step with the ratings table.
 */
const OFFERING_SELECT = `
  SELECT o.*,
         u.display_name AS provider_name,
         u.phone AS provider_phone,
         u.business_name AS provider_business,
         u.verified_by_admin,
         r.mean_rating,
         COALESCE(r.rating_count, 0) AS rating_count,
         COALESCE(j.completed_jobs, 0) AS completed_jobs
  FROM transport_offerings o
  JOIN users u ON u.id = o.provider_id
  LEFT JOIN (
    SELECT provider_id, AVG(stars)::numeric(3,2) AS mean_rating, COUNT(*) AS rating_count
    FROM provider_ratings GROUP BY provider_id
  ) r ON r.provider_id = o.provider_id
  LEFT JOIN (
    SELECT provider_id, COUNT(*) AS completed_jobs
    FROM transport_requests WHERE status = 'accepted' GROUP BY provider_id
  ) j ON j.provider_id = o.provider_id
`;

export async function listOfferingsForCorridor(corridorId: string): Promise<OfferingWithProvider[]> {
  const sql = db();
  const rows = await sql.unsafe(`${OFFERING_SELECT} WHERE o.corridor_id = $1 AND o.active = TRUE`, [corridorId]);
  return rows.map(toOffering);
}

/** Every offering, used where the exclusion list should explain near-misses too. */
export async function listAllOfferings(): Promise<OfferingWithProvider[]> {
  const sql = db();
  const rows = await sql.unsafe(OFFERING_SELECT);
  return rows.map(toOffering);
}

export async function listProviderOfferings(providerId: string): Promise<OfferingWithProvider[]> {
  const sql = db();
  const rows = await sql.unsafe(`${OFFERING_SELECT} WHERE o.provider_id = $1 ORDER BY o.created_at`, [providerId]);
  return rows.map(toOffering);
}

export async function getOffering(id: string): Promise<OfferingWithProvider | null> {
  const sql = db();
  const rows = await sql.unsafe(`${OFFERING_SELECT} WHERE o.id = $1`, [id]);
  return rows[0] ? toOffering(rows[0]) : null;
}

/** FR-TRN-01 — publish or amend what this provider offers on a corridor. */
export async function upsertOffering(providerId: string, input: {
  corridorId: string; vehicleType: string; capacityKg: number; productClasses: string[];
  permits: string; ratePerKg: number; minimumCharge: number; baseLocation: string;
  notes: string; active: boolean;
}): Promise<void> {
  const sql = db();
  await sql`
    INSERT INTO transport_offerings (
      id, provider_id, corridor_id, vehicle_type, capacity_kg, product_classes,
      permits, rate_per_kg, minimum_charge, base_location, notes, active
    ) VALUES (
      ${newId()}, ${providerId}, ${input.corridorId}, ${input.vehicleType},
      ${Math.round(input.capacityKg)}, ${input.productClasses}, ${input.permits.trim()},
      ${input.ratePerKg}, ${input.minimumCharge}, ${input.baseLocation.trim()},
      ${input.notes.trim()}, ${input.active}
    )
    ON CONFLICT (provider_id, corridor_id) DO UPDATE SET
      vehicle_type = EXCLUDED.vehicle_type,
      capacity_kg = EXCLUDED.capacity_kg,
      product_classes = EXCLUDED.product_classes,
      permits = EXCLUDED.permits,
      rate_per_kg = EXCLUDED.rate_per_kg,
      minimum_charge = EXCLUDED.minimum_charge,
      base_location = EXCLUDED.base_location,
      notes = EXCLUDED.notes,
      active = EXCLUDED.active
  `;
}

export async function setOfferingActive(offeringId: string, providerId: string, active: boolean): Promise<void> {
  const sql = db();
  await sql`
    UPDATE transport_offerings SET active = ${active}
    WHERE id = ${offeringId} AND provider_id = ${providerId}
  `;
}

// --- transport requests (FR-TRN-02) ----------------------------------------

export class AlreadyRequestedError extends Error {}

export async function sendTransportRequest(input: {
  shipmentId: string; offeringId: string; traderId: string; providerId: string;
  quotedUsd: number; message: string;
}): Promise<void> {
  const sql = db();
  const existing = await sql`
    SELECT id FROM transport_requests
    WHERE shipment_id = ${input.shipmentId} AND offering_id = ${input.offeringId} LIMIT 1
  `;
  if (existing.length > 0) throw new AlreadyRequestedError();

  await sql`
    INSERT INTO transport_requests (id, shipment_id, offering_id, trader_id, provider_id, quoted_usd, message)
    VALUES (${newId()}, ${input.shipmentId}, ${input.offeringId}, ${input.traderId},
            ${input.providerId}, ${input.quotedUsd}, ${input.message.trim().slice(0, 400)})
  `;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toRequestDetail(r: any): RequestDetail {
  return {
    id: r.id,
    shipmentId: r.shipment_id,
    offeringId: r.offering_id,
    traderId: r.trader_id,
    providerId: r.provider_id,
    status: r.status as TransportRequestStatus,
    quotedUsd: Number(r.quoted_usd),
    message: r.message,
    respondedAt: r.responded_at ? new Date(r.responded_at).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
    providerName: r.provider_name ?? '',
    providerPhone: r.provider_phone ?? '',
    traderName: r.trader_name ?? '',
    traderPhone: r.trader_phone ?? '',
    vehicleType: r.vehicle_type ?? '',
    corridorId: r.corridor_id ?? '',
    productName: r.product_name ?? '',
    quantity: Number(r.quantity ?? 0),
    unit: r.unit ?? '',
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const REQUEST_SELECT = `
  SELECT q.*,
         p.display_name AS provider_name, p.phone AS provider_phone,
         t.display_name AS trader_name, t.phone AS trader_phone,
         o.vehicle_type, o.corridor_id,
         s.plan_snapshot -> 'product' ->> 'name' AS product_name,
         s.plan_snapshot -> 'product' ->> 'unit' AS unit,
         s.quantity
  FROM transport_requests q
  JOIN users p ON p.id = q.provider_id
  JOIN users t ON t.id = q.trader_id
  JOIN transport_offerings o ON o.id = q.offering_id
  JOIN shipments s ON s.id = q.shipment_id
`;

export async function listRequestsForShipment(shipmentId: string): Promise<RequestDetail[]> {
  const sql = db();
  const rows = await sql.unsafe(`${REQUEST_SELECT} WHERE q.shipment_id = $1 ORDER BY q.created_at DESC`, [shipmentId]);
  return rows.map(toRequestDetail);
}

export async function listRequestsForProvider(providerId: string): Promise<RequestDetail[]> {
  const sql = db();
  const rows = await sql.unsafe(`${REQUEST_SELECT} WHERE q.provider_id = $1 ORDER BY q.created_at DESC`, [providerId]);
  return rows.map(toRequestDetail);
}

export async function getRequest(id: string): Promise<RequestDetail | null> {
  const sql = db();
  const rows = await sql.unsafe(`${REQUEST_SELECT} WHERE q.id = $1`, [id]);
  return rows[0] ? toRequestDetail(rows[0]) : null;
}

/**
 * The provider's answer. Accepting one request withdraws the trader's other
 * outstanding requests for that shipment — they only need one carrier, and leaving
 * stale requests open wastes other providers' attention.
 */
export async function respondToRequest(
  requestId: string, providerId: string, status: 'accepted' | 'declined',
): Promise<void> {
  const sql = db();
  const rows = await sql`
    UPDATE transport_requests SET status = ${status}, responded_at = NOW()
    WHERE id = ${requestId} AND provider_id = ${providerId} AND status = 'sent'
    RETURNING shipment_id
  `;
  if (rows.length === 0 || status !== 'accepted') return;

  await sql`
    UPDATE transport_requests SET status = 'withdrawn', responded_at = NOW()
    WHERE shipment_id = ${rows[0].shipment_id} AND id <> ${requestId} AND status = 'sent'
  `;
}

export async function withdrawRequest(requestId: string, traderId: string): Promise<void> {
  const sql = db();
  await sql`
    UPDATE transport_requests SET status = 'withdrawn', responded_at = NOW()
    WHERE id = ${requestId} AND trader_id = ${traderId} AND status = 'sent'
  `;
}

/** The accepted carrier for a shipment, if one has accepted. */
export async function acceptedCarrier(shipmentId: string): Promise<RequestDetail | null> {
  const sql = db();
  const rows = await sql.unsafe(
    `${REQUEST_SELECT} WHERE q.shipment_id = $1 AND q.status = 'accepted' LIMIT 1`, [shipmentId],
  );
  return rows[0] ? toRequestDetail(rows[0]) : null;
}

// --- provider ratings ------------------------------------------------------

export async function rateProvider(input: {
  shipmentId: string; providerId: string; traderId: string; stars: number; comment: string;
}): Promise<void> {
  const sql = db();
  await sql`
    INSERT INTO provider_ratings (id, shipment_id, provider_id, trader_id, stars, comment)
    VALUES (${newId()}, ${input.shipmentId}, ${input.providerId}, ${input.traderId},
            ${Math.round(input.stars)}, ${input.comment.trim().slice(0, 400)})
    ON CONFLICT (shipment_id) DO UPDATE SET
      stars = EXCLUDED.stars, comment = EXCLUDED.comment, created_at = NOW()
  `;
}

export async function getRating(shipmentId: string): Promise<ProviderRating | null> {
  const sql = db();
  const rows = await sql`SELECT * FROM provider_ratings WHERE shipment_id = ${shipmentId} LIMIT 1`;
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    shipmentId: r.shipment_id,
    providerId: r.provider_id,
    traderId: r.trader_id,
    stars: Number(r.stars),
    comment: r.comment,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

// --- marketplace (FR-MKT-01, FR-MKT-02, FR-MKT-03) -------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function toListing(r: any, now = new Date()): ListingWithOwner {
  const expiresAt = new Date(r.expires_at).toISOString();
  const remaining = Math.floor((new Date(expiresAt).getTime() - now.getTime()) / 86_400_000);
  return {
    id: r.id,
    userId: r.user_id,
    kind: r.kind as ListingKind,
    productId: r.product_id,
    country: r.country,
    location: r.location,
    quantity: r.quantity === null ? null : Number(r.quantity),
    unit: r.unit,
    pricePerUnit: r.price_per_unit === null ? null : Number(r.price_per_unit),
    currency: r.currency,
    note: r.note,
    active: r.active,
    expiresAt,
    createdAt: new Date(r.created_at).toISOString(),
    ownerName: r.owner_name ?? '',
    ownerBusiness: r.owner_business ?? null,
    ownerVerified: r.owner_verified ?? false,
    productName: r.product_name ?? r.product_id,
    productCategory: r.product_category ?? '',
    daysRemaining: remaining,
    expired: remaining < 0,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Listings with their owner's PUBLIC details joined — name, business, verification.
 *
 * The phone number is deliberately not selected. FR-MKT-03 releases contact details
 * only when an enquiry is accepted, and a query that never fetches the number cannot
 * leak it into a page by accident.
 */
const LISTING_SELECT = `
  SELECT l.*,
         u.display_name AS owner_name,
         u.business_name AS owner_business,
         u.verified_by_admin AS owner_verified
  FROM market_listings l
  JOIN users u ON u.id = l.user_id
`;

export async function listActiveListings(): Promise<ListingWithOwner[]> {
  const sql = db();
  const rows = await sql.unsafe(
    `${LISTING_SELECT} WHERE l.active = TRUE AND l.expires_at > NOW() ORDER BY l.created_at DESC LIMIT 200`,
  );
  return rows.map((r) => toListing(r));
}

export async function listUserListings(userId: string): Promise<ListingWithOwner[]> {
  const sql = db();
  const rows = await sql.unsafe(`${LISTING_SELECT} WHERE l.user_id = $1 ORDER BY l.created_at DESC`, [userId]);
  return rows.map((r) => toListing(r));
}

export async function getListing(id: string): Promise<ListingWithOwner | null> {
  const sql = db();
  const rows = await sql.unsafe(`${LISTING_SELECT} WHERE l.id = $1`, [id]);
  return rows[0] ? toListing(rows[0]) : null;
}

/** FR-MKT-01 — publish or renew a listing. One per user, kind, product and market. */
export async function upsertListing(userId: string, input: {
  kind: ListingKind; productId: string; country: string; location: string;
  quantity: number | null; unit: string; pricePerUnit: number | null;
  currency: string; note: string; active: boolean; expiresAt: Date;
}): Promise<void> {
  const sql = db();
  await sql`
    INSERT INTO market_listings (
      id, user_id, kind, product_id, country, location, quantity, unit,
      price_per_unit, currency, note, active, expires_at
    ) VALUES (
      ${newId()}, ${userId}, ${input.kind}, ${input.productId}, ${input.country},
      ${input.location.trim()}, ${input.quantity}, ${input.unit},
      ${input.pricePerUnit}, ${input.currency}, ${input.note.trim().slice(0, 400)},
      ${input.active}, ${input.expiresAt}
    )
    ON CONFLICT (user_id, kind, product_id, country) DO UPDATE SET
      location = EXCLUDED.location,
      quantity = EXCLUDED.quantity,
      unit = EXCLUDED.unit,
      price_per_unit = EXCLUDED.price_per_unit,
      currency = EXCLUDED.currency,
      note = EXCLUDED.note,
      active = EXCLUDED.active,
      expires_at = EXCLUDED.expires_at
  `;
}

export async function setListingActive(listingId: string, userId: string, active: boolean): Promise<void> {
  const sql = db();
  await sql`UPDATE market_listings SET active = ${active} WHERE id = ${listingId} AND user_id = ${userId}`;
}

export class AlreadyEnquiredError extends Error {}
export class OwnListingError extends Error {}

/** FR-MKT-03 — an enquiry carries a message, never a contact detail. */
export async function sendEnquiry(input: {
  listingId: string; fromUserId: string; toUserId: string; message: string;
}): Promise<void> {
  if (input.fromUserId === input.toUserId) throw new OwnListingError();
  const sql = db();
  const existing = await sql`
    SELECT id FROM market_enquiries
    WHERE listing_id = ${input.listingId} AND from_user_id = ${input.fromUserId} LIMIT 1
  `;
  if (existing.length > 0) throw new AlreadyEnquiredError();

  await sql`
    INSERT INTO market_enquiries (id, listing_id, from_user_id, to_user_id, message)
    VALUES (${newId()}, ${input.listingId}, ${input.fromUserId}, ${input.toUserId},
            ${input.message.trim().slice(0, 600)})
  `;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toEnquiry(r: any, viewerId: string): EnquiryDetail {
  // The counterparty's number is released only on acceptance, and only to the two
  // parties. Computed here so no page can forget the rule.
  const accepted = r.status === 'accepted';
  const viewerIsSender = r.from_user_id === viewerId;
  const phone = !accepted
    ? null
    : viewerIsSender
      ? (r.to_phone ?? null)
      : (r.from_phone ?? null);

  return {
    id: r.id,
    listingId: r.listing_id,
    fromUserId: r.from_user_id,
    toUserId: r.to_user_id,
    message: r.message,
    status: r.status as EnquiryStatus,
    respondedAt: r.responded_at ? new Date(r.responded_at).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
    listingKind: r.kind as ListingKind,
    productName: r.product_name ?? r.product_id ?? '',
    country: r.country ?? '',
    fromName: r.from_name ?? '',
    toName: r.to_name ?? '',
    counterpartyPhone: phone,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const ENQUIRY_SELECT = `
  SELECT e.*, l.kind, l.product_id, l.country,
         f.display_name AS from_name, f.phone AS from_phone,
         t.display_name AS to_name,   t.phone AS to_phone
  FROM market_enquiries e
  JOIN market_listings l ON l.id = e.listing_id
  JOIN users f ON f.id = e.from_user_id
  JOIN users t ON t.id = e.to_user_id
`;

export async function listEnquiriesFor(userId: string): Promise<EnquiryDetail[]> {
  const sql = db();
  const rows = await sql.unsafe(
    `${ENQUIRY_SELECT} WHERE e.to_user_id = $1 OR e.from_user_id = $1 ORDER BY e.created_at DESC`,
    [userId],
  );
  return rows.map((r) => toEnquiry(r, userId));
}

export async function respondToEnquiry(
  enquiryId: string, ownerId: string, status: 'accepted' | 'declined',
): Promise<EnquiryDetail | null> {
  const sql = db();
  const rows = await sql`
    UPDATE market_enquiries SET status = ${status}, responded_at = NOW()
    WHERE id = ${enquiryId} AND to_user_id = ${ownerId} AND status = 'sent'
    RETURNING id
  `;
  if (rows.length === 0) return null;
  const all = await listEnquiriesFor(ownerId);
  return all.find((e) => e.id === enquiryId) ?? null;
}

export async function enquiredListingIds(userId: string): Promise<string[]> {
  const sql = db();
  const rows = await sql`SELECT listing_id FROM market_enquiries WHERE from_user_id = ${userId}`;
  return rows.map((r) => r.listing_id as string);
}

// --- notifications (FR-NOT-01, FR-NOT-02) ----------------------------------

export async function listSubscriptions(userId: string): Promise<Subscription[]> {
  const sql = db();
  const rows = await sql`
    SELECT * FROM notification_subscriptions WHERE user_id = ${userId} ORDER BY created_at
  `;
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    corridorId: r.corridor_id,
    crossingId: r.crossing_id,
    productCategory: r.product_category,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function addSubscription(userId: string, input: {
  corridorId: string | null; crossingId: string | null; productCategory: string | null;
}): Promise<void> {
  const sql = db();
  await sql`
    INSERT INTO notification_subscriptions (id, user_id, corridor_id, crossing_id, product_category)
    VALUES (${newId()}, ${userId}, ${input.corridorId}, ${input.crossingId}, ${input.productCategory})
    ON CONFLICT (user_id, corridor_id, crossing_id, product_category) DO NOTHING
  `;
}

export async function removeSubscription(subscriptionId: string, userId: string): Promise<void> {
  const sql = db();
  await sql`DELETE FROM notification_subscriptions WHERE id = ${subscriptionId} AND user_id = ${userId}`;
}

/** Everyone whose subscriptions cover this event. Matching is done in notify.ts. */
export async function subscribersFor(event: {
  corridorId?: string | null; crossingId?: string | null; productCategory?: string | null;
}): Promise<string[]> {
  const sql = db();
  const rows = await sql`
    SELECT DISTINCT user_id FROM notification_subscriptions
    WHERE (corridor_id IS NULL OR ${event.corridorId ?? null}::text IS NULL OR corridor_id = ${event.corridorId ?? null})
      AND (crossing_id IS NULL OR ${event.crossingId ?? null}::text IS NULL OR crossing_id = ${event.crossingId ?? null})
      AND (product_category IS NULL OR ${event.productCategory ?? null}::text IS NULL OR product_category = ${event.productCategory ?? null})
  `;
  return rows.map((r) => r.user_id as string);
}

export async function notify(input: {
  userIds: string[]; kind: NotificationKind; title: string; body?: string; link?: string;
}): Promise<number> {
  if (input.userIds.length === 0) return 0;
  const sql = db();
  const rows = input.userIds.map((uid) => ({
    id: newId(),
    user_id: uid,
    kind: input.kind,
    title: input.title.slice(0, 200),
    body: (input.body ?? '').slice(0, 800),
    link: input.link ?? '',
  }));
  await sql`INSERT INTO notifications ${sql(rows, 'id', 'user_id', 'kind', 'title', 'body', 'link')}`;
  return rows.length;
}

export async function listNotifications(userId: string, limit = 50): Promise<Notification[]> {
  const sql = db();
  const rows = await sql`
    SELECT * FROM notifications WHERE user_id = ${userId}
    ORDER BY created_at DESC LIMIT ${limit}
  `;
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    kind: r.kind as NotificationKind,
    title: r.title,
    body: r.body,
    link: r.link,
    readAt: r.read_at ? new Date(r.read_at).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function unreadCount(userId: string): Promise<number> {
  const sql = db();
  const rows = await sql`
    SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = ${userId} AND read_at IS NULL
  `;
  return rows[0]?.n ?? 0;
}

export async function markAllRead(userId: string): Promise<void> {
  const sql = db();
  await sql`UPDATE notifications SET read_at = NOW() WHERE user_id = ${userId} AND read_at IS NULL`;
}

// --- FR-NOT-02: rule-change detection --------------------------------------

export async function getWatermark(corridorId: string): Promise<string | null> {
  const sql = db();
  const rows = await sql`SELECT fingerprint FROM rule_watermarks WHERE corridor_id = ${corridorId}`;
  return rows[0]?.fingerprint ?? null;
}

export async function setWatermark(corridorId: string, fingerprint: string): Promise<void> {
  const sql = db();
  await sql`
    INSERT INTO rule_watermarks (corridor_id, fingerprint) VALUES (${corridorId}, ${fingerprint})
    ON CONFLICT (corridor_id) DO UPDATE SET fingerprint = EXCLUDED.fingerprint, checked_at = NOW()
  `;
}

// --- rule overlays and the audit log (FR-ADM-01, FR-ADM-02) ----------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function toOverlay(r: any): RuleOverlay {
  return {
    id: r.id,
    ruleId: r.rule_id,
    corridorId: r.corridor_id,
    version: Number(r.version),
    action: r.action as OverlayAction,
    payload: r.payload as RegulatoryRule,
    status: r.status as OverlayStatus,
    note: r.note,
    createdBy: r.created_by,
    createdByName: r.created_by_name ?? 'Unknown',
    createdAt: new Date(r.created_at).toISOString(),
    publishedBy: r.published_by,
    publishedByName: r.published_by_name ?? null,
    publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const OVERLAY_SELECT = `
  SELECT o.*,
         c.display_name AS created_by_name,
         p.display_name AS published_by_name
  FROM rule_overlays o
  LEFT JOIN users c ON c.id = o.created_by
  LEFT JOIN users p ON p.id = o.published_by
`;

/** Every overlay, newest first — what the administration page lists. */
export async function listOverlays(): Promise<RuleOverlay[]> {
  const sql = db();
  const rows = await sql.unsafe(`${OVERLAY_SELECT} ORDER BY o.created_at DESC LIMIT 300`);
  return rows.map(toOverlay);
}

/**
 * Published overlays only — what the engines merge over the JSON base.
 *
 * Pages call this and pass the result in, the same way they pass live border
 * reports, so the engines stay free of I/O.
 */
export async function publishedOverlays(): Promise<RuleOverlay[]> {
  const sql = db();
  const rows = await sql.unsafe(`${OVERLAY_SELECT} WHERE o.status = 'published'`);
  return rows.map(toOverlay);
}

export async function getOverlay(id: string): Promise<RuleOverlay | null> {
  const sql = db();
  const rows = await sql.unsafe(`${OVERLAY_SELECT} WHERE o.id = $1`, [id]);
  return rows[0] ? toOverlay(rows[0]) : null;
}

/** FR-ADM-01 — record a change as a new version. It changes nothing until published. */
export async function createOverlay(input: {
  ruleId: string; corridorId: string; version: number; action: OverlayAction;
  payload: RegulatoryRule; note: string; createdBy: string;
}): Promise<string> {
  const sql = db();
  const id = newId();
  await sql`
    INSERT INTO rule_overlays (id, rule_id, corridor_id, version, action, payload, note, created_by)
    VALUES (${id}, ${input.ruleId}, ${input.corridorId}, ${input.version}, ${input.action},
            ${sql.json(input.payload as never)}, ${input.note.trim().slice(0, 400)}, ${input.createdBy})
  `;
  return id;
}

export async function discardDraft(overlayId: string): Promise<boolean> {
  const sql = db();
  const rows = await sql`DELETE FROM rule_overlays WHERE id = ${overlayId} AND status = 'draft' RETURNING id`;
  return rows.length > 0;
}

/**
 * FR-ADM-02 — the explicit publication step.
 *
 * Publishing supersedes any earlier published overlay for the same rule, so the
 * history stays readable: one live version, and everything it replaced marked as
 * such rather than deleted.
 */
export async function publishOverlay(overlayId: string, publisherId: string): Promise<RuleOverlay | null> {
  const sql = db();
  const target = await getOverlay(overlayId);
  if (!target || target.status !== 'draft') return null;

  await sql`
    UPDATE rule_overlays SET status = 'superseded'
    WHERE rule_id = ${target.ruleId} AND status = 'published'
  `;
  await sql`
    UPDATE rule_overlays SET status = 'published', published_by = ${publisherId}, published_at = NOW()
    WHERE id = ${overlayId}
  `;
  return getOverlay(overlayId);
}

export async function writeAudit(input: {
  actorId: string; actorName: string; action: string; subject: string; detail?: string;
}): Promise<void> {
  const sql = db();
  await sql`
    INSERT INTO audit_log (id, actor_id, actor_name, action, subject, detail)
    VALUES (${newId()}, ${input.actorId}, ${input.actorName}, ${input.action},
            ${input.subject}, ${(input.detail ?? '').slice(0, 600)})
  `;
}

export async function listAudit(limit = 60): Promise<AuditEntry[]> {
  const sql = db();
  const rows = await sql`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ${limit}`;
  return rows.map((r) => ({
    id: r.id,
    actorId: r.actor_id,
    actorName: r.actor_name,
    action: r.action,
    subject: r.subject,
    detail: r.detail,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

// --- reporting (FR-RPT-01, FR-RPT-02) --------------------------------------

/** FR-RPT-01 — one round trip for the whole operational picture. */
export async function operationalMetrics(): Promise<OperationalMetrics> {
  const sql = db();
  const rows = await sql`
    SELECT
      (SELECT COUNT(*) FROM users)::int AS registrations,
      (SELECT COUNT(*) FROM users WHERE verified_by_admin)::int AS verified_accounts,
      (SELECT COUNT(DISTINCT user_id) FROM sessions WHERE created_at > NOW() - INTERVAL '30 days')::int AS active_users_30d,
      (SELECT COUNT(*) FROM shipments)::int AS shipments_created,
      (SELECT COUNT(*) FROM shipments WHERE status = 'delivered')::int AS shipments_delivered,
      (SELECT COUNT(*) FROM checklist_progress)::int AS checklist_items_obtained,
      (SELECT COUNT(*) FROM border_reports)::int AS border_reports,
      (SELECT COUNT(*) FROM transport_requests)::int AS transport_requests,
      (SELECT COUNT(*) FROM market_listings WHERE active)::int AS market_listings,
      (SELECT COUNT(*) FROM users WHERE role = 'provider')::int AS providers
  `;
  const r = rows[0];
  return {
    registrations: r.registrations,
    verifiedAccounts: r.verified_accounts,
    activeUsers30d: r.active_users_30d,
    shipmentsCreated: r.shipments_created,
    shipmentsDelivered: r.shipments_delivered,
    checklistItemsObtained: r.checklist_items_obtained,
    borderReports: r.border_reports,
    transportRequests: r.transport_requests,
    marketListings: r.market_listings,
    providers: r.providers,
  };
}

/** FR-RPT-02 — what a trader recorded a delivered shipment actually cost. */
export async function recordActualCost(
  shipmentId: string, userId: string, actualUsd: number, note: string,
): Promise<boolean> {
  const sql = db();
  const rows = await sql`
    UPDATE shipments
    SET actual_cost_usd = ${actualUsd}, actual_cost_note = ${note.trim().slice(0, 400)}, actual_recorded_at = NOW()
    WHERE id = ${shipmentId} AND user_id = ${userId} AND status = 'delivered'
    RETURNING id
  `;
  return rows.length > 0;
}

export async function getActualCost(
  shipmentId: string,
): Promise<{ actualUsd: number; note: string; recordedAt: string } | null> {
  const sql = db();
  const rows = await sql`
    SELECT actual_cost_usd, actual_cost_note, actual_recorded_at FROM shipments WHERE id = ${shipmentId}
  `;
  const r = rows[0];
  if (!r || r.actual_cost_usd === null) return null;
  return {
    actualUsd: Number(r.actual_cost_usd),
    note: r.actual_cost_note,
    recordedAt: new Date(r.actual_recorded_at).toISOString(),
  };
}

/** Every shipment with a recorded outcome, for the accuracy report. */
export async function shipmentsWithOutcomes(): Promise<{ shipment: Shipment; actualUsd: number; recordedAt: string }[]> {
  const sql = db();
  const rows = await sql`
    SELECT * FROM shipments WHERE actual_cost_usd IS NOT NULL ORDER BY actual_recorded_at DESC LIMIT 200
  `;
  return rows.map((r) => ({
    shipment: toShipment(r),
    actualUsd: Number(r.actual_cost_usd),
    recordedAt: new Date(r.actual_recorded_at).toISOString(),
  }));
}

// --- NFR-PRI-03: export everything held about one person --------------------

/**
 * Everything the system holds about a user, as JSON they can keep.
 *
 * Law No. 058/2021 gives a data subject the right of access; this is that right,
 * made a button rather than a letter. What is deliberately NOT in the export is
 * listed in the export itself — a password hash would be useless and dangerous to
 * hand over, and a border report belongs to the traders who relied on it as much as
 * to the person who filed it.
 */
export async function exportPersonalData(userId: string): Promise<PersonalDataExport> {
  const sql = db();

  const [acct] = await sql`SELECT * FROM users WHERE id = ${userId}`;
  const shipments = await sql`SELECT id, corridor_id, product_id, quantity, declared_value, currency, status, created_at, actual_cost_usd FROM shipments WHERE user_id = ${userId}`;
  const reports = await sql`SELECT id, crossing_id, category, wait_minutes, note, reported_at FROM border_reports WHERE user_id = ${userId}`;
  const offerings = await sql`SELECT * FROM transport_offerings WHERE provider_id = ${userId}`;
  const requests = await sql`SELECT id, shipment_id, status, quoted_usd, message, created_at FROM transport_requests WHERE trader_id = ${userId} OR provider_id = ${userId}`;
  const listings = await sql`SELECT * FROM market_listings WHERE user_id = ${userId}`;
  const enquiries = await sql`SELECT id, listing_id, message, status, created_at FROM market_enquiries WHERE from_user_id = ${userId} OR to_user_id = ${userId}`;
  const subs = await sql`SELECT * FROM notification_subscriptions WHERE user_id = ${userId}`;
  const notes = await sql`SELECT id, kind, title, body, created_at, read_at FROM notifications WHERE user_id = ${userId}`;

  const plain = (rows: readonly unknown[]) => rows.map((r) => ({ ...(r as object) })) as Record<string, unknown>[];

  return {
    exportedAt: new Date().toISOString(),
    account: {
      id: acct?.id,
      phone: acct?.phone,
      displayName: acct?.display_name,
      role: acct?.role,
      preferredLanguage: acct?.preferred_language,
      phoneVerifiedAt: acct?.phone_verified_at,
      verifiedByAdmin: acct?.verified_by_admin,
      createdAt: acct?.created_at,
    },
    profile: {
      businessName: acct?.business_name,
      homeCorridorId: acct?.home_corridor_id,
      principalProducts: acct?.principal_products,
    },
    shipments: plain(shipments),
    borderReports: plain(reports),
    transportOfferings: plain(offerings),
    transportRequests: plain(requests),
    marketListings: plain(listings),
    marketEnquiries: plain(enquiries),
    subscriptions: plain(subs),
    notifications: plain(notes),
    notIncluded: [
      {
        what: 'Your password',
        why: 'It is stored only as a salted scrypt hash, which cannot be turned back into your password. Handing you the hash would help nobody and endanger you.',
      },
      {
        what: 'Session identifiers',
        why: 'They are credentials. Exporting them would let anyone holding this file sign in as you.',
      },
      {
        what: "Other people's messages to you, in full",
        why: 'An enquiry you received is also personal data about the person who sent it. You see what they wrote to you; their account details are theirs to export.',
      },
    ],
  };
}

// --- NFR-PRI-03: deletion requests ------------------------------------------

export class AlreadyRequestedDeletionError extends Error {}

export async function requestDeletion(userId: string, reason: string): Promise<void> {
  const sql = db();
  const open = await sql`SELECT id FROM deletion_requests WHERE user_id = ${userId} AND status = 'open'`;
  if (open.length > 0) throw new AlreadyRequestedDeletionError();
  await sql`
    INSERT INTO deletion_requests (id, user_id, reason)
    VALUES (${newId()}, ${userId}, ${reason.trim().slice(0, 600)})
  `;
}

export async function openDeletionRequest(userId: string): Promise<DeletionRequest | null> {
  const sql = db();
  const rows = await sql`
    SELECT d.*, u.display_name, u.phone FROM deletion_requests d
    JOIN users u ON u.id = d.user_id
    WHERE d.user_id = ${userId} AND d.status = 'open' LIMIT 1
  `;
  return rows[0] ? toDeletionRequest(rows[0]) : null;
}

export async function listDeletionRequests(): Promise<DeletionRequest[]> {
  const sql = db();
  const rows = await sql`
    SELECT d.*, u.display_name, u.phone FROM deletion_requests d
    JOIN users u ON u.id = d.user_id
    ORDER BY d.created_at DESC LIMIT 100
  `;
  return rows.map(toDeletionRequest);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toDeletionRequest(r: any): DeletionRequest {
  return {
    id: r.id,
    userId: r.user_id,
    userName: r.display_name,
    userPhone: r.phone,
    reason: r.reason,
    status: r.status as RequestStatus,
    response: r.response,
    handledBy: r.handled_by,
    handledAt: r.handled_at ? new Date(r.handled_at).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

function toContentReport(r: any): ContentReport {
  return {
    id: r.id,
    userId: r.user_id,
    reporterName: r.display_name ?? 'Anonymous',
    ruleId: r.rule_id,
    corridorId: r.corridor_id,
    whatIsWrong: r.what_is_wrong,
    source: r.source,
    status: r.status as ContentReport['status'],
    response: r.response,
    handledBy: r.handled_by,
    handledAt: r.handled_at ? new Date(r.handled_at).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function resolveDeletionRequest(
  requestId: string, adminId: string, status: 'completed' | 'refused', response: string,
): Promise<DeletionRequest | null> {
  const sql = db();
  const rows = await sql`
    UPDATE deletion_requests
    SET status = ${status}, response = ${response.trim().slice(0, 600)},
        handled_by = ${adminId}, handled_at = NOW()
    WHERE id = ${requestId} AND status = 'open'
    RETURNING user_id
  `;
  if (rows.length === 0) return null;
  const all = await listDeletionRequests();
  return all.find((d) => d.id === requestId) ?? null;
}

// --- NFR-LEG-04: report regulatory content believed to be wrong -------------

export async function reportContent(input: {
  userId: string | null; ruleId: string; corridorId: string;
  whatIsWrong: string; source: string;
}): Promise<void> {
  const sql = db();
  await sql`
    INSERT INTO accuracy_reports (id, user_id, rule_id, corridor_id, what_is_wrong, source)
    VALUES (${newId()}, ${input.userId}, ${input.ruleId.trim()}, ${input.corridorId},
            ${input.whatIsWrong.trim().slice(0, 1000)}, ${input.source.trim().slice(0, 400)})
  `;
}

export async function listContentReports(): Promise<ContentReport[]> {
  const sql = db();
  const rows = await sql`
    SELECT a.*, u.display_name FROM accuracy_reports a
    LEFT JOIN users u ON u.id = a.user_id
    ORDER BY a.created_at DESC LIMIT 100
  `;
  return rows.map(toContentReport);
}

export async function resolveContentReport(
  reportId: string, adminId: string, status: 'accepted' | 'rejected', response: string,
): Promise<ContentReport | null> {
  const sql = db();
  const rows = await sql`
    UPDATE accuracy_reports
    SET status = ${status}, response = ${response.trim().slice(0, 600)},
        handled_by = ${adminId}, handled_at = NOW()
    WHERE id = ${reportId} AND status = 'open'
    RETURNING id, user_id
  `;
  if (rows.length === 0) return null;
  const all = await listContentReports();
  return all.find((r) => r.id === reportId) ?? null;
}

export async function openReportCounts(): Promise<{ deletions: number; content: number }> {
  const sql = db();
  const rows = await sql`
    SELECT (SELECT COUNT(*) FROM deletion_requests WHERE status = 'open')::int AS deletions,
           (SELECT COUNT(*) FROM accuracy_reports WHERE status = 'open')::int AS content
  `;
  return { deletions: rows[0].deletions, content: rows[0].content };
}
