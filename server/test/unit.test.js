import { describe, it, expect, vi } from 'vitest';
import { airlineFromCallsign } from '../src/lib/airlines.js';
import { nearestAirport } from '../src/lib/airports.js';
import { fetchAircraft, normalizeReadsb, normalizeOpenSky } from '../src/collector/feeds.js';
import { rangeSchema } from '../src/lib/validate.js';

describe('airlineFromCallsign', () => {
  it('memetakan awalan ICAO', () => {
    expect(airlineFromCallsign('AXM512')).toBe('AirAsia');
    expect(airlineFromCallsign('MAS370 ')).toBe('Malaysia Airlines');
    expect(airlineFromCallsign('mxd123')).toBe('Batik Air Malaysia');
  });
  it('syarikat tidak dikenali ditandakan Lain-lain', () => {
    expect(airlineFromCallsign('ZZZ99')).toBe('Lain-lain (ZZZ)');
  });
  it('callsign bukan komersial / kosong → null', () => {
    expect(airlineFromCallsign('9MXYZ')).toBeNull();
    expect(airlineFromCallsign(null)).toBeNull();
    expect(airlineFromCallsign('')).toBeNull();
  });
});

describe('nearestAirport', () => {
  it('jumpa KUL berhampiran KLIA', () => expect(nearestAirport(2.75, 101.7)).toBe('KUL'));
  it('jumpa BKI', () => expect(nearestAirport(5.94, 116.05)).toBe('BKI'));
  it('null jika jauh dari semua (Laut China Selatan)', () => expect(nearestAirport(5.0, 108.0)).toBeNull());
  it('null jika tiada koordinat', () => expect(nearestAirport(null, 101)).toBeNull());
});

describe('normalisasi', () => {
  it('readsb: tukar unit dan buang pesawat di darat', () => {
    const n = normalizeReadsb({ hex: 'ABC123', flight: 'AXM512 ', lat: 3, lon: 101, alt_baro: 35000, gs: 450, track: 90, baro_rate: 0 });
    expect(n.icao24).toBe('abc123');
    expect(n.callsign).toBe('AXM512');
    expect(n.alt_m).toBeCloseTo(10668, 0);
    expect(n.vel_ms).toBeCloseTo(231.5, 0);
    expect(normalizeReadsb({ hex: 'x', lat: 3, lon: 101, alt_baro: 'ground' })).toBeNull();
    expect(normalizeReadsb({ hex: 'x' })).toBeNull();
  });
  it('opensky: state vector', () => {
    const n = normalizeOpenSky(['abc123', 'MAS370  ', 'Malaysia', 0, 0, 101.7, 2.7, 10000, false, 230, 45, 0]);
    expect(n).toMatchObject({ icao24: 'abc123', callsign: 'MAS370', lat: 2.7, lng: 101.7, alt_m: 10000 });
    expect(normalizeOpenSky(['a', 'b', 'c', 0, 0, 101, 3, 0, true, 0, 0, 0])).toBeNull();
  });
});

const ok = (ac) => ({ ok: true, status: 200, json: async () => ({ ac }) });
const sample = [
  { hex: 'aaa111', flight: 'MAS370', lat: 3.0, lon: 101.5, alt_baro: 30000, gs: 400 },
  { hex: 'bbb222', flight: 'AXM1', lat: 5.3, lon: 100.3, alt_baro: 5000, gs: 200 },
  { hex: 'ccc333', flight: 'SIA1', lat: 40, lon: 10, alt_baro: 30000, gs: 400 }, // luar Malaysia
];

describe('fetchAircraft', () => {
  const opts = { gapMs: 0 };
  it('guna feed pertama, nyahduplikasi antara wilayah, tapis luar sempadan', async () => {
    const fetchImpl = vi.fn(async () => ok(sample));
    const r = await fetchAircraft({ ...opts, fetchImpl });
    expect(r.source).toBe('adsb.lol');
    expect(r.aircraft.map((a) => a.icao24).sort()).toEqual(['aaa111', 'bbb222']); // 3 wilayah, tetap 2
    expect(r.aircraft.find((a) => a.icao24 === 'bbb222').nearest_apt).toBe('PEN');
    expect(r.aircraft.find((a) => a.icao24 === 'aaa111').airline).toBe('Malaysia Airlines');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it('fallback ke feed kedua bila yang pertama gagal', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes('adsb.lol')) return { ok: false, status: 429, json: async () => ({}) };
      return ok(sample);
    });
    const r = await fetchAircraft({ ...opts, fetchImpl });
    expect(r.source).toBe('airplanes.live');
  });
  it('fallback ke OpenSky bila semua feed readsb gagal', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes('opensky')) return { ok: true, status: 200, json: async () => ({ states: [['aaa111', 'MAS370', 'MY', 0, 0, 101.5, 3.0, 9000, false, 220, 10, 0]] }) };
      throw new Error('network');
    });
    const r = await fetchAircraft({ ...opts, fetchImpl });
    expect(r.source).toBe('opensky');
    expect(r.aircraft).toHaveLength(1);
  });
  it('lempar ralat bila semua feed gagal', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('down'); });
    await expect(fetchAircraft({ ...opts, fetchImpl })).rejects.toThrow(/Semua feed gagal/);
  });
});

describe('rangeSchema', () => {
  it('default 7 hari', () => {
    const r = rangeSchema.parse({});
    expect(r.to - r.from).toBe(7 * 24 * 3600 * 1000);
  });
  it('tolak julat > 90 hari, from >= to, airport tidak sah', () => {
    expect(rangeSchema.safeParse({ from: '2026-01-01', to: '2026-06-01' }).success).toBe(false);
    expect(rangeSchema.safeParse({ from: '2026-02-01', to: '2026-01-01' }).success).toBe(false);
    expect(rangeSchema.safeParse({ airport: 'XXX' }).success).toBe(false);
  });
  it('airport huruf kecil diterima', () => {
    expect(rangeSchema.parse({ airport: 'kul' }).airport).toBe('KUL');
  });
});
