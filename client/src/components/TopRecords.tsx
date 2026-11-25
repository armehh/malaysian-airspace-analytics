import { useState } from 'react';
import { useApi, type Records } from '../lib/api';
import {
  METRICS, PERIODS, barPercent, formatObserved, recordName, recordsPath, unitOf,
  type RecordMetric, type RecordPeriod,
} from '../lib/records';
import '../topRecords.css';

/** 10 pesawat paling tinggi / paling laju: 7 hari, 30 hari atau semua masa (rekod kekal). Satu baris setiap pesawat. */
export default function TopRecords() {
  const [metric, setMetric] = useState<RecordMetric>('altitude');
  const [period, setPeriod] = useState<RecordPeriod>('all');
  const { data, error, loading } = useApi<Records>(recordsPath(metric, period), 300_000);

  const rows = data?.data ?? [];
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0);
  const shown = data?.metric ?? metric; // unit mengikut data yang dipaparkan, bukan pilihan yang sedang dimuat
  const stale = loading || (data != null && (data.metric !== metric || data.period !== period));

  return (
    <section className="panel chartpanel toprec">
      <h2>Pesawat paling tinggi dan paling laju</h2>
      <p className="label" style={{ margin: 0 }}>10 teratas, satu baris bagi setiap pesawat</p>

      <div className="toprec__bar">
        <div className="trseg" role="group" aria-label="Jenis rekod">
          {METRICS.map((m) => (
            <button key={m.value} type="button" aria-pressed={metric === m.value} onClick={() => setMetric(m.value)}>{m.label}</button>
          ))}
        </div>
        <div className="trseg" role="group" aria-label="Tempoh">
          {PERIODS.map((p) => (
            <button key={p.value} type="button" aria-pressed={period === p.value} onClick={() => setPeriod(p.value)}>{p.label}</button>
          ))}
        </div>
      </div>

      {error && !data && <p className="msg error">Tidak dapat memuatkan rekod: {error}.</p>}
      {loading && !data && !error && <p className="msg">Memuatkan rekod...</p>}
      {data && (
        <ol className={`toprec__list${stale ? ' is-stale' : ''}`}>
          {rows.map((r) => (
            <li key={r.icao24} className="toprec__row">
              <span className="toprec__rank">{r.rank}</span>
              <span className="toprec__who">
                <b>{recordName(r)}</b>
                <small>{r.airline ?? 'Tidak dikenal pasti'}</small>
              </span>
              <span className="toprec__val">{r.value.toLocaleString()}<small>{unitOf(shown)}</small></span>
              <span className="toprec__when">{formatObserved(r.observedMyt)}</span>
              <span className="toprec__track" aria-hidden="true"><i style={{ width: `${barPercent(r.value, max)}%` }} /></span>
            </li>
          ))}
        </ol>
      )}
      {data && rows.length === 0 && !stale && <p className="note">Belum ada rekod untuk tempoh ini.</p>}

      <p className="caption">
        7 hari dan 30 hari ialah tempoh terakhir, dikira daripada data mentah. Semua masa termasuk rekod yang disimpan walaupun data mentah
        dipadam selepas 30 hari, dan hanya merangkumi tempoh collector mengumpul data. Nilai ketinggian dan kelajuan yang mustahil ditapis,
        tetapi data ADS-B awam masih boleh mengandungi ralat.
      </p>
    </section>
  );
}
