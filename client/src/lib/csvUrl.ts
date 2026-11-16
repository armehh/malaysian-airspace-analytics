export type ExportFormat = 'csv' | 'xlsx';
export type CsvParams = { type: 'hourly' | 'airlines'; airport?: string; top?: number };

/** URL muat turun daripada API (CSV atau Excel). Julat tarikh lalai (7 hari terakhir) sepadan dengan paparan halaman. */
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
