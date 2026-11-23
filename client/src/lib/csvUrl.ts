export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

/** Pilihan dalam menu "Muat turun", mengikut susunan paparan. */
export const EXPORT_OPTIONS: { format: ExportFormat; label: string; ext: string }[] = [
  { format: 'xlsx', label: 'Excel', ext: '.xlsx' },
  { format: 'csv', label: 'CSV', ext: '.csv' },
  { format: 'pdf', label: 'PDF', ext: '.pdf' },
];
export type CsvParams = { type: 'hourly' | 'airlines'; airport?: string; top?: number };

/** URL muat turun daripada API (CSV, Excel atau PDF). Julat tarikh lalai (7 hari terakhir) sepadan dengan paparan halaman. */
export function exportUrl(base: string, { type, airport, top }: CsvParams, format: ExportFormat = 'csv'): string {
  const p = new URLSearchParams({ type });
  if (airport) p.set('airport', airport);
  if (top) p.set('top', String(top));
  return `${base.replace(/\/$/, '')}/api/stats/export.${format}?${p.toString()}`;
}

/** URL muat turun CSV. */
export function csvUrl(base: string, params: CsvParams): string {
  return exportUrl(base, params, 'csv');
}
