-- Fasa 4: ringkasan setiap jam. airport '*' = semua pesawat. Diisi oleh /api/maintenance.
CREATE TABLE IF NOT EXISTS hourly_stats (
  hour          TIMESTAMPTZ NOT NULL,
  airport       TEXT NOT NULL,
  snapshots     INT NOT NULL,
  aircraft_sum  BIGINT NOT NULL,
  peak_aircraft INT NOT NULL,
  PRIMARY KEY (hour, airport)
);
CREATE INDEX IF NOT EXISTS idx_hourly_apt ON hourly_stats (airport, hour);