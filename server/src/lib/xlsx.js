import ExcelJS from 'exceljs';

// Templat laporan Excel bertema dashboard (navy gelap + biru langit).
// type=hourly  -> lembaran "Ringkasan" (KPI + corak jam dalam sehari) dan "Data" (jadual penuh setiap jam)
// type=airlines -> lembaran "Ranking"
// Semua nombor ialah nombor sebenar (bukan teks), jadi pengguna boleh menyusun, menapis dan mengira sendiri.

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const xlsxFilename = (csvName) => csvName.replace(/\.csv$/, '.xlsx');

const C = {
  navy: 'FF0F2233', panel: 'FF16324A', sky: 'FF5CC8FF', skySoft: 'FFBFE6FB', white: 'FFFFFFFF',
  ink: 'FF1B2A38', muted: 'FF5B7388', band: 'FFF3F8FC', line: 'FFD6E2EC', tile: 'FFEAF4FB', warn: 'FFB45309',
};
const FONT = 'Calibri';
const EXPECTED_PER_HOUR = 12; // kutipan setiap 5 minit
const MONTHS = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];
const DAYS = ['Ahd', 'Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab'];

const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const bottom = (argb = C.line) => ({ bottom: { style: 'thin', color: { argb } } });
const pad2 = (n) => String(n).padStart(2, '0');

// Tarikh dipaparkan dalam masa Malaysia (UTC+8) tanpa bergantung pada zon masa pelayan.
const myt = (d) => new Date(new Date(d).getTime() + 8 * 3600 * 1000);
const fmtDate = (d) => { const m = myt(d); return `${m.getUTCDate()} ${MONTHS[m.getUTCMonth()]} ${m.getUTCFullYear()}`; };
const fmtDateTime = (d) => { const m = myt(d); return `${fmtDate(d)}, ${pad2(m.getUTCHours())}:${pad2(m.getUTCMinutes())}`; };
// Label "2026-11-12T16:00" (sudah masa Malaysia) -> Date dengan jam dinding yang sama, supaya Excel memaparkannya tepat.
const parseLabel = (s) => { const [d, t] = s.split('T'); const [y, mo, da] = d.split('-').map(Number); const [h, mi] = t.split(':').map(Number); return new Date(Date.UTC(y, mo - 1, da, h, mi)); };
const shortLabel = (dt) => `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]} ${pad2(dt.getUTCHours())}:${pad2(dt.getUTCMinutes())}`;

function brandBlock(ws, lastCol, subtitle) {
  ws.mergeCells(`A1:${lastCol}1`);
  ws.getRow(1).height = 36;
  ws.getCell('A1').value = { richText: [
    { text: 'Malaysian Airspace ', font: { name: FONT, size: 18, bold: true, color: { argb: C.white } } },
    { text: 'Analytics', font: { name: FONT, size: 18, bold: true, color: { argb: C.sky } } },
  ] };
  ws.getCell('A1').alignment = { vertical: 'middle', indent: 1 };
  ws.mergeCells(`A2:${lastCol}2`);
  ws.getRow(2).height = 24;
  ws.getCell('A2').value = subtitle;
  ws.getCell('A2').font = { name: FONT, size: 12, color: { argb: C.skySoft } };
  ws.getCell('A2').alignment = { vertical: 'middle', indent: 1 };
  for (const r of [1, 2]) for (let c = 1; c <= ws.getColumn(lastCol).number; c++) ws.getCell(r, c).fill = fill(C.navy);
}

// labelEnd = kolum terakhir bagi label; nilai bermula selepasnya hingga lastCol.
function metaRows(ws, startRow, pairs, { labelEnd = 1, lastCol = 6 } = {}) {
  pairs.forEach(([k, v], i) => {
    const r = startRow + i;
    if (labelEnd > 1) ws.mergeCells(r, 1, r, labelEnd);
    ws.getCell(r, 1).value = k;
    ws.getCell(r, 1).font = { name: FONT, size: 10, color: { argb: C.muted } };
    ws.mergeCells(r, labelEnd + 1, r, lastCol);
    ws.getCell(r, labelEnd + 1).value = v;
    ws.getCell(r, labelEnd + 1).font = { name: FONT, size: 11, color: { argb: C.ink } };
    ws.getCell(r, labelEnd + 1).alignment = { horizontal: 'left' };
  });
  return startRow + pairs.length;
}

