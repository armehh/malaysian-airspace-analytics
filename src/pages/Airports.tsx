import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApi, type AirportList, type Compare, type Hourly, type Weekly } from '../lib/api';
import '../airports.css';

const DAYS = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Isnin dahulu

export default function Airports() {
  const list = useApi<AirportList>('/airports');
  const cmp = useApi<Compare>('/airports/compare');
  const [picked, setPicked] = useState<string>();

  const ranked = cmp.data?.data ?? [];
  const code = picked ?? ranked[0]?.airport;
  const names = Object.fromEntries((list.data?.airports ?? []).map((a) => [a.code, a.name]));
  const hourly = useApi<Hourly>(code ? `/hourly?airport=${code}` : null);
  const weekly = useApi<Weekly>(code ? `/airports/${code}/weekly` : null);

  if (cmp.error && !cmp.data) return <p className="msg error">Tidak dapat memuatkan data: {cmp.error}</p>;
  if (!cmp.data) return <p className="msg">Memuatkan data…</p>;
  if (!ranked.length) return <p className="msg">Belum ada pesawat dikesan berhampiran mana-mana lapangan terbang dalam 7 hari terakhir.</p>;

  const max = ranked[0].avgAircraft;
  const cells = new Map((weekly.data?.data ?? []).map((c) => [`${c.dow}-${c.hour}`, c]));
  const peakVal = Math.max(0, ...(weekly.data?.data ?? []).map((c) => c.avgAircraft));
  const peak = (weekly.data?.data ?? []).find((c) => c.avgAircraft === peakVal && peakVal > 0);

  return (
    <div className="split">
      <section className="panel">
        <h2>Lapangan terbang tersibuk</h2>
        <p className="label" style={{ margin: 0 }}>Purata pesawat berdekatan, 7 hari terakhir</p>
        <div className="rank">
          {ranked.map((r) => (
            <button key={r.airport} className={r.airport === code ? 'on' : ''} onClick={() => setPicked(r.airport)} title={names[r.airport]}>
              <b>{r.airport}</b>
              <span className="bar"><i style={{ width: `${(r.avgAircraft / max) * 100}%` }} /></span>
              <span className="v">{r.avgAircraft.toFixed(1)}</span>
            </button>
          ))}
        </div>
        <p className="caption">"Berdekatan" bermaksud dalam lingkungan 60 km, bukan semestinya berlepas atau mendarat.</p>
      </section>

      <div>
        <section className="panel">
          <div className="picked"><h2>{code}</h2><span className="label" style={{ margin: 0 }}>{names[code ?? '']}</span></div>
          {peak && <p className="busy">Paling sibuk: {DAYS[peak.dow]}, {String(peak.hour).padStart(2, '0')}:00 (purata {peak.avgAircraft.toFixed(1)} pesawat)</p>}
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourly.data?.data ?? []} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <defs><linearGradient id="fillA" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5cc8ff" stopOpacity={0.4} /><stop offset="100%" stopColor="#5cc8ff" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke="#1f3b53" vertical={false} />
                <XAxis dataKey="hourMyt" tickFormatter={(v: string) => v.slice(5, 10)} stroke="#8aa3b8" tickLine={false} minTickGap={48} />
                <YAxis stroke="#8aa3b8" tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#0f2233', border: '1px solid #1f3b53', borderRadius: 8, color: '#e6eef5' }} labelFormatter={(v) => String(v).replace('T', ' ')} formatter={(v) => (typeof v === 'number' ? v.toFixed(1) : v)} />
                <Area dataKey="avgAircraft" name="Purata pesawat" stroke="#5cc8ff" strokeWidth={2} fill="url(#fillA)" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="caption">Purata pesawat berdekatan setiap jam, masa Malaysia.</p>
        </section>

        <section className="panel" style={{ marginTop: 16 }}>
          <h2>Corak mingguan</h2>
          <p className="label" style={{ margin: 0 }}>Purata pesawat ikut hari dan jam. Warna lebih terang = lebih sibuk.</p>
          <div className="scroll">
            <div className="heat">
              <span />
              {Array.from({ length: 24 }, (_, h) => <span key={h} className="hh">{h % 3 === 0 ? h : ''}</span>)}
              {ORDER.map((d) => (
                <div key={d} style={{ display: 'contents' }}>
                  <span>{DAYS[d].slice(0, 3)}</span>
                  {Array.from({ length: 24 }, (_, h) => {
                    const c = cells.get(`${d}-${h}`);
                    const a = c && peakVal ? 0.12 + 0.88 * (c.avgAircraft / peakVal) : 0;
                    return <span key={h} className="cell" style={c ? { background: `rgba(92,200,255,${a})` } : undefined}
                      title={c ? `${DAYS[d]} ${String(h).padStart(2, '0')}:00 · purata ${c.avgAircraft.toFixed(1)} (${c.snapshots} snapshot)` : `${DAYS[d]} ${String(h).padStart(2, '0')}:00 · belum ada data`} />;
                  })}
                </div>
              ))}
            </div>
          </div>
          <p className="caption">Sel kosong bermakna belum ada data pada hari dan jam itu. Corak ini menjadi bermakna selepas beberapa minggu pengumpulan.</p>
        </section>
      </div>
    </div>
  );
}
