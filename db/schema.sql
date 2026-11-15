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

-- ---------------------------------------------------------------------------
-- Marketplace (FR-MKT-01, FR-MKT-02, FR-MKT-03)
-- ---------------------------------------------------------------------------

-- FR-MKT-01: what a verified user wishes to buy or sell.
CREATE TABLE IF NOT EXISTS market_listings (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('selling', 'buying')),
  product_id     TEXT NOT NULL,
  -- The market this listing sits in: where the goods are, or are wanted.
  country        TEXT NOT NULL,
  location       TEXT NOT NULL DEFAULT '',
  quantity       NUMERIC CHECK (quantity IS NULL OR quantity > 0),
  unit           TEXT NOT NULL DEFAULT '',
  price_per_unit NUMERIC CHECK (price_per_unit IS NULL OR price_per_unit >= 0),
  currency       TEXT NOT NULL DEFAULT 'USD',
  note           TEXT NOT NULL DEFAULT '',
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  -- A listing goes stale: a price from three months ago misleads rather than helps.
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, kind, product_id, country)
);
CREATE INDEX IF NOT EXISTS market_listings_idx ON market_listings (country, product_id, active);

-- FR-MKT-03: an enquiry carries a message, never a phone number. Contact details
-- are released only when the listing owner accepts — the same rule the transport
-- module applies, so neither party is exposed by merely being listed.
CREATE TABLE IF NOT EXISTS market_enquiries (
  id           TEXT PRIMARY KEY,
  listing_id   TEXT NOT NULL REFERENCES market_listings(id) ON DELETE CASCADE,
  from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message      TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'sent'
               CHECK (status IN ('sent', 'accepted', 'declined')),
  responded_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (listing_id, from_user_id)
);
CREATE INDEX IF NOT EXISTS market_enquiries_to_idx ON market_enquiries (to_user_id, status);
CREATE INDEX IF NOT EXISTS market_enquiries_from_idx ON market_enquiries (from_user_id);

-- ---------------------------------------------------------------------------
-- Notifications (FR-NOT-01, FR-NOT-02)
-- ---------------------------------------------------------------------------

-- FR-NOT-01: what a user has asked to hear about. Any field may be null, meaning
-- "all of them" — a subscription with every field null is everything on the system.
CREATE TABLE IF NOT EXISTS notification_subscriptions (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  corridor_id      TEXT,
  crossing_id      TEXT,
  product_category TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, corridor_id, crossing_id, product_category)
);
CREATE INDEX IF NOT EXISTS notification_subscriptions_user_idx ON notification_subscriptions (user_id);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('rule-change', 'border', 'transport', 'market', 'shipment')),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  link       TEXT NOT NULL DEFAULT '',
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);

-- FR-NOT-02: the knowledge base is a file, so a change is detected by comparing a
-- fingerprint of the rules for a corridor against the last one we told people about.
-- Storing the mark here rather than in the file keeps the file hand-editable.
CREATE TABLE IF NOT EXISTS rule_watermarks (
  corridor_id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  -- The signatures behind that fingerprint, so a change can be described and not
  -- merely detected: "VAT on imports was amended", not "something changed".
  snapshot    JSONB NOT NULL DEFAULT '[]',
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Rule management (FR-ADM-01, FR-ADM-02, FR-ADM-03)
-- ---------------------------------------------------------------------------

-- There is a real tension here. Constraint C1 says the knowledge base is data a
-- trained non-developer can amend — a JSON file in version control. FR-ADM-01 says
-- an administrator creates, amends and retires rules through the interface. A
-- deployed application cannot write to its own source, so the two cannot both be
-- satisfied by editing that file at runtime.
--
-- The resolution: data/rules.json stays the base knowledge base, hand-editable and
-- reviewable in version control. The interface writes OVERLAYS here — versioned
-- amendments that sit on top of the base. A published overlay wins over the base
-- rule of the same id; a retire overlay removes it. Nothing is ever edited in
-- place, which is NFR-ACC-05.
CREATE TABLE IF NOT EXISTS rule_overlays (
  id           TEXT PRIMARY KEY,
  rule_id      TEXT NOT NULL,
  corridor_id  TEXT NOT NULL,
  version      INTEGER NOT NULL CHECK (version > 0),
  action       TEXT NOT NULL CHECK (action IN ('create', 'amend', 'retire')),
  -- The whole rule as it should read once published. A retire overlay keeps the
  -- payload too, so the record of what was withdrawn survives.
  payload      JSONB NOT NULL,
  -- FR-ADM-02: a draft changes nothing a trader sees until it is published.
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'published', 'superseded')),
  note         TEXT NOT NULL DEFAULT '',
  created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  UNIQUE (rule_id, version)
);
CREATE INDEX IF NOT EXISTS rule_overlays_live_idx ON rule_overlays (corridor_id, status);

