import { fetchAircraft } from './feeds.js';

const LOCK_KEY = 727001; // kunci advisory: elak dua larian bertindih

/**
 * Ambil satu snapshot dan simpan dalam SATU transaksi (bulk insert melalui unnest).
 * Larian gagal dicatat dalam collector_runs supaya jurang data boleh dikesan.
 */
export async function runCollection(pool, { fetcher = fetchAircraft } = {}) {
  const t0 = Date.now();
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS got', [LOCK_KEY]);
    if (!rows[0].got) return { ok: false, skipped: true, reason: 'larian lain sedang berjalan' };
    try {
      let result;
      try {
        result = await fetcher();
      } catch (e) {
        await logRun(client, { ok: false, error: e.message, ms: Date.now() - t0 });
        return { ok: false, error: e.message };
      }
      const { source, aircraft } = result;
      await client.query('BEGIN');
      try {
        const snap = await client.query(
          'INSERT INTO snapshots (source, aircraft_count) VALUES ($1,$2) RETURNING id, taken_at',
          [source, aircraft.length],
        );
        const { id, taken_at } = snap.rows[0];
        if (aircraft.length) {
          const col = (k) => aircraft.map((a) => a[k] ?? null);
          await client.query(
            `INSERT INTO observations
               (snapshot_id, taken_at, icao24, callsign, airline, lat, lng, alt_m, vel_ms, hdg, vr, nearest_apt)
             SELECT $1, $2, * FROM unnest(
               $3::text[], $4::text[], $5::text[], $6::real[], $7::real[],
               $8::real[], $9::real[], $10::real[], $11::real[], $12::text[])`,
            [id, taken_at, col('icao24'), col('callsign'), col('airline'), col('lat'), col('lng'),
              col('alt_m'), col('vel_ms'), col('hdg'), col('vr'), col('nearest_apt')],
          );
        }
        await client.query('COMMIT');
        await logRun(client, { ok: true, source, aircraft: aircraft.length, ms: Date.now() - t0 });
        return { ok: true, snapshotId: Number(id), source, aircraft: aircraft.length };
      } catch (e) {
        await client.query('ROLLBACK');
        await logRun(client, { ok: false, source, error: `DB: ${e.message}`, ms: Date.now() - t0 });
        return { ok: false, error: e.message };
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

function logRun(client, { ok, source = null, aircraft = null, error = null, ms }) {
  return client.query(
    'INSERT INTO collector_runs (ok, source, aircraft, error, duration_ms) VALUES ($1,$2,$3,$4,$5)',
    [ok, source, aircraft, error, ms],
  );
}