// Jubin KPI: baris label kecil di atas, nilai besar di bawah. spans = [[kolMula, kolAkhir], ...]
function tiles(ws, row, spans, items) {
  ws.getRow(row).height = 18;
  ws.getRow(row + 1).height = 32;
  items.forEach((it, i) => {
    const [a, b] = spans[i];
    for (const r of [row, row + 1]) { if (b > a) ws.mergeCells(r, a, r, b); }
    const lab = ws.getCell(row, a), val = ws.getCell(row + 1, a);
    lab.value = it.label.toUpperCase();
    lab.font = { name: FONT, size: 9, bold: true, color: { argb: C.muted } };
    lab.alignment = { vertical: 'bottom', horizontal: 'left', indent: 1 };
    val.value = it.value;
    val.numFmt = it.fmt ?? 'General';
    val.font = { name: FONT, size: it.small ? 14 : 20, bold: true, color: { argb: C.navy } };
    val.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    for (let c = a; c <= b; c++) {
      ws.getCell(row, c).fill = fill(C.tile); ws.getCell(row + 1, c).fill = fill(C.tile);
      ws.getCell(row, c).border = { top: { style: 'medium', color: { argb: C.sky } } };
    }
  });
  return row + 2;
}

function sectionTitle(ws, row, text) {
  ws.getCell(row, 1).value = text;
  ws.getCell(row, 1).font = { name: FONT, size: 12, bold: true, color: { argb: C.navy } };
  ws.getRow(row).height = 22;
  ws.getCell(row, 1).alignment = { vertical: 'bottom' };
}

function headerRow(ws, row, labels, aligns = []) {
  ws.getRow(row).height = 24;
  labels.forEach((t, i) => {
    const c = ws.getCell(row, i + 1);
    c.value = t;
    c.font = { name: FONT, size: 10, bold: true, color: { argb: C.white } };
    c.fill = fill(C.navy);
    c.alignment = { vertical: 'middle', horizontal: aligns[i] ?? 'left', indent: aligns[i] === 'right' ? 0 : 1, wrapText: true };
  });
}

function bodyCell(c, { fmt, align = 'left', banded, bold = false, color = C.ink }) {
  if (fmt) c.numFmt = fmt;
  c.font = { name: FONT, size: 10, bold, color: { argb: color } };
  c.alignment = { vertical: 'middle', horizontal: align, indent: align === 'left' ? 1 : 0 };
  c.border = bottom();
  if (banded) c.fill = fill(C.band);
}

const dataBar = (ref, argb = C.sky) => ({ ref, rules: [{ type: 'dataBar', cfvo: [{ type: 'num', value: 0 }, { type: 'max' }], color: { argb }, gradient: false, showValue: true }] });

function pageSetup(ws, { landscape = false, titles } = {}) {
  ws.pageSetup = { paperSize: 9, orientation: landscape ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.7, header: 0.3, footer: 0.3 }, horizontalCentered: true,
    ...(titles ? { printTitlesRow: titles } : {}) };
  ws.headerFooter = { oddFooter: '&L&8Malaysian Airspace Analytics&C&8Pesawat yang diperhatikan oleh feed ADS-B awam&R&8Halaman &P / &N' };
}

function noteRow(ws, row, text, cols = 6) {
  ws.mergeCells(row, 1, row, cols);
  const c = ws.getCell(row, 1);
  c.value = text;
  c.font = { name: FONT, size: 9, italic: true, color: { argb: C.muted } };
  c.alignment = { wrapText: true, vertical: 'top' };
  ws.getRow(row).height = Math.max(15, Math.ceil(text.length / 105) * 13);
}

