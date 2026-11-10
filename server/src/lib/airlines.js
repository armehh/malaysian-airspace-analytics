// Callsign komersial = 3 huruf ICAO syarikat + nombor penerbangan, cth "MAS370", "AXM512".
const PREFIX = {
  MAS: 'Malaysia Airlines', AXM: 'AirAsia', XAX: 'AirAsia X', MXD: 'Batik Air Malaysia',
  FFM: 'Firefly', MWG: 'MASwings', TGW: 'Scoot', SIA: 'Singapore Airlines', SLK: 'SilkAir',
  JSA: 'Jetstar Asia', TAX: 'Thai AirAsia', AWQ: 'Indonesia AirAsia', CPA: 'Cathay Pacific',
  UAE: 'Emirates', QTR: 'Qatar Airways', ETD: 'Etihad', THA: 'Thai Airways', GIA: 'Garuda Indonesia',
  BTK: 'Batik Air Indonesia', LNI: 'Lion Air', CTV: 'Citilink', VJC: 'VietJet', HVN: 'Vietnam Airlines',
  CEB: 'Cebu Pacific', PAL: 'Philippine Airlines', ANA: 'ANA', JAL: 'Japan Airlines', KAL: 'Korean Air',
  CSN: 'China Southern', CCA: 'Air China', CES: 'China Eastern', CHH: 'Hainan Airlines',
  BAW: 'British Airways', DLH: 'Lufthansa', AIC: 'Air India', IGO: 'IndiGo', SVA: 'Saudia',
  TKJ: 'Turkish Airlines', THY: 'Turkish Airlines', ABD: 'Air Busan', JNA: 'Jin Air',
};

export function airlineFromCallsign(callsign) {
  if (!callsign) return null;
  const m = /^([A-Z]{3})\d/.exec(callsign.trim().toUpperCase());
  if (!m) return null; // cth pesawat persendirian "9MXYZ" atau tiada callsign
  return PREFIX[m[1]] ?? `Lain-lain (${m[1]})`;
}
