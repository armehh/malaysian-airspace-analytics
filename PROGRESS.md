# Progress Projek

Dikemas kini: **10 November 2026**
Rujukan pantas untuk menyambung kerja pada bila-bila masa.

## Ringkasan

Collector, API dan dashboard asas sudah **hidup di internet**. Data sedang dikumpul setiap 5 minit sejak 10 November 2026. Kerja yang tinggal ialah halaman Syarikat, peta heatmap, penyimpanan ringkasan/retensi, eksport dan dokumentasi.

## Status mengikut fasa

| Fasa | Kandungan | Status |
|---|---|---|
| 1 | Skema SQL, collector | Siap, hidup |
| 2 | REST API, ujian | Siap, hidup |
| 3 | Dashboard: Ringkasan | Siap, hidup |
| 3 | Dashboard: Lapangan terbang | Siap, hidup |
| 3 | Dashboard: Syarikat | **Belum** |
| 4 | Peta heatmap (`/density`) | Belum |
| 4 | Jadual `hourly_stats` + spot-check | Belum |
| 4 | Retensi 30 hari (`/api/maintenance`) | Belum |
| 5 | Eksport CSV/PDF | Belum |
| 5 | Ujian dashboard, CI client, dokumentasi akhir | Belum |

## Infrastruktur (tanpa rahsia)

| Komponen | Perkhidmatan | Butiran |
|---|---|---|
| Kod | GitHub | `armehh/malaysian-airspace-analytics`, cabang `main` |
| Pangkalan data | Neon | Postgres, Singapore. Guna sambungan **langsung** (bukan `-pooler`) |
| API | Render Web Service (Free) | Root `server`, build `npm install`, start `npm start`, Singapore |
| Dashboard | Render Static Site | Root `client`, build `npm install && npm run build`, publish `dist`, env `VITE_API_URL` |
| Penjadual | cron-job.org | `POST /api/collect` setiap 5 minit, header `x-collector-secret`, zon Asia/Kuala_Lumpur, timeout 30s |

URL: dashboard `https://airspace-dashboard.onrender.com`, API `https://malaysian-airspace-analytics.onrender.com`.

Setiap `git push` ke `main` mencetus deploy semula perkhidmatan berkaitan (API hanya bila folder `server` berubah, dashboard bila `client` berubah).

## Keputusan penting dan sebabnya

- **Penjadual luaran (cron-job.org)**: pelan percuma Render tidur. Panggilan setiap 5 minit menjaga ia terjaga.
- **Sambungan Neon langsung**: collector guna `pg_advisory_lock` yang bermasalah pada sambungan pooled.
- **Routing berasaskan `#`** (`#/airports`): tiada pakej tambahan dan tiada konfigurasi rewrite di hos statik.
- **Dashboard di Render, bukan Vercel**: satu akaun untuk semua, Static Site percuma dan tidak tidur.
- **Tema dashboard**: navy gelap, biru langit untuk data hari ini, kuning untuk paras biasa.

## Isu diketahui dan hutang teknikal

- Ayat "Paling sibuk: hari, jam" pada halaman Lapangan terbang dikira walaupun data hanya beberapa jam. Tambah syarat minimum data.
- Garis "Paras biasa" belum muncul sehingga data melebihi sehari (jangkaan).
- Bundle JS 621 kB (amaran Vite). Boleh dipecah dengan `import()` kemudian.
- `api.test.js` (ujian dengan Postgres sebenar) **belum disahkan** dijalankan di komputer tempatan. Ujian unit (16) lulus.
- Semak tab **Actions** di GitHub sama ada CI server lulus.
- Pemantauan Neon: semak jam pengiraan percuma selepas 2 hingga 3 hari, dan saiz pangkalan data selepas seminggu:
  ```sql
  SELECT pg_size_pretty(pg_database_size(current_database()));
  ```

## Tugasan keselamatan (belum selesai)

1. **Tukar kata laluan Neon**. Kata laluan lama pernah tertera dalam sembang. Reset di Neon (Branches, production, Roles & Databases), kemudian kemas kini `DATABASE_URL` di Render (API) dan `server/.env`.
2. **Tukar `CORS_ORIGIN`** di Render (API) daripada `*` kepada `https://airspace-dashboard.onrender.com`.
3. Jangan commit `.env` atau `.env.local`. Kedua-duanya sudah dikecualikan oleh `.gitignore`.

## Seterusnya (urutan cadangan)

1. Selesaikan tugasan keselamatan di atas.
2. Halaman **Syarikat**: ranking (`/airlines`) dan carta kawasan bertindih (`/airlines/timeseries`), satu warna tetap bagi setiap syarikat dalam satu fail.
3. Tambah syarat minimum data pada ayat "paling sibuk".
4. Fasa 4: endpoint `/density` + peta Leaflet heatmap.
5. Fasa 4: migrasi `002_hourly_stats.sql`, isi jadual, dan **spot-check** terhadap query mentah untuk satu hari.
6. Fasa 4: `/api/maintenance` untuk ringkasan dan padam `observations` lebih 30 hari (hanya selepas diringkaskan), dipanggil harian oleh cron-job kedua.
7. Fasa 5: eksport CSV/PDF, ujian dashboard (Vitest), job `client` dalam CI, tangkapan skrin dalam README.
8. Ukur kriteria kejayaan (lihat PROPOSAL.md).

## Cara sambung semula

```powershell
# Dashboard
cd C:\Users\ASUS\Downloads\malaysian-airspace-analytics\client
npm run dev                 # http://localhost:5173

# Server tempatan
cd ..\server
npm run dev                 # http://localhost:3000

# Semak data terkini (cloud)
curl.exe https://malaysian-airspace-analytics.onrender.com/api/stats/overview
```

Semak kesihatan collector dalam Neon SQL Editor:
```sql
SELECT count(*), max(taken_at) FROM snapshots;
SELECT ok, count(*) FROM collector_runs GROUP BY ok;
```

## Log perubahan

- **10 Nov 2026**: collector diuji (84 pesawat, adsb.lol), skema dimigrasi ke Neon, API di-deploy ke Render, cron-job.org dikonfigurasi, repo dimasukkan ke GitHub. Dashboard Ringkasan dan Lapangan terbang dibina dan di-deploy sebagai Static Site. Folder `src` berganda di akar repo dibuang.
