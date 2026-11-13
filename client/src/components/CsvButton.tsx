import { csvUrl, type CsvParams } from '../lib/csvUrl';
import '../csvButton.css';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

// Pautan biasa: pelayan menghantar Content-Disposition: attachment, jadi pelayar memuat turun fail.
export default function CsvButton({ label = 'Muat turun CSV', ...params }: CsvParams & { label?: string }) {
  return <a className="csvbtn" href={csvUrl(BASE, params)} download>{label}</a>;
}
