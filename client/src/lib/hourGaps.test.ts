import { describe, expect, it } from 'vitest';
import { fillHourGaps } from './hourGaps';

const row = (hourMyt: string, avg = 5) => ({ hourMyt, avgAircraft: avg, peakAircraft: avg + 2, snapshots: 12 });

describe('fillHourGaps', () => {
  it('siri kosong kekal kosong', () => {
    expect(fillHourGaps([])).toEqual([]);
  });

  it('siri tanpa jurang tidak berubah', () => {
    const rows = [row('2026-11-16T09:00'), row('2026-11-16T10:00'), row('2026-11-16T11:00')];
    expect(fillHourGaps(rows)).toEqual(rows);
  });

  it('jurang disisip sebagai titik null, satu setiap jam yang tiada', () => {
    const out = fillHourGaps([row('2026-11-16T10:00', 3), row('2026-11-16T13:00', 4)]);
    expect(out.map((p) => p.hourMyt)).toEqual(['2026-11-16T10:00', '2026-11-16T11:00', '2026-11-16T12:00', '2026-11-16T13:00']);
    expect(out.map((p) => p.avgAircraft)).toEqual([3, null, null, 4]);
    expect(out[1]).toEqual({ hourMyt: '2026-11-16T11:00', avgAircraft: null, peakAircraft: null, snapshots: 0 });
  });

  it('jurang 52 jam seperti 16 hingga 18 Nov: 51 titik kosong, melangkau tengah malam', () => {
    const out = fillHourGaps([row('2026-11-16T11:00'), row('2026-11-18T16:00')]);
    expect(out).toHaveLength(2 + 52);
    expect(out[1].hourMyt).toBe('2026-11-16T12:00');
    expect(out[24].hourMyt).toBe('2026-11-17T11:00');
    expect(out[out.length - 2].hourMyt).toBe('2026-11-18T15:00');
    expect(out.slice(1, -1).every((p) => p.avgAircraft === null)).toBe(true);
  });

  it('melintasi pertukaran bulan dan tahun', () => {
    const out = fillHourGaps([row('2026-12-31T22:00'), row('2027-01-01T02:00')]);
    expect(out.map((p) => p.hourMyt)).toEqual(['2026-12-31T22:00', '2026-12-31T23:00', '2027-01-01T00:00', '2027-01-01T01:00', '2027-01-01T02:00']);
  });

  it('baris asal dikekalkan sebagai objek yang sama', () => {
    const a = row('2026-11-16T10:00');
    const b = row('2026-11-16T12:00');
    const out = fillHourGaps([a, b]);
    expect(out[0]).toBe(a);
    expect(out[2]).toBe(b);
  });
});
