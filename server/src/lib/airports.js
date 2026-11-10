import { haversineKm } from './geo.js';

// Lapangan terbang utama Malaysia (kod IATA). Tambah lagi jika perlu.
export const AIRPORTS = [
  { code: 'KUL', name: 'Kuala Lumpur Intl (KLIA)', lat: 2.7456, lng: 101.7099 },
  { code: 'SZB', name: 'Subang (Sultan Abdul Aziz Shah)', lat: 3.1306, lng: 101.5490 },
  { code: 'PEN', name: 'Penang Intl', lat: 5.2971, lng: 100.2770 },
  { code: 'LGK', name: 'Langkawi Intl', lat: 6.3297, lng: 99.7287 },
  { code: 'JHB', name: 'Senai Intl (Johor Bahru)', lat: 1.6413, lng: 103.6700 },
  { code: 'IPH', name: 'Sultan Azlan Shah (Ipoh)', lat: 4.5680, lng: 101.0920 },
  { code: 'KBR', name: 'Sultan Ismail Petra (Kota Bharu)', lat: 6.1667, lng: 102.2930 },
  { code: 'TGG', name: 'Sultan Mahmud (Kuala Terengganu)', lat: 5.3826, lng: 103.1030 },
  { code: 'KTE', name: 'Kerteh', lat: 4.5372, lng: 103.4270 },
  { code: 'KUA', name: 'Sultan Ahmad Shah (Kuantan)', lat: 3.7753, lng: 103.2090 },
  { code: 'BKI', name: 'Kota Kinabalu Intl', lat: 5.9372, lng: 116.0510 },
  { code: 'SDK', name: 'Sandakan', lat: 5.9009, lng: 118.0590 },
  { code: 'TWU', name: 'Tawau', lat: 4.3134, lng: 118.1220 },
  { code: 'LBU', name: 'Labuan', lat: 5.3008, lng: 115.2500 },
  { code: 'KCH', name: 'Kuching Intl', lat: 1.4847, lng: 110.3470 },
  { code: 'SBW', name: 'Sibu', lat: 2.2616, lng: 111.9850 },
  { code: 'BTU', name: 'Bintulu', lat: 3.1239, lng: 113.0200 },
  { code: 'MYY', name: 'Miri', lat: 4.3220, lng: 113.9870 },
];

export const AIRPORT_CODES = AIRPORTS.map((a) => a.code);

// Pesawat dikaitkan dengan lapangan terbang hanya jika dalam jarak ini.
// Ini anggaran "berdekatan", bukan pasti sedang berlepas/mendarat.
export const NEAR_RADIUS_KM = 60;

export function nearestAirport(lat, lng, radiusKm = NEAR_RADIUS_KM) {
  if (lat == null || lng == null) return null;
  let best = null;
  let bestD = Infinity;
  for (const a of AIRPORTS) {
    const d = haversineKm(lat, lng, a.lat, a.lng);
    if (d < bestD) { bestD = d; best = a.code; }
  }
  return bestD <= radiusKm ? best : null;
}
