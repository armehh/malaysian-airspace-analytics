import { useEffect, useMemo, useRef, useState } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useApi, type Density } from '../lib/api';
import '../airports.css';
import '../heatmap.css';

const G = { ...L } as Record<string, unknown>; // salinan boleh ubah untuk leaflet.heat
type HeatFactory = (pts: [number, number, number][], opts: object) => L.Layer;
const RANGES = [{ d: 1, label: '24 jam' }, { d: 7, label: '7 hari' }, { d: 30, label: '30 hari' }];

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
    if (!data) return;
    let live = true;
    (async () => {
      // leaflet.heat mencari L global, jadi ia dimuat selepas L ditetapkan.
      (window as unknown as { L: unknown }).L = G;
      await import('leaflet.heat');
      if (!live || !map.current) return;
      layer.current?.remove();
      const max = data.data[0]?.count ?? 1;
      const pts = data.data.map((d): [number, number, number] => [d.lat, d.lng, Math.sqrt(d.count / max)]);
      const heat = (G as unknown as { heatLayer: HeatFactory }).heatLayer;
      layer.current = heat(pts, {
        radius: 18, blur: 16, maxZoom: 9, minOpacity: 0.25,
        gradient: { 0.2: '#1b4965', 0.45: '#5fa8d3', 0.7: '#f2b441', 1: '#ff6b6b' },
      }).addTo(map.current);
    })();
    return () => { live = false; };
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
      <p className="caption">Setiap sel grid kira-kira 11 km. Warna menunjukkan bilangan kedudukan yang diperhatikan feed ADS-B awam (skala punca kuasa dua), bukan laluan penerbangan. Liputan bergantung pada penerima sukarelawan.</p>
    </section>
  );
}