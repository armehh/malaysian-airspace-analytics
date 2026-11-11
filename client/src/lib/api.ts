import { useEffect, useState } from 'react';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export type Overview = {
  latest: null | {
    takenAt: string; aircraft: number; airlines: number;
    highest: { callsign: string | null; icao24: string; alt_m: number } | null;
    fastest: { callsign: string | null; icao24: string; speed_kmh: number } | null;
  };
  trend: { hourMyt: string; avgAircraft: number; snapshots: number; usualAircraft: number | null }[];
};
export type AirportList = { airports: { code: string; name: string }[] };
export type Compare = { data: { airport: string; avgAircraft: number; uniqueAircraft: number }[] };
export type Hourly = { data: { hourMyt: string; avgAircraft: number; peakAircraft: number; snapshots: number }[] };
export type Weekly = { data: { dow: number; hour: number; avgAircraft: number; snapshots: number }[] };
export type Airlines = { data: { airline: string; observations: number; avgAircraft: number; share: number }[] };
export type AirlineSeries = { bucket: 'hour' | 'day'; data: { bucketMyt: string; airline: string; avgAircraft: number }[] };

export async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/api/stats${path}`);
  if (!res.ok) throw new Error(`Pelayan membalas ${res.status}`);
  return res.json();
}

/** Muat data dari API. Beri path null untuk melangkau. refreshMs > 0 = muat semula berkala. */
export function useApi<T>(path: string | null, refreshMs = 0) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  useEffect(() => {
    if (!path) return;
    let live = true;
    const load = () =>
      api<T>(path)
        .then((data) => live && setState({ data, loading: false }))
        .catch((e) => live && setState((s) => ({ ...s, error: e.message, loading: false })));
    setState((s) => ({ ...s, loading: true }));
    load();
    const id = refreshMs ? setInterval(load, refreshMs) : undefined;
    return () => { live = false; if (id) clearInterval(id); };
  }, [path, refreshMs]);
  return state;
}