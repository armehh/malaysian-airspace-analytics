import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApi, type AirlineSeries, type Airlines as AirlinesData } from '../lib/api';
import { airlineColor } from '../lib/airlineColors';
import CsvButton from '../components/CsvButton';
import '../airports.css';
import '../airlines.css';

type Bucket = 'hour' | 'day';

export default function Airlines() {
  const [bucket, setBucket] = useState<Bucket>('hour');
  const [share, setShare] = useState(false);
  const rank = useApi<AirlinesData>('/airlines?top=10');
  const series = useApi<AirlineSeries>(`/airlines/timeseries?bucket=${bucket}&top=6`);

  // Tukar baris panjang (masa, syarikat) kepada baris lebar (satu baris setiap masa).
  const { rows, keys } = useMemo(() => {
    const list = series.data?.data ?? [];
    const total = new Map<string, number>();
    const byTime = new Map<string, Record<string, number | string>>();
    for (const d of list) {
      total.set(d.airline, (total.get(d.airline) ?? 0) + d.avgAircraft);
      const row = byTime.get(d.bucketMyt) ?? { t: d.bucketMyt };
      row[d.airline] = d.avgAircraft;
      byTime.set(d.bucketMyt, row);
    }
    const ordered = [...total.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const k = [...ordered.filter((x) => x !== 'Lain-lain'), ...ordered.filter((x) => x === 'Lain-lain')];
    const r = [...byTime.values()].map((row) => {
      for (const key of k) row[key] ??= 0;
      return row;
    });
    return { rows: r, keys: k };
  }, [series.data]);

  if (rank.error && !rank.data) return <p className="msg error">Tidak dapat memuatkan data: {rank.error}. Server percuma Render mungkin sedang bangun, cuba semula sebentar lagi.</p>;
  if (!rank.data) return <p className="msg">Memuatkan data...</p>;
  const ranked = rank.data.data;
  if (!ranked.length) return <p className="msg">Belum ada data syarikat penerbangan dalam 7 hari terakhir.</p>;

  const max = ranked[0].avgAircraft;
  const tick = (v: string) => (bucket === 'day' ? v.slice(5, 10) : `${v.slice(5, 10)} ${v.slice(11, 16)}`);

  return (
    <div className="split">
      <section className="panel">
        <h2>Syarikat tersibuk</h2>
        <p className="label" style={{ margin: 0 }}>Purata pesawat diperhatikan, 7 hari terakhir</p>
        <CsvButton type="airlines" top={10} />
        <div className="rank">
          {ranked.map((r) => (
            <div className="arow" key={r.airline} title={`${r.observations.toLocaleString()} pemerhatian`}>
              <i className="dot" style={{ background: airlineColor(r.airline) }} />
              <span className="nm">{r.airline}</span>
              <span className="v">{r.avgAircraft.toFixed(1)} &middot; {(r.share * 100).toFixed(1)}%</span>
              <span className="bar"><i style={{ width: `${(r.avgAircraft / max) * 100}%`, background: airlineColor(r.airline) }} /></span>
            </div>
          ))}
        </div>
        <p className="caption">Dikenal pasti daripada awalan callsign. "Lain-lain" ialah awalan yang belum ada dalam senarai, dan "Tidak dikenal pasti" ialah pesawat tanpa callsign komersial.</p>
      </section>

      <section className="panel">
        <h2>Campuran syarikat mengikut masa</h2>
        <p className="label" style={{ margin: 0 }}>{share ? 'Peratus daripada pesawat bersyarikat' : 'Purata pesawat'}, 6 syarikat teratas, masa Malaysia</p>
        <div className="toolbar">
          <div className="seg">
            <button className={bucket === 'hour' ? 'on' : ''} onClick={() => setBucket('hour')}>Jam</button>
            <button className={bucket === 'day' ? 'on' : ''} onClick={() => setBucket('day')}>Hari</button>
          </div>
          <div className="seg">
            <button className={!share ? 'on' : ''} onClick={() => setShare(false)}>Bilangan</button>
            <button className={share ? 'on' : ''} onClick={() => setShare(true)}>Peratus</button>
          </div>
        </div>
        <div className="chart">
          {series.error && !series.data ? <p className="msg error">Carta gagal dimuatkan: {series.error}</p> : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rows} stackOffset={share ? 'expand' : 'none'} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="#1f3b53" vertical={false} />
                <XAxis dataKey="t" tickFormatter={tick} stroke="#8aa3b8" tickLine={false} minTickGap={48} />
                <YAxis stroke="#8aa3b8" tickLine={false} axisLine={false} tickFormatter={share ? (v: number) => `${Math.round(v * 100)}%` : undefined} />
                <Tooltip contentStyle={{ background: '#0f2233', border: '1px solid #1f3b53', borderRadius: 8, color: '#e6eef5' }}
                  labelFormatter={(v) => String(v).replace('T', ' ')} formatter={(v) => (typeof v === 'number' ? v.toFixed(1) : v)} />
                <Legend />
                {keys.map((k) => (
                  <Area key={k} type="monotone" dataKey={k} stackId="a" stroke={airlineColor(k)} fill={airlineColor(k)} fillOpacity={0.75} isAnimationActive={false} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        {rows.length < 6 && <p className="note">Data masih sedikit ({rows.length} titik). Carta akan lebih bermakna selepas beberapa hari.</p>}
        <p className="caption">Purata pesawat yang diperhatikan feed ADS-B awam, bukan jumlah rasmi penerbangan. Pesawat tanpa callsign komersial tidak termasuk dalam carta ini.</p>
      </section>
    </div>
  );
}