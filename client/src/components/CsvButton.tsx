import { exportUrl, type CsvParams, type ExportFormat } from '../lib/csvUrl';
import '../csvButton.css';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const LABELS: Record<ExportFormat, string> = { csv: 'Muat turun CSV', xlsx: 'Muat turun Excel' };

// Pautan biasa: pelayan menghantar Content-Disposition: attachment, jadi pelayar memuat turun fail.
export default function CsvButton({ format = 'csv', label, ...params }: CsvParams & { format?: ExportFormat; label?: string }) {
  return <a className="csvbtn" href={exportUrl(BASE, params, format)} download>{label ?? LABELS[format]}</a>;
}
