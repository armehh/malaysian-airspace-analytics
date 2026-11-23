// Label masa ialah 'YYYY-MM-DDTHH:MM' dalam masa Malaysia (tanpa DST), jadi aritmetik jam selamat dibuat sebagai UTC.
const HOUR = 3_600_000;
const MAX_FILL = 24 * 90; // had jam yang diisi bagi satu jurang (selaras dengan julat maksimum 90 hari)

const parse = (label: string) =>
  Date.UTC(+label.slice(0, 4), +label.slice(5, 7) - 1, +label.slice(8, 10), +label.slice(11, 13), +label.slice(14, 16));
const format = (ms: number) => new Date(ms).toISOString().slice(0, 16);

/**
 * Sisipkan baris kosong (dibina oleh makeGap) bagi setiap masa yang tiada di antara dua baris bersebelahan,
 * supaya carta memaparkan jurang dan paksi-x mengikut masa sebenar. Baris dianggap tersusun menaik.
 * stepHours: 1 untuk data setiap jam, 24 untuk data setiap hari.
 */
export function fillGaps<T>(rows: T[], getLabel: (r: T) => string, makeGap: (label: string) => T, stepHours = 1): T[] {
  if (rows.length < 2) return rows;
  const step = stepHours * HOUR;
  const out: T[] = [rows[0]];
  for (let i = 1; i < rows.length; i++) {
    const prev = parse(getLabel(rows[i - 1]));
    const cur = parse(getLabel(rows[i]));
    const missing = Math.round((cur - prev) / step) - 1;
    if (missing > 0 && missing <= MAX_FILL) {
      for (let j = 1; j <= missing; j++) out.push(makeGap(format(prev + j * step)));
    }
    out.push(rows[i]);
  }
  return out;
}