// ---------------------------------------------------------------- hourly
function buildHourly(wb, { q, data, airport, generatedAt }) {
  const rows = data.map((x) => ({ ...x, dt: parseLabel(x.hourMyt) }));
  const where = airport ? (airport.name ? `${airport.code} · ${airport.name}` : airport.code) : 'Semua pesawat di ruang udara Malaysia';

  // ---- statistik
  const totalSnap = rows.reduce((s, r) => s + r.snapshots, 0);
  const sumAircraft = rows.reduce((s, r) => s + r.avgAircraft * r.snapshots, 0);
  const avg = totalSnap ? sumAircraft / totalSnap : null;
  const peak = rows.length ? Math.max(...rows.map((r) => r.peakAircraft)) : null;
  const eligible = rows.filter((r) => r.snapshots >= EXPECTED_PER_HOUR / 2);
  const busiest = (eligible.length ? eligible : rows).reduce((b, r) => (!b || r.avgAircraft > b.avgAircraft ? r : b), null);
  const coverage = rows.length ? totalSnap / (rows.length * EXPECTED_PER_HOUR) : null;
  const profile = Array.from({ length: 24 }, (_, h) => {
    const rs = rows.filter((r) => r.dt.getUTCHours() === h);
    const sn = rs.reduce((s, r) => s + r.snapshots, 0);
    return { h, avg: sn ? rs.reduce((s, r) => s + r.avgAircraft * r.snapshots, 0) / sn : null, peak: rs.length ? Math.max(...rs.map((r) => r.peakAircraft)) : null, days: rs.length };
  });

  // ================= Lembaran 1: Ringkasan
  const ws = wb.addWorksheet('Ringkasan', { views: [{ showGridLines: false }], properties: { tabColor: { argb: C.sky } } });
  ws.columns = [{ width: 24 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }];
  brandBlock(ws, 'F', `Purata pesawat setiap jam  ·  ${where}`);
  let r = metaRows(ws, 4, [
    ['Julat', `${fmtDate(q.from)} hingga ${fmtDate(q.to)} (masa Malaysia)`],
    ['Lapangan terbang', where],
    ['Dijana pada', `${fmtDateTime(generatedAt)} (masa Malaysia)`],
    ['Sumber', 'Feed ADS-B awam. Angka ialah pesawat yang diperhatikan, bukan jumlah rasmi penerbangan.'],
  ]) + 1;
  r = tiles(ws, r, [[1, 2], [3, 3], [4, 5], [6, 6]], [
    { label: 'Purata pesawat', value: avg, fmt: '0.0' },
    { label: 'Puncak', value: peak, fmt: '0' },
    { label: 'Jam tersibuk', value: busiest ? `${shortLabel(busiest.dt)}  ·  ${busiest.avgAircraft.toFixed(1)}` : '-', small: true },
    { label: 'Liputan data', value: coverage, fmt: '0%' },
  ]) + 1;

  sectionTitle(ws, r++, 'Corak mengikut jam dalam sehari (masa Malaysia)');
  headerRow(ws, r++, ['Jam', 'Purata pesawat', 'Puncak', 'Hari data'], ['left', 'right', 'right', 'right']);
  const p0 = r;
  profile.forEach((p, i) => {
    const row = r + i, banded = i % 2 === 1;
    const cells = [`${pad2(p.h)}:00`, p.avg, p.peak, p.days || null];
    cells.forEach((v, ci) => {
      const c = ws.getCell(row, ci + 1);
      c.value = v;
      bodyCell(c, { fmt: ci === 1 ? '0.00' : ci > 1 ? '0' : undefined, align: ci === 0 ? 'left' : 'right', banded, bold: ci === 0 });
    });
  });
  r += 24;
  if (rows.length) ws.addConditionalFormatting(dataBar(`B${p0}:B${r - 1}`));
  r += 1;
  noteRow(ws, r++, 'Purata dikira berwajaran mengikut bilangan snapshot setiap jam. Jam yang tiada data dibiarkan kosong. ' +
    (rows.length && rows.length < 48 ? 'Data masih kurang daripada dua hari, jadi corak ini belum mewakili hari biasa.' : ''));
  if (!rows.length) noteRow(ws, r++, 'Tiada data untuk julat ini.');
  pageSetup(ws);

  // ================= Lembaran 2: Data
  const wd = wb.addWorksheet('Data', { views: [{ showGridLines: false, state: 'frozen', ySplit: 2 }], properties: { tabColor: { argb: C.navy } } });
  wd.columns = [{ width: 20 }, { width: 8 }, { width: 18 }, { width: 12 }, { width: 12 }, { width: 14 }];
  wd.mergeCells('A1:F1');
  wd.getRow(1).height = 26;
  wd.getCell('A1').value = `Data setiap jam  ·  ${where}`;
  wd.getCell('A1').font = { name: FONT, size: 13, bold: true, color: { argb: C.white } };
  wd.getCell('A1').alignment = { vertical: 'middle', indent: 1 };
  for (let c = 1; c <= 6; c++) wd.getCell(1, c).fill = fill(C.navy);
  headerRow(wd, 2, ['Tarikh dan jam', 'Hari', 'Purata pesawat', 'Puncak', 'Snapshot', 'Liputan data'], ['left', 'center', 'right', 'right', 'right', 'right']);
  rows.forEach((x, i) => {
    const row = 3 + i, banded = i % 2 === 1;
    const vals = [x.dt, DAYS[x.dt.getUTCDay()], x.avgAircraft, x.peakAircraft, x.snapshots, x.snapshots / EXPECTED_PER_HOUR];
    const fmts = ['yyyy-mm-dd hh:mm', undefined, '0.00', '0', '0', '0%'];
    const aligns = ['left', 'center', 'right', 'right', 'right', 'right'];
    vals.forEach((v, ci) => { const c = wd.getCell(row, ci + 1); c.value = v; bodyCell(c, { fmt: fmts[ci], align: aligns[ci], banded, bold: ci === 0 }); });
  });
  const last = 2 + rows.length;
  if (rows.length) {
    wd.autoFilter = { from: 'A2', to: `F${last}` };
    wd.addConditionalFormatting(dataBar(`C3:C${last}`));
    wd.addConditionalFormatting({ ref: `F3:F${last}`, rules: [{ type: 'cellIs', operator: 'lessThan', formulae: [0.75], style: { font: { color: { argb: C.warn }, italic: true } } }] });
  }
  noteRow(wd, last + 2, 'Liputan data = snapshot sebenar daripada 12 yang dijangka setiap jam (kutipan setiap 5 minit). Jam berwarna jingga tidak lengkap, contohnya ketika pelayan tidur atau sedang dikemas kini.');
  pageSetup(wd, { titles: '1:2' });
}

