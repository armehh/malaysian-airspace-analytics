-- Fasa 4b: bukti "sebelum dan selepas" untuk /api/stats/hourly.
-- Jalankan SATU blok pada satu masa dalam Neon SQL Editor (pilih blok, klik Run).
-- Untuk julat lain, tukar '7 days' (contoh '30 days') dan 'KUL' (atau NULL untuk semua pesawat)
-- pada KEDUA-DUA blok. Jalankan setiap blok 2 hingga 3 kali dan catat Execution Time yang terendah
-- (larian pertama mungkin lambat kerana cache sejuk). Catat juga "Buffers: shared hit/read".

-- ===== SEBELUM: query lama, membaca observations (data mentah) =====
EXPLAIN (ANALYZE, BUFFERS)
WITH s AS (SELECT id, taken_at FROM snapshots
           WHERE taken_at >= now() - interval '7 days' AND taken_at < now()),
c AS (SELECT snapshot_id, count(*) AS n FROM observations
      WHERE taken_at >= now() - interval '7 days' AND taken_at < now()
        AND ('KUL'::text IS NULL OR nearest_apt = 'KUL'::text)
      GROUP BY snapshot_id)
SELECT to_char(date_trunc('hour', s.taken_at AT TIME ZONE 'Asia/Kuala_Lumpur'), 'YYYY-MM-DD"T"HH24:MI') AS hour_myt,
       avg(coalesce(c.n, 0))::float AS avg_aircraft, max(coalesce(c.n, 0))::int AS peak_aircraft, count(*)::int AS snapshots
FROM s LEFT JOIN c ON c.snapshot_id = s.id
GROUP BY date_trunc('hour', s.taken_at AT TIME ZONE 'Asia/Kuala_Lumpur') ORDER BY 1;

-- ===== SELEPAS: query baru, membaca hourly_stats (+ data mentah hanya untuk hujung julat yang belum diringkaskan) =====
EXPLAIN (ANALYZE, BUFFERS)
WITH tot AS (
  SELECT hour, snapshots FROM hourly_stats
  WHERE airport = '*' AND hour >= now() - interval '7 days' AND hour + interval '1 hour' <= now()),
bounds AS (
  SELECT coalesce(min(hour), now()) AS lo, coalesce(max(hour) + interval '1 hour', now()) AS hi FROM tot),
sel AS (
  SELECT t.hour, t.snapshots, coalesce(a.aircraft_sum, 0)::bigint AS sum_c, coalesce(a.peak_aircraft, 0)::int AS peak
  FROM tot t LEFT JOIN hourly_stats a ON a.hour = t.hour AND a.airport = coalesce('KUL'::text, '*')),
s AS (SELECT id, taken_at FROM snapshots
      WHERE taken_at >= now() - interval '7 days' AND taken_at < now()
        AND NOT EXISTS (SELECT 1 FROM tot WHERE tot.hour = date_trunc('hour', taken_at))),
c AS (
  SELECT snapshot_id, count(*) AS n FROM (
    SELECT snapshot_id FROM observations
    WHERE taken_at >= now() - interval '7 days' AND taken_at < (SELECT lo FROM bounds)
      AND ('KUL'::text IS NULL OR nearest_apt = 'KUL'::text)
    UNION ALL
    SELECT snapshot_id FROM observations
    WHERE taken_at >= (SELECT hi FROM bounds) AND taken_at < now()
      AND ('KUL'::text IS NULL OR nearest_apt = 'KUL'::text)) x
  GROUP BY snapshot_id),
raw AS (
  SELECT date_trunc('hour', s.taken_at) AS hour, count(*)::int AS snapshots,
         sum(coalesce(c.n, 0))::bigint AS sum_c, max(coalesce(c.n, 0))::int AS peak
  FROM s LEFT JOIN c ON c.snapshot_id = s.id GROUP BY 1),
u AS (SELECT * FROM sel UNION ALL SELECT * FROM raw)
SELECT to_char(u.hour AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYY-MM-DD"T"HH24:MI') AS hour_myt,
       (u.sum_c::float / u.snapshots) AS avg_aircraft, u.peak AS peak_aircraft, u.snapshots
FROM u ORDER BY u.hour;
