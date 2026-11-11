// Ringkasan setiap jam + retensi. Idempotent: boleh dijalankan berulang kali.
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const SUMMARIZE = `
  WITH s AS (SELECT id, date_trunc('hour', taken_at) AS h FROM snapshots
             WHERE taken_at >= $1::timestamptz AND taken_at < $2::timestamptz),
  sn AS (SELECT h, count(*)::int AS n FROM s GROUP BY h),
  per AS (
    SELECT snapshot_id, '*'::text AS airport, count(*) AS c FROM observations
      WHERE taken_at >= $1::timestamptz AND taken_at < $2::timestamptz GROUP BY snapshot_id
    UNION ALL
    SELECT snapshot_id, nearest_apt, count(*) FROM observations
      WHERE taken_at >= $1::timestamptz AND taken_at < $2::timestamptz AND nearest_apt IS NOT NULL
      GROUP BY snapshot_id, nearest_apt),
  agg AS (SELECT s.h, per.airport, sum(per.c)::bigint AS sum_c, max(per.c)::int AS peak
          FROM per JOIN s ON s.id = per.snapshot_id GROUP BY s.h, per.airport)
  INSERT INTO hourly_stats (hour, airport, snapshots, aircraft_sum, peak_aircraft)
  SELECT agg.h, agg.airport, sn.n, agg.sum_c, agg.peak FROM agg JOIN sn ON sn.h = agg.h
  ON CONFLICT (hour, airport) DO UPDATE
    SET snapshots = EXCLUDED.snapshots, aircraft_sum = EXCLUDED.aircraft_sum, peak_aircraft = EXCLUDED.peak_aircraft`;

export async function summarizeRange(pool, from, to) {
  const r = await pool.query(SUMMARIZE, [from.toISOString(), to.toISOString()]);
  return r.rowCount;
}

export async function runMaintenance(pool, { retentionDays = 30, now = new Date() } = {}) {
  const hourNow = new Date(Math.floor(now.getTime() / HOUR) * HOUR); // jam penuh sahaja
  const cutoff = new Date(hourNow.getTime() - retentionDays * DAY);

  let summarized = await summarizeRange(pool, new Date(hourNow.getTime() - 48 * HOUR), hourNow);

  let deleted = 0;
  const { rows } = await pool.query('SELECT min(taken_at) AS oldest FROM observations');
  const oldest = rows[0].oldest;
  if (oldest && oldest < cutoff) {
    // Ringkaskan dahulu semua jam yang akan dipadam, baru padam.
    const start = new Date(Math.floor(oldest.getTime() / HOUR) * HOUR);
    summarized += await summarizeRange(pool, start, cutoff);
    deleted = (await pool.query('DELETE FROM observations WHERE taken_at < $1', [cutoff.toISOString()])).rowCount;
  }
  return { ok: true, summarizedRows: summarized, deletedObservations: deleted, cutoff: cutoff.toISOString() };
}