-- Smarties D1 schema. Re-runnable: drops + recreates.
-- Stage codes (trips.stage):
--   0 Application sent
--   1 Confirmed by provider
--   2 Driver assigned
--   3 En route to pickup
--   4 Senior boarded
--   5 Arrived at hospital

DROP TABLE IF EXISTS redeemed_codes;
DROP TABLE IF EXISTS trip_events;
DROP TABLE IF EXISTS trips;
DROP TABLE IF EXISTS providers;
DROP TABLE IF EXISTS seniors;
DROP TABLE IF EXISTS caregivers;

CREATE TABLE caregivers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  phone       TEXT,
  language    TEXT NOT NULL DEFAULT 'en',
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE seniors (
  id              TEXT PRIMARY KEY,
  caregiver_id    TEXT NOT NULL REFERENCES caregivers(id),
  name            TEXT NOT NULL,
  age             INTEGER NOT NULL,
  relation        TEXT,
  mobility        TEXT,                          -- mobIndep | mobHelp | mobChair
  conditions_json TEXT NOT NULL DEFAULT '[]',    -- JSON array of strings
  home_address    TEXT,
  postal_code     TEXT,
  citizenship     TEXT,                          -- sg | pr | none
  income_band     TEXT,                          -- inc1 | inc2 | inc3 | inc4
  -- sha256(NRIC).slice(0,32) — used for binding signed AIC subsidy codes
  -- to a specific senior. We never store raw NRIC.
  nric_hash       TEXT,
  -- Cached eligibility verdict (re-computed when answers change).
  subsidy_pct     INTEGER,
  copay_low       INTEGER,
  copay_high      INTEGER,
  eligibility_at  TEXT
);
CREATE INDEX idx_seniors_caregiver ON seniors(caregiver_id);

CREATE TABLE providers (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  initials         TEXT NOT NULL,
  bg_color         TEXT NOT NULL,
  fg_color         TEXT NOT NULL,
  serves           TEXT NOT NULL,                -- human-readable areas
  serves_postcodes TEXT NOT NULL DEFAULT '[]',   -- JSON: 2-digit postal prefixes
  copay_low        INTEGER NOT NULL,
  copay_high       INTEGER NOT NULL,
  response_min     INTEGER NOT NULL,
  note             TEXT,
  phone            TEXT
);

CREATE TABLE trips (
  id                TEXT PRIMARY KEY,
  reference         TEXT NOT NULL UNIQUE,        -- e.g. MET-2A4F19
  caregiver_id      TEXT NOT NULL REFERENCES caregivers(id),
  senior_id         TEXT NOT NULL REFERENCES seniors(id),
  provider_id       TEXT REFERENCES providers(id),
  status            TEXT NOT NULL DEFAULT 'pending',  -- pending|confirmed|in_progress|completed|cancelled
  stage             INTEGER NOT NULL DEFAULT 0,
  home_address      TEXT NOT NULL,
  hospital_name     TEXT NOT NULL,
  hospital_address  TEXT,
  pickup_at         TEXT NOT NULL,               -- ISO 8601
  arrives_at        TEXT,
  driver_name       TEXT,
  driver_vehicle    TEXT,
  driver_plate      TEXT,
  escort_name       TEXT,
  copay             INTEGER,
  grab_low          INTEGER,
  grab_high         INTEGER,
  notify_home_safe  INTEGER NOT NULL DEFAULT 0,  -- 0|1
  created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_trips_caregiver ON trips(caregiver_id);
CREATE INDEX idx_trips_senior    ON trips(senior_id);
CREATE INDEX idx_trips_status    ON trips(status);

-- Redeemed AIC subsidy codes — replay protection. The jti from each
-- successfully-redeemed signed payload is stored here so the same code
-- can't be redeemed twice (even if a different caregiver tries).
CREATE TABLE redeemed_codes (
  jti                    TEXT PRIMARY KEY,
  redeemed_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  redeemed_by_caregiver  TEXT REFERENCES caregivers(id),
  applied_to_senior      TEXT REFERENCES seniors(id),
  tier                   INTEGER
);

CREATE TABLE trip_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id     TEXT NOT NULL REFERENCES trips(id),
  stage       INTEGER NOT NULL,
  status      TEXT NOT NULL,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note        TEXT
);
CREATE INDEX idx_events_trip ON trip_events(trip_id);
