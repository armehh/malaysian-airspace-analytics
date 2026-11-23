import type { Hourly } from './api';

export type HourPoint = { hourMyt: string; avgAircraft: number | null; peakAircraft: number | null; snapshots: number };

const HOUR = 3600 * 1000;

// Label "2026-11-16T11:00" (masa Malaysia) -> milisaat dengan jam dinding yang sama. Guna UTC supaya tiada kesan zon masa pelayar.
const toMs = (label: string) => {
  const [d, t] = label.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  return Date.UTC(y, mo - 1, da, h, mi);
};
const pad = (n: number) => String(n).padStart(2, '0');
const toLabel = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

/**
 * Sisipkan titik kosong (avgAircraft = null) untuk setiap jam yang tiada dalam siri, supaya carta memutuskan garis
 * di jurang (contohnya collector terhenti) dan paksi masa berjarak sama, bukannya menyambung lurus merentasi jurang.
 * Data diandaikan sudah tersusun mengikut masa, seperti keluaran /hourly.
 */
export function fillHourGaps(rows: Hourly['data']): HourPoint[] {
  const out: HourPoint[] = [];
  let prev: number | null = null;
  for (const r of rows) {
    const ms = toMs(r.hourMyt);
    if (prev !== null) for (let t = prev + HOUR; t < ms; t += HOUR) out.push({ hourMyt: toLabel(t), avgAircraft: null, peakAircraft: null, snapshots: 0 });
    out.push(r);
    prev = ms;
  }
  return out;
}
