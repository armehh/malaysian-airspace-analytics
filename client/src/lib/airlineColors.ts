// Satu warna tetap bagi setiap syarikat penerbangan. Ubah di sini sahaja.
export const AIRLINE_COLORS: Record<string, string> = {
  'Malaysia Airlines': '#ff6b6b',
  'AirAsia': '#e8384f',
  'AirAsia X': '#c2185b',
  'Batik Air Malaysia': '#f2b441',
  'Firefly': '#ff9f43',
  'MASwings': '#ffb4a2',
  'Scoot': '#ffe066',
  'Singapore Airlines': '#5cc8ff',
  'SilkAir': '#74c0fc',
  'Jetstar Asia': '#ff922b',
  'Thai AirAsia': '#f06595',
  'Indonesia AirAsia': '#da77f2',
  'Cathay Pacific': '#38d9a9',
  'Emirates': '#fa5252',
  'Qatar Airways': '#9775fa',
  'Etihad': '#d0bfa0',
  'Thai Airways': '#b197fc',
  'Garuda Indonesia': '#51cf66',
  'Turkish Airlines': '#e03131',
  'Lufthansa': '#fcc419',
  'Lain-lain': '#5b7388',
  'Tidak dikenal pasti': '#3d5367',
};

const FALLBACK = ['#63e6be', '#a9e34b', '#4dabf7', '#ffa8a8', '#b2f2bb', '#eebefa', '#99e9f2', '#ffd8a8'];

export function airlineColor(name: string): string {
  const fixed = AIRLINE_COLORS[name];
  if (fixed) return fixed;
  if (name.startsWith('Lain-lain')) return AIRLINE_COLORS['Lain-lain'];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK[h % FALLBACK.length];
}