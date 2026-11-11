import { Router } from 'express';
import { AIRPORTS } from '../lib/airports.js';
import { rangeSchema, airportParam, parse } from '../lib/validate.js';

const TZ = 'Asia/Kuala_Lumpur';
// Label masa tempatan Malaysia sebagai teks (elak masalah zon masa pemacu pg).
const LABEL = (expr) => `to_char(${expr}, 'YYYY-MM-DD"T"HH24:MI')`;

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

export function statsRouter(pool) {
  const r = Router();

  r.get('/airports', (_req, res) => res.json({ airports: AIRPORTS }));

  // Ringkasan semasa + trend 24 jam berbanding paras biasa pada jam yang sama.
  r.get('/overview', wrap(async (_req, res) => {
    const latest = (await pool.query(
      'SELECT id, taken_at, aircraft_count FROM snapshots ORDER BY taken_at DESC LIMIT 1')).rows[0];
    if (!latest) return res.json({ latest: null, trend: [] });

    const [summary, highest, fastest, trend] = await Promise.all([
      pool.query(`SELECT count(DISTINCT airline)::int AS airlines FROM observations WHERE snapshot_id=$1 AND airline IS NOT NULL`, [latest.id]),
      pool.query(`SELECT callsign, icao24, round(alt_m)::int AS alt_m FROM observations WHERE snapshot_id=$1 AND alt_m IS NOT NULL ORDER BY alt_m DESC LIMIT 1`, [latest.id]),
      pool.query(`SELECT callsign, icao24, round(vel_ms*3.6)::int AS speed_kmh FROM observations WHERE snapshot_id=$1 AND vel_ms IS NOT NULL ORDER BY vel_ms DESC LIMIT 1`, [latest.id]),
      pool.query(`
        WITH recent AS (
          SELECT date_trunc('hour', taken_at) AS h, avg(aircraft_count)::float AS avg_aircraft, count(*)::int AS snapshots
          FROM snapshots WHERE taken_at >= now() - interval '24 hours' GROUP BY 1),
        usual AS (
          SELECT extract(hour FROM taken_at AT TIME ZONE '${TZ}')::int AS hod, avg(aircraft_count)::float AS usual_aircraft
          FROM snapshots WHERE taken_at >= now() - interval '15 days' AND taken_at < now() - interval '24 hours' GROUP BY 1)
        SELECT ${LABEL(`recent.h AT TIME ZONE '${TZ}'`)} AS hour_myt, recent.avg_aircraft, recent.snapshots, usual.usual_aircraft
        FROM recent LEFT JOIN usual ON usual.hod = extract(hour FROM recent.h AT TIME ZONE '${TZ}')::int
        ORDER BY recent.h`),
    ]);
    res.json({
      latest: {
        takenAt: latest.taken_at,
        aircraft: latest.aircraft_count,
        airlines: summary.rows[0].airlines,
        highest: highest.rows[0] ?? null,
        fastest: fastest.rows[0] ?? null,
      },
      trend: trend.rows.map((t) => ({
        hourMyt: t.hour_myt, avgAircraft: t.avg_aircraft, snapshots: t.snapshots, usualAircraft: t.usual_aircraft,
      })),
    });
  }));

  // Purata pesawat bagi setiap jam (masa Malaysia), boleh ditapis ikut lapangan terbang.
  r.get('/hourly', wrap(async (req, res) => {
    const q = parse(rangeSchema, req.query);
    const { rows } = await pool.query(`
      WITH s AS (SELECT id, taken_at FROM snapshots WHERE taken_at >= $1 AND taken_at < $2),
      c AS (SELECT snapshot_id, count(*) AS n FROM observations
            WHERE taken_at >= $1 AND taken_at < $2 AND ($3::text IS NULL OR nearest_apt = $3)
            GROUP BY snapshot_id)
      SELECT ${LABEL(`date_trunc('hour', s.taken_at AT TIME ZONE '${TZ}')`)} AS hour_myt,
             avg(coalesce(c.n, 0))::float AS avg_aircraft,
             max(coalesce(c.n, 0))::int   AS peak_aircraft,
             count(*)::int                AS snapshots
      FROM s LEFT JOIN c ON c.snapshot_id = s.id
      GROUP BY date_trunc('hour', s.taken_at AT TIME ZONE '${TZ}') ORDER BY 1`,
      [q.from, q.to, q.airport ?? null]);
    res.json({ airport: q.airport ?? null, from: q.from, to: q.to,
      data: rows.map((x) => ({ hourMyt: x.hour_myt, avgAircraft: x.avg_aircraft, peakAircraft: x.peak_aircraft, snapshots: x.snapshots })) });
  }));

  // Bandingkan lapangan terbang: purata pesawat berdekatan bagi setiap snapshot.
  r.get('/airports/compare', wrap(async (req, res) => {
    const q = parse(rangeSchema, req.query);
    const { rows } = await pool.query(`
      WITH n AS (SELECT count(*)::float AS total FROM snapshots WHERE taken_at >= $1 AND taken_at < $2)
      SELECT nearest_apt AS airport, count(*)::float / NULLIF((SELECT total FROM n), 0) AS avg_aircraft,
             count(DISTINCT icao24)::int AS unique_aircraft
      FROM observations WHERE taken_at >= $1 AND taken_at < $2 AND nearest_apt IS NOT NULL
      GROUP BY 1 ORDER BY 2 DESC`, [q.from, q.to]);
    res.json({ from: q.from, to: q.to,
      data: rows.map((x) => ({ airport: x.airport, avgAircraft: x.avg_aircraft, uniqueAircraft: x.unique_aircraft })) });
  }));

  // Grid hari-dalam-minggu x jam bagi satu lapangan terbang (0 = Ahad).
  r.get('/airports/:code/weekly', wrap(async (req, res) => {
    const { code } = parse(airportParam, req.params);
    const q = parse(rangeSchema, req.query);
    const { rows } = await pool.query(`
      WITH s AS (SELECT id, taken_at AT TIME ZONE '${TZ}' AS t FROM snapshots WHERE taken_at >= $1 AND taken_at < $2),
      c AS (SELECT snapshot_id, count(*) AS n FROM observations
            WHERE taken_at >= $1 AND taken_at < $2 AND nearest_apt = $3 GROUP BY snapshot_id)
      SELECT extract(dow FROM s.t)::int AS dow, extract(hour FROM s.t)::int AS hour,
             avg(coalesce(c.n, 0))::float AS avg_aircraft, count(*)::int AS snapshots
      FROM s LEFT JOIN c ON c.snapshot_id = s.id GROUP BY 1, 2 ORDER BY 1, 2`, [q.from, q.to, code]);
    res.json({ airport: code, from: q.from, to: q.to,
      data: rows.map((x) => ({ dow: x.dow, hour: x.hour, avgAircraft: x.avg_aircraft, snapshots: x.snapshots })) });
  }));

  // Ranking syarikat penerbangan.
  r.get('/airlines', wrap(async (req, res) => {
    const q = parse(rangeSchema, req.query);
    const { rows } = await pool.query(`
      WITH n AS (SELECT count(*)::float AS total FROM snapshots WHERE taken_at >= $1 AND taken_at < $2),
      t AS (SELECT count(*)::float AS total FROM observations WHERE taken_at >= $1 AND taken_at < $2)
      SELECT coalesce(airline, 'Tidak dikenal pasti') AS airline, count(*)::int AS observations,
             count(*)::float / NULLIF((SELECT total FROM n), 0) AS avg_aircraft,
             count(*)::float / NULLIF((SELECT total FROM t), 0) AS share
      FROM observations WHERE taken_at >= $1 AND taken_at < $2
      GROUP BY 1 ORDER BY 2 DESC LIMIT $3`, [q.from, q.to, q.top]);
    res.json({ from: q.from, to: q.to,
      data: rows.map((x) => ({ airline: x.airline, observations: x.observations, avgAircraft: x.avg_aircraft, share: x.share })) });
  }));

  // Siri masa untuk carta area bertindih (N syarikat teratas + "Lain-lain").
  r.get('/airlines/timeseries', wrap(async (req, res) => {
    const q = parse(rangeSchema, req.query);
    const { rows } = await pool.query(`
      WITH top AS (SELECT airline FROM observations WHERE taken_at >= $1 AND taken_at < $2 AND airline IS NOT NULL
                   GROUP BY 1 ORDER BY count(*) DESC LIMIT $3),
      s AS (SELECT date_trunc($4, taken_at AT TIME ZONE '${TZ}') AS b, count(*)::float AS n
            FROM snapshots WHERE taken_at >= $1 AND taken_at < $2 GROUP BY 1),
      o AS (SELECT date_trunc($4, taken_at AT TIME ZONE '${TZ}') AS b,
                   CASE WHEN airline IN (SELECT airline FROM top) THEN airline ELSE 'Lain-lain' END AS a,
                   count(*)::float AS c
            FROM observations WHERE taken_at >= $1 AND taken_at < $2 AND airline IS NOT NULL GROUP BY 1, 2)
      SELECT ${LABEL('o.b')} AS bucket_myt, o.a AS airline, o.c / s.n AS avg_aircraft
      FROM o JOIN s ON s.b = o.b ORDER BY o.b, o.a`, [q.from, q.to, q.top, q.bucket]);
    res.json({ bucket: q.bucket, from: q.from, to: q.to,
      data: rows.map((x) => ({ bucketMyt: x.bucket_myt, airline: x.airline, avgAircraft: x.avg_aircraft })) });
  }));

  // Kepadatan kedudukan pesawat, dikumpul ke grid darjah (lalai 0.1, had 0.02 hingga 1).
  r.get('/density', wrap(async (req, res) => {
    const q = parse(rangeSchema, req.query);
    const grid = Math.min(1, Math.max(0.02, Number(req.query.grid) || 0.1));
    const [cells, snaps] = await Promise.all([
      pool.query(`
        SELECT round((floor(lat::float8 / $3::float8) * $3::float8 + $3::float8 / 2)::numeric, 4)::float8 AS glat,
               round((floor(lng::float8 / $3::float8) * $3::float8 + $3::float8 / 2)::numeric, 4)::float8 AS glng,
               count(*)::int AS c
        FROM observations
        WHERE taken_at >= $1 AND taken_at < $2 AND lat IS NOT NULL AND lng IS NOT NULL
          AND ($4::text IS NULL OR nearest_apt = $4)
        GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 5000`, [q.from, q.to, grid, q.airport ?? null]),
      pool.query('SELECT count(*)::int AS n FROM snapshots WHERE taken_at >= $1 AND taken_at < $2', [q.from, q.to]),
    ]);
    res.json({ from: q.from, to: q.to, grid, snapshots: snaps.rows[0].n,
      data: cells.rows.map((x) => ({ lat: x.glat, lng: x.glng, count: x.c })) });
  }));
  // Kesihatan collector: kadar kejayaan & jurang.
  r.get('/collector', wrap(async (req, res) => {
    const q = parse(rangeSchema, req.query);
    const [runs, last] = await Promise.all([
      pool.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE ok)::int AS ok
                  FROM collector_runs WHERE started_at >= $1 AND started_at < $2`, [q.from, q.to]),
      pool.query(`SELECT started_at, error FROM collector_runs WHERE NOT ok ORDER BY started_at DESC LIMIT 1`),
    ]);
    const { total, ok } = runs.rows[0];
    res.json({ from: q.from, to: q.to, runs: total, ok, failed: total - ok,
      successRate: total ? ok / total : null, lastFailure: last.rows[0] ?? null });
  }));

  return r;
}
