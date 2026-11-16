import CsvButton from './CsvButton';
import type { CsvParams } from '../lib/csvUrl';

/** Dua pautan muat turun bersebelahan: Excel bertema dan CSV mentah. */
export default function ExportButtons(params: CsvParams) {
  return (
    <span className="expbtns">
      <CsvButton {...params} format="xlsx" />
      <CsvButton {...params} format="csv" />
    </span>
  );
}
