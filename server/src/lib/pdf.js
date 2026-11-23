// Laporan PDF ringkas (pdfkit) untuk eksport: type=hourly (corak 24 jam) atau type=airlines (ranking).
import PDFDocument from 'pdfkit';

export const PDF_MIME = 'application/pdf';
export const pdfFilename = (name) => name.replace(/\.csv$/i, '.pdf');

const TZ = 'Asia/Kuala_Lumpur';
const MONTHS = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];
const C = { navy: '#131f2d', sky: '#7fc4fb', band: '#eef4fb', zebra: '#f5f8fc', ink: '#1b2430', grey: '#5b6877', line: '#d9e1ea', bar: '#86c5fb' };
const MARGIN = 40;
const ROW_H = 16;
const SNAPSHOTS_PER_HOUR = 12;
const MIN_SNAPSHOTS = 6; // di bawah ini, jam dianggap tidak lengkap (sama seperti dashboard)

// Fon piawai PDF hanya menyokong Latin-1.
const safe = (s) => String(s ?? '').replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
const fmt = (n, d = 1) => (Number.isFinite(Number(n)) ? Number(n).toFixed(d) : '-');

function mytParts(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(date)).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: p.hour, mi: p.minute };
}
const dateText = (date) => { const t = mytParts(date); return `${t.d} ${MONTHS[t.mo - 1]} ${t.y}`; };
const dateTimeText = (date) => { const t = mytParts(date); return `${t.d} ${MONTHS[t.mo - 1]} ${t.y}, ${t.h}:${t.mi}`; };
const parseHour = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})/.exec(String(s));
  return m ? { date: `${m[1]}-${m[2]}-${m[3]}`, mo: +m[2], d: +m[3], hh: m[4] } : null;
};

const contentWidth = (doc) => doc.page.width - 2 * MARGIN;

function banner(doc, subtitle) {
  const w = contentWidth(doc);
  doc.rect(MARGIN, MARGIN, w, 66).fill(C.navy);
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#ffffff')
    .text('Malaysian Airspace ', MARGIN + 16, MARGIN + 14, { continued: true, lineBreak: false })
    .fillColor(C.sky).text('Analytics', { lineBreak: false });
  doc.font('Helvetica').fontSize(10).fillColor('#cfd8e3')
    .text(safe(subtitle), MARGIN + 16, MARGIN + 42, { width: w - 32, lineBreak: false, ellipsis: true });
  doc.y = MARGIN + 66 + 16;
}

function meta(doc, rows) {
  const w = contentWidth(doc);
  let y = doc.y;
  for (const [label, value] of rows) {
    doc.font('Helvetica').fontSize(8.5).fillColor(C.grey).text(label, MARGIN, y, { width: 90, lineBreak: false });
    doc.font('Helvetica').fontSize(9.5).fillColor(C.ink);
    const h = doc.heightOfString(safe(value), { width: w - 100 });
    doc.text(safe(value), MARGIN + 100, y, { width: w - 100 });
    y += Math.max(h, 12) + 5;
  }
  doc.y = y + 6;
}

