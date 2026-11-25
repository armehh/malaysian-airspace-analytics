import { describe, expect, it } from 'vitest';
import { barPercent, formatObserved, recordName, recordsPath, unitOf, METRICS, PERIODS } from './records';

describe('records helpers', () => {
  it('recordsPath membina laluan dengan metrik, tempoh dan had', () => {
    expect(recordsPath('altitude', 'all')).toBe('/records?metric=altitude&period=all&limit=10');
    expect(recordsPath('speed', 'week', 5)).toBe('/records?metric=speed&period=week&limit=5');
  });

  it('formatObserved menukar label masa Malaysia kepada hari, bulan Melayu dan jam', () => {
    expect(formatObserved('2026-11-20T14:20')).toBe('20 Nov 14:20');
    expect(formatObserved('2026-12-01T00:05')).toBe('1 Dis 00:05');
    expect(formatObserved('2026-05-09T23:59')).toBe('9 Mei 23:59');
  });

  it('formatObserved memulangkan teks asal jika format tidak dikenali', () => {
    expect(formatObserved('')).toBe('');
    expect(formatObserved('semalam')).toBe('semalam');
  });

  it('recordName guna callsign, jatuh balik kepada icao24 bila kosong atau null', () => {
    expect(recordName({ callsign: 'SIA442', icao24: '76cc6f' })).toBe('SIA442');
    expect(recordName({ callsign: null, icao24: '76cc6f' })).toBe('76cc6f');
    expect(recordName({ callsign: '  ', icao24: '76cc6f' })).toBe('76cc6f');
  });

  it('barPercent: nilai terbesar 100, selebihnya mengikut nisbah, input tidak sah 0', () => {
    expect(barPercent(14333, 14333)).toBe(100);
    expect(barPercent(7000, 14000)).toBe(50);
    expect(barPercent(5, 0)).toBe(0);
    expect(barPercent(-1, 10)).toBe(0);
    expect(barPercent(Number.NaN, 10)).toBe(0);
    expect(barPercent(20, 10)).toBe(100);
  });

  it('unitOf dan pilihan menu: dua metrik, tiga tempoh mengikut susunan paparan', () => {
    expect(unitOf('altitude')).toBe('m');
    expect(unitOf('speed')).toBe('km/j');
    expect(METRICS.map((m) => m.value)).toEqual(['altitude', 'speed']);
    expect(PERIODS.map((p) => p.value)).toEqual(['week', 'month', 'all']);
  });
});
