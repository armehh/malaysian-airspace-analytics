import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createPool } from '../src/lib/db.js';
import { migrate } from '../src/migrate.js';
import { createApp } from '../src/app.js';
import { runCollection } from '../src/collector/collect.js';

const url = process.env.TEST_DATABASE_URL;
const SECRET = 'rahsia-ujian';

describe.skipIf(!url)('API + collector (Postgres sebenar)', () => {
  let pool, app;
  const fakeFetcher = async () => ({
    source: 'test',
    aircraft: [
      { icao24: 'aaa111', callsign: 'MAS370', airline: 'Malaysia Airlines', lat: 2.7, lng: 101.7, alt_m: 11000, vel_ms: 240, hdg: 10, vr: 0, nearest_apt: 'KUL' },
      { icao24: 'bbb222', callsign: 'AXM1', airline: 'AirAsia', lat: 5.3, lng: 100.3, alt_m: 3000, vel_ms: 120, hdg: 20, vr: -5, nearest_apt: 'PEN' },
    ],
  });

  beforeAll(async () => {
    pool = createPool(url);
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migrate(pool);
    app = createApp({
      pool,
      config: { collectorSecret: SECRET, corsOrigin: '*', cacheTtlMs: 0 },
      collect: (p) => runCollection(p, { fetcher: fakeFetcher }),
    });
  });
  afterAll(() => pool.end());
  beforeEach(async () => { await pool.query('TRUNCATE snapshots, observations, collector_runs RESTART IDENTITY CASCADE'); });

  it('migrasi idempoten', async () => { expect(await migrate(pool)).toEqual([]); });

  describe('POST /api/collect', () => {
    it('401 tanpa / dengan rahsia salah', async () => {
      await request(app).post('/api/collect').expect(401);
      await request(app).post('/api/collect').set('x-collector-secret', 'salah').expect(401);
    });
    it('503 jika rahsia server tidak ditetapkan', async () => {
      const open = createApp({ pool, config: { corsOrigin: '*', cacheTtlMs: 0 } });
      await request(open).post('/api/collect').set('x-collector-secret', 'x').expect(503);
    });
    it('simpan snapshot + observations dalam satu transaksi', async () => {
      const res = await request(app).post('/api/collect').set('x-collector-secret', SECRET).expect(200);
      expect(res.body).toMatchObject({ ok: true, aircraft: 2, source: 'test' });
      expect((await pool.query('SELECT aircraft_count FROM snapshots')).rows[0].aircraft_count).toBe(2);
      expect((await pool.query('SELECT count(*)::int n FROM observations')).rows[0].n).toBe(2);
      expect((await pool.query('SELECT ok FROM collector_runs')).rows[0].ok).toBe(true);
    });
    it('feed gagal → 502, tiada snapshot, larian dilog', async () => {
      const failing = createApp({ pool, config: { collectorSecret: SECRET, corsOrigin: '*', cacheTtlMs: 0 },
        collect: (p) => runCollection(p, { fetcher: async () => { throw new Error('semua feed gagal'); } }) });
      await request(failing).post('/api/collect').set('x-collector-secret', SECRET).expect(502);
      expect((await pool.query('SELECT count(*)::int n FROM snapshots')).rows[0].n).toBe(0);
      const run = (await pool.query('SELECT ok, error FROM collector_runs')).rows[0];
      expect(run.ok).toBe(false);
      expect(run.error).toMatch(/semua feed gagal/);
    });
    it('larian serentak: yang kedua dilangkau (advisory lock)', async () => {
      let release;
      const slow = new Promise((r) => { release = r; });
      const p1 = runCollection(pool, { fetcher: async () => { await slow; return fakeFetcher(); } });
      await new Promise((r) => setTimeout(r, 100));
      const second = await runCollection(pool, { fetcher: fakeFetcher });
      expect(second.skipped).toBe(true);
      release();
      expect((await p1).ok).toBe(true);
    });
  });

  describe('GET /api/stats/*', () => {
    // 3 snapshot pada jam yang sama (UTC 02:xx = MYT 10:xx); snapshot ke-3 tiada pesawat di PEN.
    beforeEach(async () => {
      const times = ['2026-11-02T02:00:00Z', '2026-11-02T02:05:00Z', '2026-11-02T02:10:00Z'];
      for (const [i, t] of times.entries()) {
        const s = await pool.query('INSERT INTO snapshots(taken_at, source, aircraft_count) VALUES ($1,$2,$3) RETURNING id', [t, 't', i < 2 ? 2 : 1]);
        const id = s.rows[0].id;
        await pool.query(`INSERT INTO observations(snapshot_id,taken_at,icao24,callsign,airline,lat,lng,alt_m,vel_ms,nearest_apt)
                          VALUES ($1,$2,'aaa111','MAS370','Malaysia Airlines',2.7,101.7,11000,240,'KUL')`, [id, t]);
        if (i < 2) await pool.query(`INSERT INTO observations(snapshot_id,taken_at,icao24,callsign,airline,lat,lng,alt_m,vel_ms,nearest_apt)
                          VALUES ($1,$2,'bbb222','AXM1','AirAsia',5.3,100.3,3000,120,'PEN')`, [id, t]);
      }
    });
    const range = 'from=2026-11-01&to=2026-11-03';

    it('hourly: purata merangkumi snapshot tanpa pesawat sebagai 0 (bukan dibuang)', async () => {
      const r = await request(app).get(`/api/stats/hourly?airport=PEN&${range}`).expect(200);
      expect(r.body.data).toHaveLength(1);
      expect(r.body.data[0]).toMatchObject({ hourMyt: '2026-11-02T10:00', snapshots: 3, peakAircraft: 1 });
      expect(r.body.data[0].avgAircraft).toBeCloseTo(2 / 3, 5);
    });
    it('hourly tanpa airport = semua pesawat', async () => {
      const r = await request(app).get(`/api/stats/hourly?${range}`).expect(200);
      expect(r.body.data[0].avgAircraft).toBeCloseTo(5 / 3, 5);
    });
    it('weekly: hari & jam mengikut masa Malaysia (2 Nov 2026 = Isnin → dow 1)', async () => {
      const r = await request(app).get(`/api/stats/airports/kul/weekly?${range}`).expect(200);
      expect(r.body.data).toEqual([{ dow: 1, hour: 10, avgAircraft: 1, snapshots: 3 }]);
    });
    it('airports/compare', async () => {
      const r = await request(app).get(`/api/stats/airports/compare?${range}`).expect(200);
      expect(r.body.data.map((d) => d.airport)).toEqual(['KUL', 'PEN']);
      expect(r.body.data[0].avgAircraft).toBe(1);
    });
    it('airlines: ranking & share', async () => {
      const r = await request(app).get(`/api/stats/airlines?${range}`).expect(200);
      expect(r.body.data[0]).toMatchObject({ airline: 'Malaysia Airlines', observations: 3 });
      expect(r.body.data[0].share).toBeCloseTo(3 / 5, 5);
    });
    it('airlines/timeseries: bucket hari', async () => {
      const r = await request(app).get(`/api/stats/airlines/timeseries?bucket=day&top=1&${range}`).expect(200);
      const by = Object.fromEntries(r.body.data.map((d) => [d.airline, d.avgAircraft]));
      expect(by['Malaysia Airlines']).toBe(1);
      expect(by['Lain-lain']).toBeCloseTo(2 / 3, 5);
    });
    it('overview: ringkasan terkini', async () => {
      const r = await request(app).get('/api/stats/overview').expect(200);
      expect(r.body.latest).toMatchObject({ aircraft: 1, airlines: 1 });
      expect(r.body.latest.highest.callsign).toBe('MAS370');
    });
    it('collector: kadar kejayaan', async () => {
      await pool.query(`INSERT INTO collector_runs(ok) VALUES (true),(true),(false)`);
      const day = 24 * 3600 * 1000;
      const from = new Date(Date.now() - day).toISOString();
      const to = new Date(Date.now() + day).toISOString();
      const r = await request(app).get(`/api/stats/collector?from=${from}&to=${to}`).expect(200);
      expect(r.body).toMatchObject({ runs: 3, ok: 2, failed: 1 });
    });
    it('validasi: 400 untuk parameter tidak sah', async () => {
      const r = await request(app).get('/api/stats/hourly?airport=XXX').expect(400);
      expect(r.body.issues[0].path).toBe('airport');
      await request(app).get('/api/stats/airlines?from=2026-01-01&to=2026-12-31').expect(400);
      await request(app).get('/api/stats/airports/XXX/weekly').expect(400);
    });
  });

  it('cache: respons kedua ditanda HIT', async () => {
    const cached = createApp({ pool, config: { collectorSecret: SECRET, corsOrigin: '*', cacheTtlMs: 60000 } });
    const a = await request(cached).get('/api/stats/airlines?from=2026-11-01&to=2026-11-03').expect(200);
    const b = await request(cached).get('/api/stats/airlines?from=2026-11-01&to=2026-11-03').expect(200);
    expect(a.headers['x-cache']).toBe('MISS');
    expect(b.headers['x-cache']).toBe('HIT');
  });
});
