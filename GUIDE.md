# Panduan Langkah demi Langkah — Malaysian Airspace Analytics

Fasa 1 dan 2 (collector, skema, API, ujian) sudah siap dalam `server/`. Dokumen ini panduan untuk **deploy sekarang** dan **bina Fasa 3–5 sendiri**.

> **Paling penting:** data ADS-B tak boleh diambil semula. Setiap hari collector tak jalan, data hari tu hilang. Jadi buat Bahagian A hari ni juga, sebelum sentuh dashboard.

---

## A. Hidupkan collector (±1–2 jam)

### A1. Repo GitHub
```bash
cd malaysian-airspace-analytics
git init && git add . && git commit -m "feat: collector, schema and stats API"
# cipta repo kosong di github.com, kemudian:
git remote add origin https://github.com/<username>/malaysian-airspace-analytics.git
git push -u origin main
```
Fail `.env` sudah dalam `.gitignore`. Jangan commit rahsia.

### A2. Pangkalan data (Neon atau Supabase)
1. Daftar di neon.tech, cipta projek, pilih wilayah **Singapore**.
2. Salin *connection string*. Pastikan ada `?sslmode=require` di hujung.
3. Di komputer anda:
   ```bash
   cd server && cp .env.example .env
   # isi DATABASE_URL dengan string Neon, dan COLLECTOR_SECRET dengan rentetan rawak:
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   npm install && npm run migrate
   ```
   Output: `Dijalankan: 001_init.sql`.

### A3. Uji feed dari komputer anda dulu
Sandbox saya tak boleh capai internet luar, jadi **URL feed belum diuji secara langsung**. Uji sendiri:
```bash
curl -s "https://api.adsb.lol/v2/point/4.0/102.0/250" | head -c 400
```
Anda patut nampak JSON dengan `"ac":[ ... ]`. Kalau 404 atau format lain, ubah `FEEDS` dalam `server/src/collector/feeds.js` (satu baris setiap feed). Semak juga terma penggunaan setiap penyedia, sebab proposal anda sendiri menyenaraikan ini sebagai risiko.

Kemudian uji penuh secara tempatan:
```bash
npm run dev
curl -X POST -H "x-collector-secret: <rahsia anda>" localhost:3000/api/collect
# jangka: {"ok":true,"snapshotId":1,"source":"adsb.lol","aircraft":7x}
curl localhost:3000/api/stats/overview
```

### A4. Deploy API ke Render
1. render.com → **New → Web Service** → sambung repo GitHub.
2. **Root Directory:** `server` · **Build:** `npm install` · **Start:** `npm start` · Instance: Free.
3. **Environment variables:** `DATABASE_URL`, `COLLECTOR_SECRET`, `CORS_ORIGIN` (sementara `*`, tukar ke URL Vercel nanti).
4. Selepas deploy, uji: `https://<nama>.onrender.com/api/health` → `{"ok":true}`.

### A5. Penjadual (cron-job.org)
1. Daftar, **Create cronjob**:
   - URL: `https://<nama>.onrender.com/api/collect`
   - Schedule: setiap 5 minit
   - **Advanced → Request method: POST**, **Headers:** `x-collector-secret: <rahsia>`
   - Timeout 30 s (collector ambil ±4–5 s kerana 3 wilayah dengan jeda 1.1 s).
2. Aktifkan notifikasi emel bila gagal berturut-turut.
3. Alternatif: `.github/workflows/collect.yml` (tambah secret `COLLECTOR_SECRET` dan `API_URL` di Settings → Secrets). GitHub Actions cron boleh lewat beberapa minit, jadi cron-job.org lebih sesuai.

### A6. Sahkan data masuk
Dalam Neon SQL Editor:
```sql
SELECT count(*), max(taken_at) FROM snapshots;            -- bertambah 12 sejam
SELECT ok, count(*) FROM collector_runs GROUP BY ok;       -- kebanyakan true
SELECT airline, count(*) FROM observations GROUP BY 1 ORDER BY 2 DESC LIMIT 10;
SELECT nearest_apt, count(*) FROM observations GROUP BY 1 ORDER BY 2 DESC;
```
Kalau banyak `airline` jadi `Lain-lain (XXX)`, tambah awalan itu dalam `server/src/lib/airlines.js`.

