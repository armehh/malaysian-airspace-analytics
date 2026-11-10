import { airlineFromCallsign } from '../lib/airlines.js';
import { nearestAirport } from '../lib/airports.js';

const FT_TO_M = 0.3048;
const KT_TO_MS = 0.514444;
const FPM_TO_MS = 0.00508;

// Kotak sempadan kasar ruang udara Malaysia; pesawat di luar ini dibuang.
export const MY_BOUNDS = { latMin: 0.5, latMax: 7.6, lonMin: 99.0, lonMax: 119.6 };

// Pusat bulatan carian (radius maks 250 nm pada kebanyakan feed).
export const REGIONS = [
  { name: 'semenanjung', lat: 4.0, lon: 102.0, nm: 250 },
  { name: 'sarawak', lat: 2.5, lon: 112.0, nm: 250 },
  { name: 'sabah', lat: 5.5, lon: 116.5, nm: 250 },
];

// Format "readsb" dikongsi oleh adsb.lol, airplanes.live dan adsb.fi.
export const FEEDS = [
  { name: 'adsb.lol', format: 'readsb', url: (r) => `https://api.adsb.lol/v2/point/${r.lat}/${r.lon}/${r.nm}` },
  { name: 'airplanes.live', format: 'readsb', url: (r) => `https://api.airplanes.live/v2/point/${r.lat}/${r.lon}/${r.nm}` },
  { name: 'adsb.fi', format: 'readsb', url: (r) => `https://opendata.adsb.fi/api/v2/lat/${r.lat}/lon/${r.lon}/dist/${r.nm}` },
];

// OpenSky: satu panggilan untuk seluruh kotak sempadan (had anonymous lebih ketat).
export const OPENSKY = {
  name: 'opensky',
  format: 'opensky',
  url: () => {
    const b = MY_BOUNDS;
    return `https://opensky-network.org/api/states/all?lamin=${b.latMin}&lomin=${b.lonMin}&lamax=${b.latMax}&lomax=${b.lonMax}`;
  },
};

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Tukar satu rekod readsb kepada bentuk seragam. Pulang null jika tidak sah. */
export function normalizeReadsb(ac) {
  const lat = num(ac.lat);
  const lng = num(ac.lon);
  if (lat == null || lng == null || !ac.hex) return null;
  if (ac.alt_baro === 'ground') return null; // bukan "di udara"
  const callsign = typeof ac.flight === 'string' ? ac.flight.trim() || null : null;
  const alt = num(ac.alt_baro ?? ac.alt_geom);
  return {
    icao24: String(ac.hex).toLowerCase(),
    callsign,
    lat, lng,
    alt_m: alt == null ? null : alt * FT_TO_M,
    vel_ms: num(ac.gs) == null ? null : ac.gs * KT_TO_MS,
    hdg: num(ac.track),
    vr: num(ac.baro_rate ?? ac.geom_rate) == null ? null : (ac.baro_rate ?? ac.geom_rate) * FPM_TO_MS,
  };
}

/** OpenSky state vector: [icao24, callsign, country, t_pos, t_last, lon, lat, baro_alt, on_ground, vel, track, vr, ...] */
export function normalizeOpenSky(s) {
  const [icao24, callsign, , , , lon, lat, baroAlt, onGround, vel, track, vr] = s;
  if (onGround || num(lat) == null || num(lon) == null || !icao24) return null;
  return {
    icao24: String(icao24).toLowerCase(),
    callsign: callsign?.trim() || null,
    lat, lng: lon,
    alt_m: num(baroAlt), vel_ms: num(vel), hdg: num(track), vr: num(vr),
  };
}

export function inBounds({ lat, lng }, b = MY_BOUNDS) {
  return lat >= b.latMin && lat <= b.latMax && lng >= b.lonMin && lng <= b.lonMax;
}

async function getJson(fetchImpl, url, timeoutMs) {
  const res = await fetchImpl(url, {
    headers: { 'user-agent': 'malaysian-airspace-analytics/0.1 (portfolio project)', accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Cuba setiap feed mengikut turutan; guna feed pertama yang berjaya untuk SEMUA wilayah.
 * Jarak antara panggilan >= gapMs kerana feed awam menghadkan ~1 req/s.
 * Pulang { source, aircraft } atau lempar Error jika semua feed gagal.
 */
export async function fetchAircraft({ fetchImpl = fetch, feeds = [...FEEDS, OPENSKY], regions = REGIONS, gapMs = 1100, timeoutMs = 8000 } = {}) {
  const errors = [];
  for (const feed of feeds) {
    try {
      const byHex = new Map();
      if (feed.format === 'opensky') {
        const data = await getJson(fetchImpl, feed.url(), timeoutMs);
        for (const s of data.states ?? []) {
          const n = normalizeOpenSky(s);
          if (n && inBounds(n)) byHex.set(n.icao24, n);
        }
      } else {
        for (let i = 0; i < regions.length; i++) {
          if (i > 0) await sleep(gapMs);
          const data = await getJson(fetchImpl, feed.url(regions[i]), timeoutMs);
          const list = data.ac ?? data.aircraft;
          if (!Array.isArray(list)) throw new Error('Format respons tidak dijangka');
          for (const ac of list) {
            const n = normalizeReadsb(ac);
            if (n && inBounds(n)) byHex.set(n.icao24, n); // nyahduplikasi kawasan bertindih
          }
        }
      }
      const aircraft = [...byHex.values()].map((a) => ({
        ...a,
        airline: airlineFromCallsign(a.callsign),
        nearest_apt: nearestAirport(a.lat, a.lng),
      }));
      return { source: feed.name, aircraft };
    } catch (e) {
      errors.push(`${feed.name}: ${e.message}`);
      await sleep(gapMs);
    }
  }
  throw new Error(`Semua feed gagal — ${errors.join('; ')}`);
}
