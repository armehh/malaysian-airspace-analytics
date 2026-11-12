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

  describe('Fasa 4b: hourly_stats, /density, /maintenance', () => {
    const HOUR = 3600 * 1000;
    const hourFloor = (d) => new Date(Math.floor(d.getTime() / HOUR) * HOUR);
    const auth = { 'x-collector-secret': SECRET };
    const range = 'from=2026-11-01&to=2026-11-04';

    async function seed(time, obs) {
      const s = await pool.query('INSERT INTO snapshots(taken_at, source, aircraft_count) VALUES ($1,$2,$3) RETURNING id', [time, 't', obs.length]);
      for (const [i, o] of obs.entries()) {
        await pool.query(`INSERT INTO observations(snapshot_id,taken_at,icao24,callsign,airline,lat,lng,alt_m,vel_ms,nearest_apt)
                          VALUES ($1,$2,$3,'X1','AirAsia',$4,$5,3000,120,$6)`, [s.rows[0].id, time, `ic${i}`, o.lat, o.lng, o.apt]);
      }
    }
    const KUL = { apt: 'KUL', lat: 2.73, lng: 101.74 };
    const PEN = { apt: 'PEN', lat: 5.38, lng: 100.31 };
    // Jam 1 (MYT 10:00): 3 snapshot. Jam 2 (MYT 11:00): 2 snapshot, yang kedua kosong, dan tiada PEN langsung.
    async function seedFixture() {
      await seed('2026-11-02T02:00:00Z', [KUL, PEN]);
      await seed('2026-11-02T02:05:00Z', [KUL, PEN]);
      await seed('2026-11-02T02:10:00Z', [KUL]);
      await seed('2026-11-02T03:00:00Z', [KUL, KUL]);
      await seed('2026-11-02T03:05:00Z', []);
    }
    const hourly = async (qs = '') => (await request(app).get(`/api/stats/hourly?${qs}${qs ? '&' : ''}${range}`).expect(200)).body.data;
    const sameHourly = (actual, expected) => {
      expect(actual.map((d) => [d.hourMyt, d.snapshots, d.peakAircraft])).toEqual(expected.map((d) => [d.hourMyt, d.snapshots, d.peakAircraft]));
      actual.forEach((d, i) => expect(d.avgAircraft).toBeCloseTo(expected[i].avgAircraft, 9));
    };
    const summarizeAll = async () => {
      const { summarizeRange } = await import('../src/maintenance.js');
      return summarizeRange(pool, new Date('2026-11-02T00:00:00Z'), new Date('2026-11-03T00:00:00Z'));
    };

    beforeEach(async () => { await pool.query('TRUNCATE hourly_stats'); });
    afterAll(async () => { await pool.query('TRUNCATE hourly_stats'); });

    it('hourly daripada data mentah: nilai dijangka', async () => {
      await seedFixture();
      const all = await hourly();
      expect(all).toHaveLength(2);
      expect(all[0]).toMatchObject({ hourMyt: '2026-11-02T10:00', snapshots: 3, peakAircraft: 2 });
      expect(all[0].avgAircraft).toBeCloseTo(5 / 3, 9);
      expect(all[1]).toMatchObject({ hourMyt: '2026-11-02T11:00', snapshots: 2, peakAircraft: 2 });
      expect(all[1].avgAircraft).toBeCloseTo(1, 9);
      const pen = await hourly('airport=PEN');
      expect(pen[1]).toMatchObject({ snapshots: 2, peakAircraft: 0, avgAircraft: 0 }); // jam tanpa PEN kekal sebagai 0
    });

    it('hourly sama sebelum diringkaskan, selepas diringkaskan, dan selepas data mentah dipadam', async () => {
      await seedFixture();
      const before = { all: await hourly(), kul: await hourly('airport=KUL'), pen: await hourly('airport=PEN') };
      expect(await summarizeAll()).toBeGreaterThan(0);
      sameHourly(await hourly(), before.all);
      sameHourly(await hourly('airport=KUL'), before.kul);
      sameHourly(await hourly('airport=PEN'), before.pen);
      await pool.query('DELETE FROM observations');
      await pool.query('DELETE FROM snapshots');
      sameHourly(await hourly(), before.all);
      sameHourly(await hourly('airport=KUL'), before.kul);
      sameHourly(await hourly('airport=PEN'), before.pen);
    });

    it('hourly: jam yang diringkaskan bercampur dengan jam yang belum diringkaskan', async () => {
      await seedFixture();
      const before = await hourly();
      const { summarizeRange } = await import('../src/maintenance.js');
      await summarizeRange(pool, new Date('2026-11-02T02:00:00Z'), new Date('2026-11-02T03:00:00Z')); // jam 1 sahaja
      expect((await pool.query(`SELECT count(DISTINCT hour)::int n FROM hourly_stats`)).rows[0].n).toBe(1);
      sameHourly(await hourly(), before);
    });

    it('hourly: jam separa di hujung julat dikira daripada data mentah, bukan hourly_stats', async () => {
      await seedFixture();
      await summarizeAll();
      const r = await request(app).get('/api/stats/hourly?from=2026-11-02T02:05:00Z&to=2026-11-02T03:00:00Z').expect(200);
      expect(r.body.data).toHaveLength(1);
      expect(r.body.data[0]).toMatchObject({ snapshots: 2, peakAircraft: 2 }); // 02:05 dan 02:10 sahaja, bukan 3 snapshot penuh
      expect(r.body.data[0].avgAircraft).toBeCloseTo(1.5, 9);
    });

    it('density: kiraan grid, disusun ikut kiraan, boleh ditapis ikut lapangan terbang', async () => {
      await seedFixture();
      const r = await request(app).get(`/api/stats/density?${range}&grid=0.1`).expect(200);
      expect(r.body).toMatchObject({ grid: 0.1, snapshots: 5 });
      expect(r.body.data).toHaveLength(2);
      expect(r.body.data[0].count).toBe(5); // KUL: 3 (jam 1) + 2 (jam 2)
      expect(r.body.data[0].lat).toBeCloseTo(2.75, 4);
      expect(r.body.data[0].lng).toBeCloseTo(101.75, 4);
      expect(r.body.data[1]).toMatchObject({ count: 2 });
      expect(r.body.data[1].lat).toBeCloseTo(5.35, 4);
      const pen = await request(app).get(`/api/stats/density?${range}&airport=PEN`).expect(200);
      expect(pen.body.data).toHaveLength(1);
      expect(pen.body.data[0].count).toBe(2);
    });

    it('density: grid di luar had dihadkan, bukan ralat', async () => {
      await seedFixture();
      const r = await request(app).get(`/api/stats/density?${range}&grid=99`).expect(200);
      expect(r.body.grid).toBe(1);
    });

    describe('POST /api/maintenance', () => {
      it('401 tanpa / dengan rahsia salah, 503 jika rahsia server tiada', async () => {
        await request(app).post('/api/maintenance').expect(401);
        await request(app).post('/api/maintenance').set('x-collector-secret', 'salah').expect(401);
        const open = createApp({ pool, config: { corsOrigin: '*', cacheTtlMs: 0 } });
        await request(open).post('/api/maintenance').set(auth).expect(503);
      });

      it('data kosong: 200, tiada apa dipadam', async () => {
        const r = await request(app).post('/api/maintenance').set(auth).expect(200);
        expect(r.body).toMatchObject({ ok: true, summarizedRows: 0, deletedObservations: 0 });
      });

      it('retensi: ringkas dahulu, kemudian padam lebih 30 hari; snapshots dikekalkan; boleh diulang', async () => {
        const now = new Date();
        const oldT = new Date(hourFloor(new Date(now.getTime() - 45 * 24 * HOUR)).getTime() + 10 * 60000);
        const recT = new Date(hourFloor(now).getTime() - 2 * HOUR + 10 * 60000); // jam penuh dalam 48 jam terakhir
        await seed(oldT, [KUL, PEN]);
        await seed(recT, [KUL]);

        const r = await request(app).post('/api/maintenance').set(auth).expect(200);
        expect(r.body).toMatchObject({ ok: true, deletedObservations: 2 });

        expect((await pool.query('SELECT count(*)::int n FROM observations')).rows[0].n).toBe(1); // yang baru kekal
        expect((await pool.query('SELECT count(*)::int n FROM snapshots')).rows[0].n).toBe(2);     // snapshots tidak dipadam

        const stats = (h) => pool.query(
          'SELECT airport, snapshots, aircraft_sum::int AS sum, peak_aircraft FROM hourly_stats WHERE hour = $1 ORDER BY airport', [h]);
        expect((await stats(hourFloor(oldT))).rows).toEqual([
          { airport: '*', snapshots: 1, sum: 2, peak_aircraft: 2 },
          { airport: 'KUL', snapshots: 1, sum: 1, peak_aircraft: 1 },
          { airport: 'PEN', snapshots: 1, sum: 1, peak_aircraft: 1 },
        ]);
        expect((await stats(hourFloor(recT))).rows[0]).toMatchObject({ airport: '*', sum: 1 });

        // Sejarah lama masih boleh dibaca melalui /hourly walaupun data mentahnya sudah dipadam.
        const from = hourFloor(oldT).toISOString();
        const to = new Date(hourFloor(oldT).getTime() + HOUR).toISOString();
        const h = await request(app).get(`/api/stats/hourly?from=${from}&to=${to}`).expect(200);
        expect(h.body.data).toHaveLength(1);
        expect(h.body.data[0]).toMatchObject({ snapshots: 1, peakAircraft: 2 });
        expect(h.body.data[0].avgAircraft).toBeCloseTo(2, 9);

        const before = (await pool.query('SELECT count(*)::int n FROM hourly_stats')).rows[0].n;
        const again = await request(app).post('/api/maintenance').set(auth).expect(200);
        expect(again.body.deletedObservations).toBe(0);
        expect((await pool.query('SELECT count(*)::int n FROM hourly_stats')).rows[0].n).toBe(before);
      });
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