### Perkara yang perlu anda semak sendiri (saya tak dapat sahkan)
- **Had pengiraan percuma Neon.** Cron setiap 5 minit mungkin menghalang pangkalan data daripada tidur. Semak jam pengiraan percuma semasa di dashboard Neon selepas 2–3 hari. Kalau terlalu laju habis, guna Supabase atau tukar ke setiap 10 minit.
- **Saiz storan.** Anggaran proposal (±22,000 baris/hari) munasabah. Semak dengan `SELECT pg_size_pretty(pg_database_size(current_database()));` selepas seminggu.
- **Kualiti `nearest_apt`.** Ia sekadar "dalam 60 km dari lapangan terbang", bukan berlepas atau mendarat. Letakkan nota ini pada caption carta.

---

## B. Fasa 2 — API (sudah siap): cara baca kodnya

| Fail | Peranan |
|---|---|
| `src/collector/feeds.js` | Fetch berurutan dengan fallback, tukar unit, tapis di luar Malaysia, nyahduplikasi |
| `src/collector/collect.js` | Satu transaksi + bulk insert `unnest`, advisory lock, log `collector_runs` |
| `src/routes/stats.js` | Semua SQL agregat |
| `src/lib/validate.js` | Skema Zod (julat maksimum 90 hari) |
| `test/` | 32 ujian termasuk Postgres sebenar |

Keputusan reka bentuk yang patut anda faham untuk laporan:
1. **Purata merangkumi snapshot tanpa pesawat sebagai 0** (`LEFT JOIN`). Kalau tidak, jam sunyi nampak lebih sibuk daripada sebenar.
2. **Larian gagal tidak mencipta snapshot.** Jurang kekal sebagai jurang, bukan 0. Setiap titik carta membawa `snapshots` (jangka 12 sejam) supaya frontend boleh tandakan jam yang tidak lengkap.
3. **Pesawat di darat dibuang** (`alt_baro: "ground"`), supaya "airspace" bermaksud di udara.
4. Semua masa dikumpul dalam **Asia/Kuala_Lumpur** di SQL, bukan di pelayar.

---

## C. Fasa 3 — Dashboard React (Minggu 2)

```bash
cd malaysian-airspace-analytics
npm create vite@latest client -- --template react-ts
cd client && npm i recharts react-router-dom leaflet leaflet.heat && npm i -D @types/leaflet
echo "VITE_API_URL=http://localhost:3000" > .env.local
```

Struktur cadangan:
```
client/src/
  lib/api.ts          # fetch + jenis
  hooks/useApi.ts     # loading/error/data
  components/         # StatCard, TrendChart, DateRange
  pages/              # Overview, Airports, Airlines, DensityMap, Export
  App.tsx             # router + julat tarikh kongsi (context)
```

`lib/api.ts` dan `hooks/useApi.ts`:
```ts
const BASE = import.meta.env.VITE_API_URL;
export async function api<T>(path: string, params: Record<string, string | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
  const res = await fetch(`${BASE}/api/stats${path}?${qs}`);
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

// hooks/useApi.ts
import { useEffect, useState } from 'react';
export function useApi<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, set] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  useEffect(() => {
    let live = true;
    set((s) => ({ ...s, loading: true }));
    load().then((data) => live && set({ data, loading: false }))
          .catch((e) => live && set({ error: e.message, loading: false }));
    return () => { live = false; };
  }, deps); // eslint-disable-line
  return state;
}
```

Halaman Overview (kad ringkasan + trend vs biasa):
```tsx
const { data } = useApi(() => api<any>('/overview'), []);
// <StatCard label="Pesawat sekarang" value={data.latest.aircraft} />
<LineChart data={data.trend}>
  <XAxis dataKey="hourMyt" tickFormatter={(v) => v.slice(11, 16)} />
  <Line dataKey="avgAircraft" name="Hari ini" />
  <Line dataKey="usualAircraft" name="Paras biasa" strokeDasharray="4 4" dot={false} />
</LineChart>
```

Urutan pembinaan (satu PR setiap satu):
1. `Overview` (`/overview`) → ini **MVP** anda bersama carta jam.
2. `Airports` — pilih lapangan terbang → `BarChart` dari `/hourly?airport=KUL`; heatgrid dari `/airports/KUL/weekly` (jadual 7×24 dengan warna ikut nilai); banding dari `/airports/compare`.
3. `Airlines` — `AreaChart stackOffset="expand"` dari `/airlines/timeseries?bucket=day`; jadual dari `/airlines`.

