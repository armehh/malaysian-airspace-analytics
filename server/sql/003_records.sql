-- Rekod kekal "semua masa": satu baris bagi setiap pesawat (icao24) bagi setiap metrik.
-- observations dipadam selepas 30 hari, jadi rekod terbaik disimpan di sini. Diisi oleh maintenance.
-- altitude = meter, speed = km/j.
CREATE TABLE IF NOT EXISTS records (
  metric      TEXT NOT NULL CHECK (metric IN ('altitude', 'speed')),
  icao24      TEXT NOT NULL,
  value       REAL NOT NULL,
  callsign    TEXT,
  airline     TEXT,
  observed_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (metric, icao24)
);
CREATE INDEX IF NOT EXISTS idx_records_value ON records (metric, value DESC);