-- FR-ADM-02: the publication step is recorded. The actor's name is copied in rather
-- than only referenced, so deleting an account does not erase who published a change
-- to the law a trader relied on.
CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY,
  actor_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL,
  action     TEXT NOT NULL,
  subject    TEXT NOT NULL,
  detail     TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_log_idx ON audit_log (created_at DESC);

-- ---------------------------------------------------------------------------
-- Reporting (FR-RPT-02)
-- ---------------------------------------------------------------------------

-- What the movement actually cost, recorded by the trader after delivery. Without
-- this, "estimate accuracy" has nothing to measure against.
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS actual_cost_usd NUMERIC
  CHECK (actual_cost_usd IS NULL OR actual_cost_usd >= 0);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS actual_cost_note TEXT NOT NULL DEFAULT '';
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS actual_recorded_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- Data subject rights and content accuracy (NFR-PRI-03, NFR-LEG-04)
-- ---------------------------------------------------------------------------

-- NFR-PRI-03: a user may request deletion of the data held about them. The request
-- is recorded rather than acted on instantly, because some of it cannot simply be
-- erased: a border report other traders relied on, or an audit entry showing who
-- changed a rule, are records about events rather than about a person. The request
-- gives an administrator the obligation and the decision.
CREATE TABLE IF NOT EXISTS deletion_requests (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'open'
               CHECK (status IN ('open', 'completed', 'refused')),
  response     TEXT NOT NULL DEFAULT '',
  handled_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  handled_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, status)
);

-- NFR-LEG-04: a documented channel through which a user may report regulatory
-- content they believe to be wrong. The whole system rests on citing its sources;
-- a way to contest them is the other half of that promise.
CREATE TABLE IF NOT EXISTS accuracy_reports (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  rule_id     TEXT NOT NULL DEFAULT '',
  corridor_id TEXT NOT NULL DEFAULT '',
  what_is_wrong TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'open'
              CHECK (status IN ('open', 'accepted', 'rejected')),
  response    TEXT NOT NULL DEFAULT '',
  handled_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  handled_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS accuracy_reports_idx ON accuracy_reports (status, created_at DESC);

-- NFR-LEG-01: "shall record the user's acceptance with a timestamp and version
-- reference". A row per acceptance rather than a column on users, because the
-- question that gets asked later is not "did they agree?" but "what did they agree
-- to, and when?" — and that needs the history, not the latest value.
--
-- The language is recorded too. A trader who accepted the notice in French accepted
-- the French wording, and if the two ever diverge, the record says which one they
-- actually read.
CREATE TABLE IF NOT EXISTS terms_acceptances (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version     TEXT NOT NULL,
  language    TEXT NOT NULL CHECK (language IN ('en', 'fr', 'sw', 'rw')),
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Accepting the same version twice is the same fact, not two facts.
  UNIQUE (user_id, version)
);
CREATE INDEX IF NOT EXISTS terms_acceptances_user_idx
  ON terms_acceptances (user_id, accepted_at DESC);
