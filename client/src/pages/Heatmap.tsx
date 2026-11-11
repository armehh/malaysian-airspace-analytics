import { useEffect, useMemo, useRef, useState } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useApi, type Density } from '../lib/api';
import '../airports.css';
import '../heatmap.css';

const RANGES = [{ d: 1, label: '24 jam' }, { d: 7, label: '7 hari' }, { d: 30, label: '30 hari' }];
const STEPS = ['#1b4965', '#5fa8d3', '#f2b441', '#ff6b6b'];
const colorFor = (t: number) => STEPS[Math.min(3, Math.floor(t * 4))];

export default function Heatmap() {
  const [days, setDays] = useState(1);
  // Dibundarkan kepada 5 minit supaya URL (dan cache server) stabil.
  const from = useMemo(() => new Date(Math.floor(Date.now() / 300000) * 300000 - days * 864e5).toISOString(), [days]);
  const { data, error } = useApi<Density>(`/density?from=${from}&grid=0.1`);

  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.Layer | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { center: [4.2, 108], zoom: 6, minZoom: 5, maxZoom: 11 });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', className: 'dark-tiles', maxZoom: 19,
    }).addTo(m);
    map.current = m;
    return () => { m.remove(); map.current = null; layer.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !data) return;
    layer.current?.remove();
    const group = L.layerGroup();
    const renderer = L.canvas({ padding: 0.5 });
    const half = data.grid / 2;
    const max = data.data[0]?.count ?? 1;
    for (const d of data.data) {
      const t = Math.sqrt(d.count / max); // skala punca kuasa dua
      L.rectangle([[d.lat - half, d.lng - half], [d.lat + half, d.lng + half]], {
        renderer, stroke: false, interactive: false,
        fillColor: colorFor(t), fillOpacity: 0.3 + 0.6 * t,
      }).addTo(group);
    }
    group.addTo(m);
    layer.current = group;
  }, [data]);

  return (
    <section className="panel">
      <h2>Peta kepadatan</h2>
      <p className="label" style={{ margin: 0 }}>Di mana pesawat paling kerap diperhatikan, ruang udara Malaysia</p>
      <div className="toolbar">
        <div className="seg">
          {RANGES.map((r) => (
            <button key={r.d} className={days === r.d ? 'on' : ''} onClick={() => setDays(r.d)}>{r.label}</button>
          ))}
        </div>
      </div>
      <div ref={el} className="map" />
      {error && !data && <p className="msg error">Tidak dapat memuatkan data: {error}. Server percuma Render mungkin sedang bangun.</p>}
      {data && data.data.length === 0 && <p className="note">Belum ada data untuk tempoh ini.</p>}
      {data && data.snapshots > 0 && data.snapshots < 288 && days > 1 && (
        <p className="note">Data baru {data.snapshots} snapshot, jadi tempoh {days} hari belum penuh.</p>
      )}
      <p className="caption">Setiap petak ialah sel grid kira-kira 11 km. Warna biru ke merah menunjukkan bilangan kedudukan yang diperhatikan feed ADS-B awam (skala punca kuasa dua), bukan laluan penerbangan. Liputan bergantung pada penerima sukarelawan.</p>
    </section>
  );
}