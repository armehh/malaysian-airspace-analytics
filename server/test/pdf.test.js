import { describe, it, expect } from 'vitest';
import { buildPdf, pdfFilename, PDF_MIME } from '../src/lib/pdf.js';

const q = { from: '2026-11-12T16:00:00.000Z', to: '2026-11-14T16:00:00.000Z', airport: 'KUL' };
const hourly = Array.from({ length: 48 }, (_, i) => ({
  hourMyt: `2026-11-${i < 24 ? '13' : '14'}T${String(i % 24).padStart(2, '0')}:00`,
  avgAircraft: 3 + (i % 24) / 2, peakAircraft: 6 + (i % 5), snapshots: 12,
}));

describe('buildPdf', () => {
  it('type=hourly menghasilkan PDF sah', async () => {
    const buf = await buildPdf({ type: 'hourly', q, data: hourly, airport: { code: 'KUL', name: 'Kuala Lumpur Intl (KLIA)' } });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(1500);
  });

  it('type=airlines menghasilkan PDF sah, termasuk aksara bukan Latin-1', async () => {
    const data = [{ airline: 'AirAsia', observations: 100, avgAircraft: 1.2, share: 0.2 }, { airline: 'Test \u4e2d\u6587 Air', observations: 50, avgAircraft: 0.6, share: null }];
    const buf = await buildPdf({ type: 'airlines', q: { ...q, airport: undefined, top: 10 }, data });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('data kosong tidak mencetuskan ralat', async () => {
    const buf = await buildPdf({ type: 'hourly', q, data: [], airport: null });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('banyak baris melangkau ke halaman seterusnya', async () => {
    const data = Array.from({ length: 80 }, (_, i) => ({ airline: `Syarikat ${i + 1}`, observations: 1000 - i, avgAircraft: 2, share: 0.01 }));
    const buf = await buildPdf({ type: 'airlines', q, data });
    expect((buf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
  });
});

describe('pdfFilename / PDF_MIME', () => {
  it('menukar sambungan .csv kepada .pdf', () => {
    expect(pdfFilename('airspace-hourly-2026-11-06_2026-11-13.csv')).toBe('airspace-hourly-2026-11-06_2026-11-13.pdf');
    expect(PDF_MIME).toBe('application/pdf');
  });
});