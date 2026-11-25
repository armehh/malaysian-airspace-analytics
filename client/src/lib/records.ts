import type { Records } from './api';

export type RecordMetric = Records['metric'];
export type RecordPeriod = Records['period'];
export type RecordRow = Records['data'][number];

export const METRICS: { value: RecordMetric; label: string }[] = [
  { value: 'altitude', label: 'Paling tinggi' },
  { value: 'speed', label: 'Paling laju' },
];

export const PERIODS: { value: RecordPeriod; label: string }[] = [
  { value: 'week', label: '7 hari' },
  { value: 'month', label: '30 hari' },
  { value: 'all', label: 'Semua masa' },
];

/** Path API untuk senarai rekod (relatif kepada /api/stats). */
export const recordsPath = (metric: RecordMetric, period: RecordPeriod, limit = 10) =>
  `/records?metric=${metric}&period=${period}&limit=${limit}`;

const MONTHS = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];

/** "2026-11-20T14:20" (masa Malaysia) -> "20 Nov 14:20". Format tidak dikenali dipulangkan seperti asal. */
export function formatObserved(myt: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})$/.exec(myt);
  if (!m) return myt;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[4]}`;
}

/** Callsign jika ada, jika tidak nombor ICAO24. */
export const recordName = (r: Pick<RecordRow, 'callsign' | 'icao24'>) => r.callsign?.trim() || r.icao24;

/** Lebar bar sebagai peratus daripada nilai terbesar (0 hingga 100). */
export function barPercent(value: number, max: number): number {
  if (!(max > 0) || !(value > 0)) return 0;
  return Math.min(100, Math.round((value / max) * 100));
}

export const unitOf = (metric: RecordMetric) => (metric === 'altitude' ? 'm' : 'km/j');
