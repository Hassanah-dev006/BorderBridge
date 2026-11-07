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
} from './auth';
import type {
  BorderReport, Language, Milestone, OfferingWithProvider, ProviderRating,
  RequestDetail, Session, Shipment, ShipmentStatus, ThrottleState, TradePlan,
  TransportRequestStatus, User, UserRole,
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

export async function getSessionUser(sessionId: string): Promise<User | null> {
  const sql = db();
  const rows = await sql`
    SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ${sessionId} AND s.expires_at > NOW() LIMIT 1
  `;
  return rows[0] ? toUser(rows[0]) : null;
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
