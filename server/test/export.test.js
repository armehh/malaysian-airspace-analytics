import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createPool } from '../src/lib/db.js';
import { migrate } from '../src/migrate.js';
import { createApp } from '../src/app.js';
import { toCsv, num, csvFilename } from '../src/lib/csv.js';

describe('toCsv', () => {
  it('baris tamat CRLF dan nilai kosong menjadi sel kosong', () => {
    expect(toCsv([['a', 'b'], [1, null]])).toBe('a,b\r\n1,\r\n');
  });
  it('petik medan yang mengandungi koma, petik atau baris baharu', () => {
    expect(toCsv([['x, y', 'say "hi"', 'a\nb']])).toBe('"x, y","say ""hi""","a\nb"\r\n');
  });
  it('mengelak formula injection untuk teks (nombor negatif sebenar tidak terjejas)', () => {
    expect(toCsv([['=1+1', '+cmd', '-x', '@sum', -1.5]])).toBe("'=1+1,'+cmd,'-x,'@sum,-1.5\r\n");
  });
  it('num dan csvFilename', () => {
    expect(num(2 / 3)).toBe('0.67');
    expect(num(null)).toBe('');
    expect(csvFilename('hourly', { from: '2026-11-01T00:00:00.000Z', to: new Date('2026-11-03T00:00:00Z') })).toBe('airspace-hourly-2026-11-01_2026-11-03.csv');
  });
});

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('GET /api/stats/export.csv (Postgres sebenar)', () => {
  let pool, app;
  beforeAll(async () => {
    pool = createPool(url);
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migrate(pool);
    app = createApp({ pool, config: { collectorSecret: 'x', corsOrigin: '*', cacheTtlMs: 0 } });
  });
  afterAll(() => pool.end());

  beforeEach(async () => {
    await pool.query('TRUNCATE snapshots, observations, collector_runs, hourly_stats RESTART IDENTITY CASCADE');
    const times = ['2026-11-02T02:00:00Z', '2026-11-02T02:05:00Z', '2026-11-02T02:10:00Z'];
    for (const [i, t] of times.entries()) {
      const s = await pool.query('INSERT INTO snapshots(taken_at, source, aircraft_count) VALUES ($1,$2,$3) RETURNING id', [t, 't', i < 2 ? 2 : 1]);
      const id = s.rows[0].id;
      await pool.query(`INSERT INTO observations(snapshot_id,taken_at,icao24,callsign,airline,lat,lng,nearest_apt) VALUES ($1,$2,'aaa111','MAS370','Malaysia Airlines',2.7,101.7,'KUL')`, [id, t]);
      if (i < 2) await pool.query(`INSERT INTO observations(snapshot_id,taken_at,icao24,callsign,airline,lat,lng,nearest_apt) VALUES ($1,$2,'bbb222','AXM1','AirAsia',5.3,100.3,'PEN')`, [id, t]);
    }
  });
  const range = 'from=2026-11-01&to=2026-11-03';

  it('hourly: pengepala, nilai dan nama fail', async () => {
    const r = await request(app).get(`/api/stats/export.csv?type=hourly&${range}`).expect(200);
    expect(r.headers['content-type']).toMatch(/^text\/csv; charset=utf-8/);
    expect(r.headers['content-disposition']).toBe('attachment; filename="airspace-hourly-2026-11-01_2026-11-03.csv"');
    expect(r.text).toBe('hour_myt,airport,avg_aircraft,peak_aircraft,snapshots\r\n2026-11-02T10:00,ALL,1.67,2,3\r\n');
  });
  it('hourly dengan airport=PEN', async () => {
    const r = await request(app).get(`/api/stats/export.csv?type=hourly&airport=PEN&${range}`).expect(200);
    expect(r.text).toBe('hour_myt,airport,avg_aircraft,peak_aircraft,snapshots\r\n2026-11-02T10:00,PEN,0.67,1,3\r\n');
  });
  it('airlines: ranking dan peratus', async () => {
    const r = await request(app).get(`/api/stats/export.csv?type=airlines&${range}`).expect(200);
    expect(r.headers['content-disposition']).toContain('airspace-airlines-2026-11-01_2026-11-03.csv');
    expect(r.text).toBe('airline,observations,avg_aircraft,share_pct\r\nMalaysia Airlines,3,1.00,60.00\r\nAirAsia,2,0.67,40.00\r\n');
  });
  it('julat tanpa data: hanya baris pengepala', async () => {
    const r = await request(app).get('/api/stats/export.csv?type=hourly&from=2026-01-01&to=2026-01-02').expect(200);
    expect(r.text).toBe('hour_myt,airport,avg_aircraft,peak_aircraft,snapshots\r\n');
  });
  it('validasi: type hilang atau tidak sah, julat terlalu panjang -> 400', async () => {
    const a = await request(app).get('/api/stats/export.csv').expect(400);
    expect(a.body.issues[0].path).toBe('type');
    await request(app).get('/api/stats/export.csv?type=pdf').expect(400);
    await request(app).get('/api/stats/export.csv?type=hourly&from=2026-01-01&to=2026-12-31').expect(400);
  });
  it('/hourly dan /airlines JSON tidak berubah selepas tampalan', async () => {
    const h = await request(app).get(`/api/stats/hourly?${range}`).expect(200);
    expect(h.body.data).toEqual([{ hourMyt: '2026-11-02T10:00', avgAircraft: 5 / 3, peakAircraft: 2, snapshots: 3 }]);
    const a = await request(app).get(`/api/stats/airlines?${range}`).expect(200);
    expect(a.body.data.map((d) => d.airline)).toEqual(['Malaysia Airlines', 'AirAsia']);
  });
});