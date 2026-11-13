import { z } from 'zod';

// type=hourly (purata setiap jam) atau type=airlines (ranking syarikat).
export const exportTypeSchema = z.object({ type: z.enum(['hourly', 'airlines']) });

// Nombor sebagai teks dengan tempat perpuluhan tetap; nilai kosong (null) menjadi sel kosong.
export const num = (v, digits = 2) => (v == null ? '' : Number(v).toFixed(digits));

function cell(v) {
  if (v == null) return '';
  let s = String(v);
  // Elak formula injection apabila CSV dibuka dalam Excel/Sheets: teks yang bermula dengan = + - @ tab atau CR.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// RFC 4180: pemisah koma, baris tamat CRLF, medan bertanda petik jika perlu.
export const toCsv = (rows) => rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';

const day = (d) => new Date(d).toISOString().slice(0, 10);
export const csvFilename = (type, q) => `airspace-${type}-${day(q.from)}_${day(q.to)}.csv`;