Petua reka bentuk daripada proposal anda: satu warna tetap bagi setiap syarikat penerbangan (letak peta warna dalam satu fail), caption pendek di bawah setiap carta ("Purata pesawat yang diperhatikan feed ADS-B, masa Malaysia"), dan tunjuk jam dengan `snapshots < 6` sebagai pudar atau bertanda "data tidak lengkap".

Deploy: Vercel → import repo → **Root Directory `client`** → env `VITE_API_URL=https://<nama>.onrender.com`. Kemudian kemas kini `CORS_ORIGIN` di Render.

---

## D. Fasa 4 — Heatmap, `hourly_stats`, retensi (Minggu 3)

**Heatmap.** Tambah endpoint `GET /api/stats/density?from&to&hour` yang mengembalikan `lat, lng` yang dibundarkan kepada 2 tempat perpuluhan dengan `count(*)` (kurangkan saiz data), kemudian `L.heatLayer(points.map(p => [p.lat, p.lng, p.n]))` di Leaflet.

**Jadual ringkasan** — fail baru `server/sql/002_hourly_stats.sql` (migrasi jalan automatik):
```sql
CREATE TABLE IF NOT EXISTS hourly_stats (
  hour        TIMESTAMPTZ NOT NULL,
  airport     TEXT NOT NULL DEFAULT '',     -- '' = tiada lapangan terbang berhampiran
  airline     TEXT NOT NULL DEFAULT '',
  avg_aircraft REAL NOT NULL,
  peak_aircraft INT NOT NULL,
  snapshots   INT NOT NULL,                 -- bilangan snapshot dalam jam itu
  PRIMARY KEY (hour, airport, airline)
);
```
Isi dengan `INSERT ... ON CONFLICT DO UPDATE` bagi jam yang sudah lengkap. Pengiraan purata per (jam, lapangan, syarikat) perlu `LEFT JOIN` ke `snapshots` seperti dalam `stats.js`, supaya angka sama dengan hasil query mentah. **Ujian: bandingkan keputusan jadual ringkasan dengan query mentah untuk 1 hari** (ini juga yang proposal anda minta sebagai "spot-check").

**Retensi 30 hari.** Tambah `POST /api/maintenance` (rahsia yang sama) yang:
1. meringkaskan jam yang belum diringkaskan,
2. **hanya selepas itu** `DELETE FROM observations WHERE taken_at < now() - interval '30 days' AND taken_at < (SELECT max(hour) FROM hourly_stats)`,
3. memadam `snapshots` lama yang tiada observation.

Panggil sekali sehari melalui cron-job.org kedua. Selepas itu, tukar endpoint `hourly`/`airlines` untuk julat > 30 hari supaya baca `hourly_stats`.

---

## E. Fasa 5 — Export, ujian, deploy, dokumentasi (Minggu 4)

- **CSV:** `GET /api/export.csv?from&to&type=hourly|airlines` → hasil query sedia ada ke `json2csv`, dengan `Content-Disposition: attachment`.
- **PDF:** PDFKit di server (tajuk, julat tarikh, jadual 10 teratas, nota "diperhatikan oleh feed ADS-B"). Tambah imej carta hanya jika ada masa.
- **Ujian:** tambah Vitest di `client/` untuk komponen (cth. peta warna, format label). Ujian API sudah ada.
- **CI:** `.github/workflows/ci.yml` sudah ada untuk `server/`, tambah job `client` (`npm ci && npm run build && npm test`).
- **Dokumentasi/kajian kes:** README dengan tangkapan skrin, rajah seni bina (Cron → Render → Neon → Vercel), dan tiga perkara: *kenapa penjadual luaran*, *kenapa purata mengira snapshot kosong sebagai 0*, *apa yang berubah selepas data sebenar*.
- **Kriteria kejayaan proposal:** rekod masa menjawab "bila KUL paling sibuk hari bekerja?" (< 1 minit), kadar kejayaan collector (`/api/stats/collector`), dan masa query pada data penuh (`EXPLAIN ANALYZE`).

---

## F. Jadual mingguan ringkas

| Bila | Sasaran | Tanda siap |
|---|---|---|
| Hari 1 | Bahagian A | `collector_runs` ada baris `ok=true` setiap 5 minit |
| Hari 2–7 | Biar data terkumpul; bina Overview | Kad ringkasan + trend 24 jam |
| Minggu 2 | Airports + Airlines | Carta jam & stacked area dengan data sebenar |
| Minggu 3 | Heatmap, `hourly_stats`, retensi | Spot-check ringkasan = query mentah |
| Minggu 4 | Export, CI penuh, deploy, README | URL awam + CI hijau |
