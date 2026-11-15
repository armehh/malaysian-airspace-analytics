import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { createPool } from '../src/lib/db.js';
import { migrate } from '../src/migrate.js';
import { createApp } from '../src/app.js';
import { buildWorkbook, xlsxFilename, XLSX_MIME } from '../src/lib/xlsx.js';

const load = async (buf) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf); return wb; };
// Cari baris pertama (dari baris `from`) yang nilai lajurnya sama. Jubin KPI ialah sel bercantum, jadi jadual dicari selepas pengepalanya.
const find = (ws, col, text, from = 1) => { let hit; ws.eachRow((row, n) => { if (!hit && n >= from && row.getCell(col).value === text) hit = n; }); return hit; };
const tableRow = (ws, name) => find(ws, 2, name, find(ws, 2, 'Syarikat penerbangan') + 1);
const q = { from: new Date('2026-11-01T00:00:00Z'), to: new Date('2026-11-03T00:00:00Z') };
const gen = new Date('2026-11-13T09:55:00Z');
const hours = [
  { hourMyt: '2026-11-02T10:00', avgAircraft: 5 / 3, peakAircraft: 2, snapshots: 3 },
  { hourMyt: '2026-11-03T10:00', avgAircraft: 3, peakAircraft: 4, snapshots: 12 },
];