function kpis(doc, items) {
  const w = contentWidth(doc);
  const y = doc.y;
  const h = 56;
  doc.rect(MARGIN, y, w, h).fill(C.band);
  doc.rect(MARGIN, y, w, 3).fill(C.sky);
  const total = items.reduce((a, i) => a + (i.weight ?? 1), 0);
  let x = MARGIN;
  for (const it of items) {
    const cw = (w * (it.weight ?? 1)) / total;
    doc.font('Helvetica').fontSize(7.5).fillColor(C.grey)
      .text(it.label.toUpperCase(), x + 14, y + 14, { width: cw - 20, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(it.small ? 13 : 18).fillColor(C.ink)
      .text(safe(it.value), x + 14, y + (it.small ? 30 : 27), { width: cw - 20, lineBreak: false });
    x += cw;
  }
  doc.y = y + h + 18;
}

function sectionTitle(doc, text) {
  doc.font('Helvetica-Bold').fontSize(11).fillColor(C.ink).text(safe(text), MARGIN, doc.y, { lineBreak: false });
  doc.y += 18;
}

function note(doc, text) {
  doc.font('Helvetica-Oblique').fontSize(8).fillColor(C.grey).text(safe(text), MARGIN, doc.y + 10, { width: contentWidth(doc) });
}

// cols: [{ key, title, w (nisbah), align }]; cell(row, col, x, y, width) melukis satu sel.
function drawTable(doc, cols, rows, cell) {
  const w = contentWidth(doc);
  const xs = [];
  let acc = MARGIN;
  for (const c of cols) { xs.push(acc); acc += c.w * w; }
  const head = () => {
    const y = doc.y;
    doc.rect(MARGIN, y, w, 20).fill(C.navy);
    cols.forEach((c, i) => doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff')
      .text(c.title, xs[i] + 8, y + 6, { width: c.w * w - 16, align: c.align ?? 'left', lineBreak: false }));
    doc.y = y + 20;
  };
  head();
  rows.forEach((row, ri) => {
    if (doc.y + ROW_H > doc.page.height - 60) { doc.addPage(); doc.y = MARGIN; head(); }
    const y = doc.y;
    if (ri % 2 === 1) doc.rect(MARGIN, y, w, ROW_H).fill(C.zebra);
    cols.forEach((c, i) => cell(row, c, xs[i], y, c.w * w));
    doc.y = y + ROW_H;
  });
  doc.rect(MARGIN, doc.y, w, 0.75).fill(C.line);
  doc.y += 2;
}

const cellText = (doc, text, x, y, w, { align = 'left', bold = false, color = C.ink } = {}) =>
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(color)
    .text(safe(text), x + 8, y + 4, { width: w - 16, align, lineBreak: false });

function hourlyReport(doc, { q, data, airport }) {
  const rows = data
    .map((x) => ({ ...parseHour(x.hourMyt), avg: Number(x.avgAircraft), peak: Number(x.peakAircraft), snaps: Number(x.snapshots) }))
    .filter((x) => x.hh && x.snaps > 0);
  const scope = airport ? `${airport.code}${airport.name ? ` \u00B7 ${airport.name}` : ''}` : 'Semua pesawat';

  banner(doc, `Purata pesawat setiap jam \u00B7 ${scope}`);
  meta(doc, [
    ['Julat', `${dateText(q.from)} hingga ${dateText(q.to)} (masa Malaysia)`],
    ['Lapangan terbang', scope],
    ['Dijana pada', `${dateTimeText(new Date())} (masa Malaysia)`],
    ['Sumber', 'Feed ADS-B awam. Angka ialah pesawat yang diperhatikan, bukan jumlah rasmi penerbangan.'],
  ]);
  if (!rows.length) { note(doc, 'Tiada data dalam julat ini.'); return; }

  const totalSnaps = rows.reduce((a, x) => a + x.snaps, 0);
  const overall = rows.reduce((a, x) => a + x.avg * x.snaps, 0) / totalSnaps;
  const peak = rows.reduce((a, x) => Math.max(a, x.peak), 0);
  const pool = rows.filter((x) => x.snaps >= MIN_SNAPSHOTS);
  const busiest = (pool.length ? pool : rows).reduce((best, x) => (!best || x.avg > best.avg ? x : best), null);
  const coverage = Math.min(1, totalSnaps / (rows.length * SNAPSHOTS_PER_HOUR));
  kpis(doc, [
    { label: 'Purata pesawat', value: fmt(overall, 1) },
    { label: 'Puncak', value: String(peak) },
    { label: 'Jam tersibuk', value: `${busiest.d} ${MONTHS[busiest.mo - 1]} ${busiest.hh}:00 \u00B7 ${fmt(busiest.avg, 1)}`, small: true, weight: 1.8 },
    { label: 'Liputan data', value: `${Math.round(coverage * 100)}%` },
  ]);

  const byHour = new Map();
  for (const x of rows) {
    const b = byHour.get(x.hh) ?? { snaps: 0, sum: 0, peak: 0, days: new Set() };
    b.snaps += x.snaps; b.sum += x.avg * x.snaps; b.peak = Math.max(b.peak, x.peak); b.days.add(x.date);
    byHour.set(x.hh, b);
  }
  const profile = Array.from({ length: 24 }, (_, i) => {
    const hh = String(i).padStart(2, '0');
    const b = byHour.get(hh);
    return { hh, avg: b ? b.sum / b.snaps : null, peak: b ? b.peak : null, days: b ? b.days.size : 0 };
  });
  const maxAvg = Math.max(1, ...profile.map((p) => p.avg ?? 0));

  sectionTitle(doc, 'Corak mengikut jam dalam sehari (masa Malaysia)');
  const cols = [
    { key: 'hh', title: 'Jam', w: 0.16 },
    { key: 'avg', title: 'Purata pesawat', w: 0.5 },
    { key: 'peak', title: 'Puncak', w: 0.17, align: 'right' },
    { key: 'days', title: 'Hari data', w: 0.17, align: 'right' },
  ];
  drawTable(doc, cols, profile, (p, c, x, y, w) => {
    if (c.key === 'hh') return cellText(doc, `${p.hh}:00`, x, y, w, { bold: true });
    if (p.avg == null) return undefined; // jam tanpa data dibiarkan kosong
    if (c.key === 'avg') {
      const bw = Math.max(1, (p.avg / maxAvg) * (w - 80));
      doc.rect(x + 8, y + 3.5, bw, ROW_H - 7).fill(C.bar);
      return cellText(doc, fmt(p.avg, 2), x + bw + 6, y, w - bw - 6 + 8);
    }
    return cellText(doc, c.key === 'peak' ? p.peak : p.days, x, y, w, { align: 'right' });
  });
  note(doc, 'Purata dikira berwajaran mengikut bilangan snapshot setiap jam. Jam yang tiada data dibiarkan kosong. Liputan data = jumlah snapshot dibahagi (bilangan jam berdata x 12).');
}

function airlinesReport(doc, { q, data }) {
  const rows = data.map((x, i) => ({
    rank: i + 1, name: x.airline, obs: Number(x.observations), avg: Number(x.avgAircraft), share: x.share == null ? null : Number(x.share),
  }));
  banner(doc, `Ranking syarikat penerbangan${q.top ? ` \u00B7 ${q.top} teratas` : ''}`);
  meta(doc, [
    ['Julat', `${dateText(q.from)} hingga ${dateText(q.to)} (masa Malaysia)`],
    ['Dijana pada', `${dateTimeText(new Date())} (masa Malaysia)`],
    ['Sumber', 'Feed ADS-B awam. Angka ialah pesawat yang diperhatikan, bukan jumlah rasmi penerbangan.'],
  ]);
  if (!rows.length) { note(doc, 'Tiada data dalam julat ini.'); return; }

  const top = rows[0];
  kpis(doc, [
    { label: 'Syarikat dalam ranking', value: String(rows.length) },
    { label: 'Teratas', value: `${top.name}${top.share == null ? '' : ` \u00B7 ${fmt(top.share * 100, 1)}%`}`, small: true, weight: 1.8 },
    { label: 'Pemerhatian (ranking ini)', value: rows.reduce((a, x) => a + x.obs, 0).toLocaleString('en-US'), weight: 1.3 },
  ]);

  sectionTitle(doc, 'Ranking mengikut bilangan pemerhatian');
  const maxShare = Math.max(0.0001, ...rows.map((r) => r.share ?? 0));
  const cols = [
    { key: 'rank', title: '#', w: 0.08 },
    { key: 'name', title: 'Syarikat penerbangan', w: 0.38 },
    { key: 'obs', title: 'Pemerhatian', w: 0.16, align: 'right' },
    { key: 'avg', title: 'Purata pesawat', w: 0.16, align: 'right' },
    { key: 'share', title: 'Kongsi', w: 0.22, align: 'right' },
  ];
  drawTable(doc, cols, rows, (r, c, x, y, w) => {
    if (c.key === 'rank') return cellText(doc, r.rank, x, y, w, { bold: true });
    if (c.key === 'name') return cellText(doc, r.name, x, y, w);
    if (c.key === 'obs') return cellText(doc, r.obs.toLocaleString('en-US'), x, y, w, { align: 'right' });
    if (c.key === 'avg') return cellText(doc, fmt(r.avg, 2), x, y, w, { align: 'right' });
    if (r.share == null) return undefined;
    const bw = Math.max(1, (r.share / maxShare) * (w - 70));
    doc.rect(x + 8, y + 3.5, bw, ROW_H - 7).fill(C.bar);
    return cellText(doc, `${fmt(r.share * 100, 1)}%`, x, y, w, { align: 'right' });
  });
  if (rows.some((r) => /tidak dikenal/i.test(String(r.name)))) {
    note(doc, '"Tidak dikenal pasti" ialah pemerhatian tanpa syarikat komersial: tanpa callsign, atau callsign berupa nombor pendaftaran pesawat (penerbangan am dan jet korporat).');
  }
}

function footers(doc) {
  const range = doc.bufferedPageRange();
  const w = contentWidth(doc);
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // benarkan teks di tepi bawah tanpa mencetus halaman baharu
    const y = doc.page.height - 34;
    doc.font('Helvetica').fontSize(7.5).fillColor(C.grey);
    doc.text('Malaysian Airspace Analytics', MARGIN, y, { width: w / 3, align: 'left', lineBreak: false });
    doc.text('Pesawat yang diperhatikan oleh feed ADS-B awam', MARGIN + w / 3, y, { width: w / 3, align: 'center', lineBreak: false });
    doc.text(`Halaman ${i - range.start + 1} / ${range.count}`, MARGIN + (2 * w) / 3, y, { width: w / 3, align: 'right', lineBreak: false });
  }
}

/** Hasilkan PDF sebagai Buffer. data: keluaran hourlyData (type=hourly) atau airlinesData (type=airlines). */
export function buildPdf({ type, q, data, airport = null }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4', margin: MARGIN, bufferPages: true,
      info: { Title: `Malaysian Airspace Analytics - ${type === 'hourly' ? 'Corak jam' : 'Ranking syarikat'}`, Author: 'Malaysian Airspace Analytics' },
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      if (type === 'hourly') hourlyReport(doc, { q, data, airport });
      else airlinesReport(doc, { q, data });
      footers(doc);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}