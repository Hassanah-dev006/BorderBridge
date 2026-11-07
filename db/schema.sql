-- BorderBridge schema.
--
-- Only mutable, user-generated state lives here. The regulatory knowledge base stays
-- in data/*.json, because SRS constraint C1 requires rules to be data a trained
-- non-developer can amend, not rows behind an admin login (NFR-MNT-03).
--
-- Applied by: npm run db:migrate   (safe to re-run; every statement is guarded)

CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  phone             TEXT NOT NULL UNIQUE,          -- FR-ACC-01: phone is the primary identifier
  display_name      TEXT NOT NULL,
  role              TEXT NOT NULL DEFAULT 'trader' -- trader | provider | admin
                    CHECK (role IN ('trader', 'provider', 'admin')),
  preferred_language TEXT NOT NULL DEFAULT 'en'
                    CHECK (preferred_language IN ('en', 'fr', 'sw', 'rw')),
  password_hash     TEXT NOT NULL,                 -- scrypt, salted; never the password
  phone_verified_at TIMESTAMPTZ,                   -- FR-ACC-02: null until the code is confirmed
  verified_by_admin BOOLEAN NOT NULL DEFAULT FALSE,-- FR-ACC-06: provider/buyer verification badge
  -- FR-ACC-05: reusable profile, so a trader states their details once
  business_name     TEXT,
  home_corridor_id  TEXT,
  principal_products TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL CHECK (purpose IN ('verify-phone', 'recover-access')),
  code_hash   TEXT NOT NULL,   -- hashed: a leaked table must not hand out valid codes
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,     -- single use (FR-ACC-02)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS otp_codes_user_idx ON otp_codes (user_id, purpose);

-- FR-ACC-03: rate limiting with progressive delay. One row per attempt, so the
-- delay is derived from history rather than held in memory (which would reset on
-- every serverless cold start).
CREATE TABLE IF NOT EXISTS login_attempts (
  id          BIGSERIAL PRIMARY KEY,
  phone       TEXT NOT NULL,
  successful  BOOLEAN NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS login_attempts_phone_idx ON login_attempts (phone, attempted_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

-- FR-SHP-01: the planning snapshot is immutable. The whole trade plan is frozen as
-- JSONB at creation, so that what the trader was told at planning time stays
-- recoverable even after the underlying rules are amended (NFR-ACC-05).
CREATE TABLE IF NOT EXISTS shipments (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  corridor_id   TEXT NOT NULL,
  product_id    TEXT NOT NULL,
  quantity      NUMERIC NOT NULL,
  declared_value NUMERIC NOT NULL,
  currency      TEXT NOT NULL,
  plan_snapshot JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'planned'
                CHECK (status IN ('planned','documents-ready','in-transit','at-border','cleared','delivered','cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS shipments_user_idx ON shipments (user_id, created_at DESC);

-- FR-SHP-02: milestone history, append-only. Status on the shipment is the latest
-- row here; keeping both lets the trader see when each stage was reached.
CREATE TABLE IF NOT EXISTS shipment_milestones (
  id          TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  status      TEXT NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS shipment_milestones_idx ON shipment_milestones (shipment_id, recorded_at);

-- Which documents from the frozen checklist the trader has actually obtained.
CREATE TABLE IF NOT EXISTS checklist_progress (
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  rule_id     TEXT NOT NULL,
  obtained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (shipment_id, rule_id)
);

-- FR-BRD-03: community condition reports. These feed the ranking in src/lib/border.ts,
-- where FR-BRD-05 decays their weight to zero over twelve hours.
CREATE TABLE IF NOT EXISTS border_reports (
  id          TEXT PRIMARY KEY,
  crossing_id TEXT NOT NULL,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  category    TEXT NOT NULL CHECK (category IN ('normal','busy','severe-delay','closed')),
  wait_minutes INTEGER NOT NULL CHECK (wait_minutes >= 0 AND wait_minutes <= 2880),
  note        TEXT NOT NULL DEFAULT '',
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS border_reports_crossing_idx ON border_reports (crossing_id, reported_at DESC);

-- ---------------------------------------------------------------------------
-- Transport (FR-TRN-01, FR-TRN-02)
-- ---------------------------------------------------------------------------

-- FR-TRN-01: what a verified transport provider publishes about their service.
-- One offering per provider per corridor, so a provider serving both directions
-- publishes two.
CREATE TABLE IF NOT EXISTS transport_offerings (
  id             TEXT PRIMARY KEY,
  provider_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  corridor_id    TEXT NOT NULL,
  vehicle_type   TEXT NOT NULL,
  capacity_kg    INTEGER NOT NULL CHECK (capacity_kg > 0 AND capacity_kg <= 60000),
  product_classes TEXT[] NOT NULL DEFAULT '{}',
  permits        TEXT NOT NULL DEFAULT '',
  rate_per_kg    NUMERIC NOT NULL CHECK (rate_per_kg >= 0),
  minimum_charge NUMERIC NOT NULL DEFAULT 0 CHECK (minimum_charge >= 0),
  base_location  TEXT NOT NULL DEFAULT '',
  notes          TEXT NOT NULL DEFAULT '',
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider_id, corridor_id)
);
CREATE INDEX IF NOT EXISTS transport_offerings_corridor_idx ON transport_offerings (corridor_id, active);

-- FR-TRN-02: a trader's request against one offering, and the provider's answer.
-- One live request per shipment per offering, so a trader cannot spam the same
-- provider about the same consignment.
CREATE TABLE IF NOT EXISTS transport_requests (
  id          TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  offering_id TEXT NOT NULL REFERENCES transport_offerings(id) ON DELETE CASCADE,
  trader_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'sent'
              CHECK (status IN ('sent', 'accepted', 'declined', 'withdrawn')),
  quoted_usd  NUMERIC NOT NULL CHECK (quoted_usd >= 0),
  message     TEXT NOT NULL DEFAULT '',
  responded_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shipment_id, offering_id)
);
CREATE INDEX IF NOT EXISTS transport_requests_provider_idx ON transport_requests (provider_id, status);
CREATE INDEX IF NOT EXISTS transport_requests_shipment_idx ON transport_requests (shipment_id);

-- Feeds the "ranked by rating" half of FR-TRN-02. One rating per shipment, left
-- by the trader after the goods are delivered, so a rating always corresponds to
-- a movement that actually happened.
CREATE TABLE IF NOT EXISTS provider_ratings (
  id          TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trader_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stars       INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
  comment     TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shipment_id)
);
CREATE INDEX IF NOT EXISTS provider_ratings_provider_idx ON provider_ratings (provider_id);
