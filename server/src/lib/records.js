// Top pesawat paling tinggi / paling laju. Rekod "semua masa" disimpan dalam jadual records
// (observations dipadam selepas 30 hari). Minggu ini / 30 hari dikira terus daripada observations.
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const TZ = 'Asia/Kuala_Lumpur';

export const RECORD_METRICS = ['altitude', 'speed'];
export const RECORD_PERIODS = ['all', 'month', 'week'];

// Ungkapan nilai (altitude: meter, speed: km/j) dan had munasabah. Nilai di luar (0, max] dibuang sebagai data pelik ADS-B.
const METRIC = {
  altitude: { expr: 'alt_m', max: 15500 },
  speed: { expr: 'vel_ms * 3.6', max: 1200 },
};
// Satu nilai hanya diterima jika pesawat yang sama ada pemerhatian bersebelahan (dalam NEIGHBOR_MINUTES) dengan nilai
// sekurang-kurangnya NEIGHBOR_RATIO daripadanya. Ini membuang lonjakan tunggal dan pesawat yang hanya dilihat sekali.
const NEIGHBOR_MINUTES = 10;
const NEIGHBOR_RATIO = 0.8;

// Calon terbaik setiap pesawat dalam [$1, $2). Pemerhatian jiran diambil sedikit di luar julat supaya hujung julat tidak hilang.
function candidatesSql(metric) {
  const { expr, max } = METRIC[metric];
  const gap = `interval '${NEIGHBOR_MINUTES} minutes'`;
  return `
    WITH base AS (
      SELECT icao24, callsign, airline, taken_at, (${expr})::float8 AS v FROM observations
      WHERE taken_at >= $1::timestamptz - ${gap} AND taken_at < $2::timestamptz + ${gap}),
    ok AS (SELECT * FROM base WHERE v > 0 AND v <= ${max}),
    w AS (
      SELECT *, lag(v) OVER p AS pv, lag(taken_at) OVER p AS pt, lead(v) OVER p AS nv, lead(taken_at) OVER p AS nt
      FROM ok WINDOW p AS (PARTITION BY icao24 ORDER BY taken_at))
    SELECT DISTINCT ON (icao24) icao24, callsign, airline, v AS value, taken_at AS observed_at
    FROM w
    WHERE taken_at >= $1::timestamptz AND taken_at < $2::timestamptz
      AND ((pv IS NOT NULL AND taken_at - pt <= ${gap} AND pv >= ${NEIGHBOR_RATIO} * v)
        OR (nv IS NOT NULL AND nt - taken_at <= ${gap} AND nv >= ${NEIGHBOR_RATIO} * v))
    ORDER BY icao24, v DESC, taken_at DESC`;
}

/** Kemas kini jadual records daripada observations dalam [from, to). Hanya menaikkan nilai. Mengembalikan bilangan baris disentuh. */
export async function updateRecords(pool, from, to) {
  let touched = 0;
  for (const metric of RECORD_METRICS) {
    const r = await pool.query(`
      INSERT INTO records (metric, icao24, value, callsign, airline, observed_at)
      SELECT '${metric}', icao24, value, callsign, airline, observed_at FROM (${candidatesSql(metric)}) c
      ON CONFLICT (metric, icao24) DO UPDATE
        SET value = EXCLUDED.value, callsign = EXCLUDED.callsign, airline = EXCLUDED.airline, observed_at = EXCLUDED.observed_at
        WHERE EXCLUDED.value > records.value`, [from.toISOString(), to.toISOString()]);
    touched += r.rowCount;
  }
  return touched;
}

const SELECT_OUT = `
  SELECT icao24, callsign, airline, round(value)::int AS value,
         to_char(observed_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI') AS observed_myt
  FROM`;

/** Top N satu pesawat satu baris. period: all (rekod kekal + data semasa), month (30 hari), week (7 hari). */
export async function topRecords(pool, { metric, period, limit = 10, now = new Date() }) {
  let rows;
  if (period === 'all') {
    // Rekod kekal dikemas sehingga jam terakhir yang diringkaskan; selepas itu dibaca terus daripada observations.
    const { rows: lr } = await pool.query("SELECT max(hour) AS last FROM hourly_stats WHERE airport = '*'");
    const floor = new Date(now.getTime() - 30 * DAY);
    const last = lr[0] && lr[0].last;
    const liveFrom = last && last > floor ? last : floor;
    ({ rows } = await pool.query(`${SELECT_OUT} (
      SELECT DISTINCT ON (icao24) * FROM (
        SELECT icao24, callsign, airline, value, observed_at FROM (${candidatesSql(metric)}) live
        UNION ALL
        SELECT icao24, callsign, airline, value::float8, observed_at FROM records WHERE metric = $3) u
      ORDER BY icao24, value DESC, observed_at DESC) d
      ORDER BY value DESC, observed_at DESC, icao24 LIMIT $4`,
      [liveFrom.toISOString(), now.toISOString(), metric, limit]));
  } else {
    const from = new Date(now.getTime() - (period === 'week' ? 7 : 30) * DAY);
    ({ rows } = await pool.query(`${SELECT_OUT} (${candidatesSql(metric)}) c
      ORDER BY value DESC, observed_at DESC, icao24 LIMIT $3`,
      [from.toISOString(), now.toISOString(), limit]));
  }
  return {
    metric, period, unit: metric === 'altitude' ? 'm' : 'km/j', limit,
    data: rows.map((x, i) => ({
      rank: i + 1, icao24: x.icao24, callsign: x.callsign, airline: x.airline, value: x.value, observedMyt: x.observed_myt,
    })),
  };
}
