import { describe, expect, it } from 'vitest';
import { fillGaps } from './timeGaps';

type R = { t: string; v: number | null };
const row = (t: string, v: number | null = 1): R => ({ t, v });
const gap = (t: string): R => ({ t, v: null });
const fill = (rows: R[], step = 1) => fillGaps(rows, (r) => r.t, gap, step);

describe('fillGaps', () => {
  it('tiada jurang: baris tidak berubah', () => {
    const rows = [row('2026-11-16T10:00'), row('2026-11-16T11:00'), row('2026-11-16T12:00')];
    expect(fill(rows)).toEqual(rows);
  });
  it('kosong atau satu baris dipulangkan seperti asal', () => {
    expect(fill([])).toEqual([]);
    const one = [row('2026-11-16T10:00')];
    expect(fill(one)).toBe(one);
  });
  it('jurang 3 jam menyisipkan 2 baris kosong dengan label betul', () => {
    const out = fill([row('2026-11-16T11:00'), row('2026-11-16T14:00')]);
    expect(out.map((r) => r.t)).toEqual(['2026-11-16T11:00', '2026-11-16T12:00', '2026-11-16T13:00', '2026-11-16T14:00']);
    expect(out.map((r) => r.v)).toEqual([1, null, null, 1]);
  });
  it('merentasi tengah malam dan sempadan bulan', () => {
    const out = fill([row('2026-11-30T23:00'), row('2026-12-01T02:00')]);
    expect(out.map((r) => r.t)).toEqual(['2026-11-30T23:00', '2026-12-01T00:00', '2026-12-01T01:00', '2026-12-01T02:00']);
  });
  it('jurang collector 16 hingga 18 Nov: 52 jam kosong', () => {
    const out = fill([row('2026-11-16T11:00'), row('2026-11-18T16:00')]);
    const blanks = out.filter((r) => r.v === null);
    expect(blanks).toHaveLength(52);
    expect(blanks[0].t).toBe('2026-11-16T12:00');
    expect(blanks[51].t).toBe('2026-11-18T15:00');
  });
  it('data harian (langkah 24 jam)', () => {
    const out = fill([row('2026-11-16T00:00'), row('2026-11-19T00:00')], 24);
    expect(out.map((r) => r.t)).toEqual(['2026-11-16T00:00', '2026-11-17T00:00', '2026-11-18T00:00', '2026-11-19T00:00']);
  });
  it('jurang melebihi had (lebih 90 hari) tidak diisi', () => {
    const out = fill([row('2026-01-01T00:00'), row('2026-06-01T00:00')]);
    expect(out).toHaveLength(2);
  });
});