// ---------------------------------------------------------------- airlines
function buildAirlines(wb, { q, data, generatedAt }) {
  const ws = wb.addWorksheet('Ranking', { views: [{ showGridLines: false }], properties: { tabColor: { argb: C.sky } } });
  ws.columns = [{ width: 8 }, { width: 32 }, { width: 16 }, { width: 18 }, { width: 24 }];
  brandBlock(ws, 'E', 'Ranking syarikat penerbangan');
  const top = data[0];

  const shown = data.reduce((s, x) => s + (x.share ?? 0), 0);
  let r = metaRows(ws, 4, [
    ['Julat', `${fmtDate(q.from)} hingga ${fmtDate(q.to)} (masa Malaysia)`],
    ['Senarai', `${data.length} syarikat teratas mengikut bilangan pemerhatian`],
    ['Dijana pada', `${fmtDateTime(generatedAt)} (masa Malaysia)`],
    ['Sumber', 'Feed ADS-B awam. Syarikat dikenal pasti daripada awalan callsign.'],
  ], { labelEnd: 2, lastCol: 5 }) + 1;
  r = tiles(ws, r, [[1, 2], [3, 3], [4, 5]], [
    { label: 'Syarikat teratas', value: top ? top.airline : '-', small: true },
    { label: 'Kongsi', value: top?.share ?? null, fmt: '0.0%' },
    { label: 'Kongsi senarai ini', value: data.length ? shown : null, fmt: '0.0%' },
  ]) + 1;
  headerRow(ws, r++, ['#', 'Syarikat penerbangan', 'Pemerhatian', 'Purata pesawat', 'Kongsi (semua pesawat)'], ['center', 'left', 'right', 'right', 'right']);
  const t0 = r;
  data.forEach((x, i) => {
    const row = r + i, banded = i % 2 === 1;
    const vals = [i + 1, x.airline, x.observations, x.avgAircraft, x.share];
    const fmts = [undefined, undefined, '#,##0', '0.00', '0.00%'];
    const aligns = ['center', 'left', 'right', 'right', 'right'];
    vals.forEach((v, ci) => { const c = ws.getCell(row, ci + 1); c.value = v; bodyCell(c, { fmt: fmts[ci], align: aligns[ci], banded, bold: ci === 1, color: ci === 0 ? C.muted : C.ink }); });
  });
  r += data.length;
  if (data.length) ws.addConditionalFormatting(dataBar(`E${t0}:E${r - 1}`));
  r += 1;
  noteRow(ws, r++, '"Tidak dikenal pasti" ialah pesawat tanpa callsign komersial. Kongsi dikira daripada semua pemerhatian dalam julat, bukan daripada senarai ini sahaja.', 5);
  if (!data.length) noteRow(ws, r++, 'Tiada data untuk julat ini.', 5);
  pageSetup(ws);
}

export async function buildWorkbook({ type, q, data, airport = null, generatedAt = new Date() }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Malaysian Airspace Analytics';
  wb.created = generatedAt;
  wb.title = type === 'hourly' ? 'Purata pesawat setiap jam' : 'Ranking syarikat penerbangan';
  (type === 'hourly' ? buildHourly : buildAirlines)(wb, { q, data, airport, generatedAt });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
