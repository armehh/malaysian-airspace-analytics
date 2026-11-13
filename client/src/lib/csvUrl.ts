export type CsvParams = { type: 'hourly' | 'airlines'; airport?: string; top?: number };

/** URL muat turun CSV daripada API. Julat tarikh lalai (7 hari terakhir) sepadan dengan paparan halaman. */
export function csvUrl(base: string, { type, airport, top }: CsvParams): string {
  const p = new URLSearchParams({ type });
  if (airport) p.set('airport', airport);
  if (top) p.set('top', String(top));
  return `${base.replace(/\/$/, '')}/api/stats/export.csv?${p.toString()}`;
}
