import { describe, expect, it } from 'vitest';
import { csvUrl, exportUrl } from './csvUrl';

describe('csvUrl', () => {
  const base = 'https://api.example.com';
  it('hourly dengan lapangan terbang', () => {
    expect(csvUrl(base, { type: 'hourly', airport: 'KUL' })).toBe('https://api.example.com/api/stats/export.csv?type=hourly&airport=KUL');
  });
  it('airlines dengan top', () => {
    expect(csvUrl(base, { type: 'airlines', top: 10 })).toBe('https://api.example.com/api/stats/export.csv?type=airlines&top=10');
  });
  it('buang garis condong di hujung alamat asas', () => {
    expect(csvUrl(base + '/', { type: 'airlines' })).toBe('https://api.example.com/api/stats/export.csv?type=airlines');
  });
  it('parameter kosong tidak dimasukkan', () => {
    expect(csvUrl(base, { type: 'hourly', airport: '' })).toBe('https://api.example.com/api/stats/export.csv?type=hourly');
  });

  it('exportUrl xlsx guna laluan export.xlsx dengan parameter sama', () => {
    expect(exportUrl(base, { type: 'hourly', airport: 'KUL' }, 'xlsx')).toBe('https://api.example.com/api/stats/export.xlsx?type=hourly&airport=KUL');
    expect(exportUrl(base + '/', { type: 'airlines', top: 10 }, 'xlsx')).toBe('https://api.example.com/api/stats/export.xlsx?type=airlines&top=10');
  });
  it('exportUrl lalai ialah csv', () => {
    expect(exportUrl(base, { type: 'airlines' })).toBe(csvUrl(base, { type: 'airlines' }));
  });
});
