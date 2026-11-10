-- Fasa 1: skema asas. Setiap larian collector = 1 baris snapshots + N baris observations.

CREATE TABLE IF NOT EXISTS snapshots (
  id             BIGSERIAL PRIMARY KEY,
  taken_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  source         TEXT NOT NULL,
  aircraft_count INT  NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snap_time ON snapshots (taken_at);

CREATE TABLE IF NOT EXISTS observations (
  id          BIGSERIAL PRIMARY KEY,
  snapshot_id BIGINT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  taken_at    TIMESTAMPTZ NOT NULL,          -- salinan masa snapshot (query julat masa laju)
  icao24      TEXT NOT NULL,
  callsign    TEXT,
  airline     TEXT,
  lat         REAL,
  lng         REAL,
  alt_m       REAL,
  vel_ms      REAL,
  hdg         REAL,
  vr          REAL,
  nearest_apt TEXT
);
CREATE INDEX IF NOT EXISTS idx_obs_time    ON observations (taken_at);
CREATE INDEX IF NOT EXISTS idx_obs_airline ON observations (airline, taken_at);
CREATE INDEX IF NOT EXISTS idx_obs_apt     ON observations (nearest_apt, taken_at);
CREATE INDEX IF NOT EXISTS idx_obs_snap    ON observations (snapshot_id);

-- Log setiap larian (berjaya/gagal) supaya jurang data dapat dikesan,
-- dan carta tidak tersalah anggap "tiada data" sebagai "0 pesawat".
CREATE TABLE IF NOT EXISTS collector_runs (
  id          BIGSERIAL PRIMARY KEY,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ok          BOOLEAN NOT NULL,
  source      TEXT,
  aircraft    INT,
  duration_ms INT,
  error       TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_time ON collector_runs (started_at);
