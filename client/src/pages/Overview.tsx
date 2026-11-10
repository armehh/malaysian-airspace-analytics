import { Area, AreaChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApi, type Overview as Data } from '../lib/api';

const MIN_SNAPSHOTS = 6; // jangkaan 12 sejam; kurang daripada ini = jam tidak lengkap

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TodayDot(p: any) {
  const { cx, cy, payload, index } = p;
  if (cx == null || cy == null) return <g key={index} />;
  const partial = payload.snapshots < MIN_SNAPSHOTS;
  return <circle key={index} cx={cx} cy={cy} r={4.5} fill={partial ? '#0f2233' : '#5cc8ff'} stroke={partial ? '#f2b441' : '#0f2233'} strokeWidth={2} />;
}

export default function Overview() {
  const { data, error } = useApi<Data>('/overview', 60_000);
  if (error && !data) return <p className="msg error">Tidak dapat memuatkan data: {error}. Server percuma Render mungkin sedang bangun, cuba semula sebentar lagi.</p>;
  if (!data) return <p className="msg">Memuatkan data…</p>;
  if (!data.latest) return <p className="msg">Belum ada data. Pastikan cron-job.org memanggil /api/collect.</p>;

  const { latest, trend } = data;
  const ageMin = Math.round((Date.now() - new Date(latest.takenAt).getTime()) / 60000);
  const late = ageMin > 15;
  const asOf = new Date(latest.takenAt).toLocaleTimeString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit' });
  const name = (c: { callsign: string | null; icao24: string }) => c.callsign ?? c.icao24;
  const hasUsual = trend.some((t) => t.usualAircraft != null);

  return (
    <>
      <div className={`pill statusrow ${late ? 'late' : ''}`}><i />{late ? `Collector tertangguh (${ageMin} min lalu)` : `Collector aktif · ${asOf} masa Malaysia`}</div>
      <section className="grid">
        <div className="panel hero">
          <p className="label">Pesawat di udara sekarang</p>
          <div className="count">{latest.aircraft}</div>
          <p className="sub">Diperhatikan di ruang udara Malaysia</p>
        </div>
        <div className="panel"><p className="label">Syarikat penerbangan</p><p className="kpi">{latest.airlines}</p></div>
        {latest.highest && <div className="panel"><p className="label">Paling tinggi</p><p className="kpi">{latest.highest.alt_m.toLocaleString()}<small>m</small></p><p className="who">{name(latest.highest)}</p></div>}
        {latest.fastest && <div className="panel"><p className="label">Paling laju</p><p className="kpi">{latest.fastest.speed_kmh.toLocaleString()}<small>km/j</small></p><p className="who">{name(latest.fastest)}</p></div>}
      </section>

      <section className="panel chartpanel">
        <h2>Trafik 24 jam terakhir</h2>
        <p className="label" style={{ margin: 0 }}>Purata pesawat setiap jam, masa Malaysia</p>
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
              <defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5cc8ff" stopOpacity={0.45} /><stop offset="100%" stopColor="#5cc8ff" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid stroke="#1f3b53" vertical={false} />
              <XAxis dataKey="hourMyt" tickFormatter={(v: string) => v.slice(11, 16)} stroke="#8aa3b8" tickLine={false} />
              <YAxis stroke="#8aa3b8" tickLine={false} axisLine={false} domain={[0, 'auto']} />
              <Tooltip contentStyle={{ background: '#0f2233', border: '1px solid #1f3b53', borderRadius: 8, color: '#e6eef5' }} labelFormatter={(v) => String(v).replace('T', ' ')} formatter={(v) => (typeof v === 'number' ? v.toFixed(1) : v)} />
              <Legend />
              <Area dataKey="avgAircraft" name="Hari ini" stroke="#5cc8ff" strokeWidth={2.5} fill="url(#fill)" dot={<TodayDot />} isAnimationActive={false} />
              <Line dataKey="usualAircraft" name="Paras biasa" stroke="#f2b441" strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {!hasUsual && <p className="note">Garis "Paras biasa" akan muncul selepas collector mengumpul data melebihi sehari.</p>}
        {trend.length < 6 && <p className="note">Data masih sedikit ({trend.length} jam). Carta akan lebih bermakna selepas beberapa hari.</p>}
        <p className="caption">Purata pesawat yang diperhatikan feed ADS-B awam, bukan jumlah rasmi penerbangan. Titik berbulatan kosong ialah jam dengan data tidak lengkap (kurang {MIN_SNAPSHOTS} snapshot).</p>
      </section>
    </>
  );
}