describe('buildWorkbook (tanpa pangkalan data)', () => {
  it('xlsxFilename menukar hujung .csv kepada .xlsx', () => {
    expect(xlsxFilename('airspace-hourly-2026-11-01_2026-11-03.csv')).toBe('airspace-hourly-2026-11-01_2026-11-03.xlsx');
  });

  it('hourly: dua lembaran, nombor sebenar dan jam dinding Malaysia kekal', async () => {
    const wb = await load(await buildWorkbook({ type: 'hourly', q, data: hours, airport: { code: 'KUL', name: 'KLIA' }, generatedAt: gen }));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Ringkasan', 'Data']);
    expect(wb.getWorksheet('Ringkasan').getCell('A2').value).toContain('KUL · KLIA');
    const d = wb.getWorksheet('Data');
    expect(d.getRow(2).values.slice(1)).toEqual(['Tarikh dan jam', 'Hari', 'Purata pesawat', 'Puncak', 'Snapshot', 'Liputan data']);
    const r3 = d.getRow(3);
    expect(r3.getCell(1).value).toEqual(new Date(Date.UTC(2026, 10, 2, 10, 0))); // 10:00 MYT dipaparkan sebagai 10:00
    expect(r3.getCell(2).value).toBe('Isn'); // 2 Nov 2026 ialah Isnin
    expect(r3.getCell(3).value).toBeCloseTo(5 / 3, 9);
    expect(typeof r3.getCell(3).value).toBe('number');
    expect(r3.getCell(4).value).toBe(2);
    expect(r3.getCell(5).value).toBe(3);
    expect(r3.getCell(6).value).toBeCloseTo(0.25, 9); // 3 daripada 12 snapshot
    expect(d.getRow(4).getCell(6).value).toBe(1);
  });

  it('hourly: jadual corak jam dalam sehari berwajaran snapshot', async () => {
    const wb = await load(await buildWorkbook({ type: 'hourly', q, data: hours, generatedAt: gen }));
    const s = wb.getWorksheet('Ringkasan');
    const row = find(s, 1, '10:00');
    expect(row).toBeTruthy();
    expect(s.getCell(row, 2).value).toBeCloseTo((5 / 3 * 3 + 3 * 12) / 15, 9); // (jumlah pesawat) / (jumlah snapshot)
    expect(s.getCell(row, 3).value).toBe(4);
    expect(s.getCell(row, 4).value).toBe(2); // dua hari data pada jam ini
    expect(s.getCell(find(s, 1, '11:00'), 2).value).toBeNull(); // jam tanpa data dibiarkan kosong
  });

  it('hourly: tiada data tidak menyebabkan ralat dan diterangkan', async () => {
    const wb = await load(await buildWorkbook({ type: 'hourly', q, data: [], generatedAt: gen }));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Ringkasan', 'Data']);
    let found = false;
    wb.getWorksheet('Ringkasan').eachRow((r) => r.eachCell((c) => { if (c.value === 'Tiada data untuk julat ini.') found = true; }));
    expect(found).toBe(true);
  });

  it('airlines: ranking dengan nombor sebenar, dan nama bermula = kekal teks (bukan formula)', async () => {
    const data = [
      { airline: 'AirAsia', observations: 7585, avgAircraft: 9.25, share: 0.1769 },
      { airline: '=HYPERLINK("http://contoh.invalid","klik")', observations: 10, avgAircraft: 0.01, share: 0.0001 },
    ];
    const wb = await load(await buildWorkbook({ type: 'airlines', q, data, generatedAt: gen }));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Ranking']);
    const ws = wb.getWorksheet('Ranking');
    const row = tableRow(ws, 'AirAsia');
    expect(ws.getCell(row, 1).value).toBe(1);
    expect(ws.getCell(row, 3).value).toBe(7585);
    expect(ws.getCell(row, 5).value).toBeCloseTo(0.1769, 9);
    const inj = ws.getCell(row + 1, 2);
    expect(inj.type).toBe(ExcelJS.ValueType.String);
    expect(inj.value).toBe('=HYPERLINK("http://contoh.invalid","klik")');
  });
});

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('GET /api/stats/export.xlsx (Postgres sebenar)', () => {
  let pool, app;
  const bin = (res, cb) => { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); };
  const get = (path) => request(app).get(path).buffer(true).parse(bin);

  beforeAll(async () => {
    pool = createPool(url);
    await migrate(pool);
    app = createApp({ pool, config: { collectorSecret: 'x', corsOrigin: '*', cacheTtlMs: 0 } });
  });
  afterAll(() => pool.end());

  // 3 snapshot pada jam yang sama (UTC 02:xx = MYT 10:xx): MAS370 di KUL (3 kali), AXM1 di PEN (2 kali).
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

  it('hourly: pengepala HTTP, fail sah dan nilai sepadan dengan JSON', async () => {
    const r = await get(`/api/stats/export.xlsx?type=hourly&${range}`).expect(200);
    expect(r.headers['content-type']).toBe(XLSX_MIME);
    expect(r.headers['content-disposition']).toBe('attachment; filename="airspace-hourly-2026-11-01_2026-11-03.xlsx"');
    expect(Buffer.isBuffer(r.body)).toBe(true);
    expect(r.body.subarray(0, 2).toString()).toBe('PK'); // fail xlsx ialah arkib zip
    const d = (await load(r.body)).getWorksheet('Data');
    expect(d.rowCount).toBeGreaterThanOrEqual(3);
    expect(d.getCell('C3').value).toBeCloseTo(5 / 3, 9);
    expect(d.getCell('D3').value).toBe(2);
    expect(d.getCell('E3').value).toBe(3);
  });

  it('hourly dengan airport=PEN: nama lapangan terbang dan nilai penapis', async () => {
    const r = await get(`/api/stats/export.xlsx?type=hourly&airport=PEN&${range}`).expect(200);
    const wb = await load(r.body);
    expect(wb.getWorksheet('Ringkasan').getCell('A2').value).toContain('PEN');
    expect(wb.getWorksheet('Data').getCell('C3').value).toBeCloseTo(2 / 3, 9);
  });

  it('airlines: ranking dan kongsi', async () => {
    const r = await get(`/api/stats/export.xlsx?type=airlines&${range}`).expect(200);
    expect(r.headers['content-disposition']).toContain('airspace-airlines-2026-11-01_2026-11-03.xlsx');
    const ws = (await load(r.body)).getWorksheet('Ranking');
    const row = tableRow(ws, 'Malaysia Airlines');
    expect(ws.getCell(row, 3).value).toBe(3);
    expect(ws.getCell(row, 5).value).toBeCloseTo(3 / 5, 9);
  });

  it('julat tanpa data: fail tetap sah', async () => {
    const r = await get('/api/stats/export.xlsx?type=hourly&from=2026-01-01&to=2026-01-02').expect(200);
    expect((await load(r.body)).worksheets).toHaveLength(2);
  });

  it('validasi: type hilang/tidak sah dan julat terlalu panjang -> 400', async () => {
    await get('/api/stats/export.xlsx').expect(400);
    await get('/api/stats/export.xlsx?type=pdf').expect(400);
    await get('/api/stats/export.xlsx?type=hourly&from=2026-01-01&to=2026-12-31').expect(400);
  });

  it('export.csv masih berfungsi (tiada kesan sampingan)', async () => {
    const r = await request(app).get(`/api/stats/export.csv?type=hourly&${range}`).expect(200);
    expect(r.text).toBe('hour_myt,airport,avg_aircraft,peak_aircraft,snapshots\r\n2026-11-02T10:00,ALL,1.67,2,3\r\n');
  });
});
