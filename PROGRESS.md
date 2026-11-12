# Progress Projek

Dikemas kini: **11 November 2026**
Rujukan pantas untuk menyambung kerja pada bila-bila masa.

## Ringkasan

Collector, API dan dashboard (Ringkasan, Lapangan terbang, Syarikat, Peta kepadatan) sudah **hidup di internet**. Data dikumpul setiap 5 minit sejak 10 November 2026. Fasa 4 hampir siap: jadual `hourly_stats` dan `/api/maintenance` sudah ditulis dan lulus spot-check; tinggal deploy ke Render dan cron job harian. Kerja yang tinggal selepas itu ialah eksport, ujian dashboard dan dokumentasi akhir.

## Status mengikut fasa

| Fasa | Kandungan | Status |
|---|---|---|
| 1 | Skema SQL, collector | Siap, hidup |
| 2 | REST API, ujian | Siap, hidup |
| 3 | Dashboard: Ringkasan | Siap, hidup |
| 3 | Dashboard: Lapangan terbang | Siap, hidup |
| 3 | Dashboard: Syarikat | Siap, hidup |
| 4 | Peta kepadatan (`/density`) | Siap, hidup |
| 4 | Jadual `hourly_stats` + spot-check | Siap, spot-check lulus |
| 4 | Retensi 30 hari (`/api/maintenance`) | Kod siap, diuji tempatan. Belum deploy ke Render dan belum ada cron job harian |
| 5 | Eksport CSV/PDF | Belum |
| 5 | Ujian dashboard, CI client, dokumentasi akhir | Belum |

## Infrastruktur (tanpa rahsia)

| Komponen | Perkhidmatan | Butiran |
|---|---|---|
| Kod | GitHub | `armehh/malaysian-airspace-analytics`, cabang `main` |
| Pangkalan data | Neon | Postgres, Singapore. Guna sambungan **langsung** (bukan `-pooler`) |
| API | Render Web Service (Free) | Root `server`, build `npm install`, start `npm start`, Singapore |
| Dashboard | Render Static Site | Root `client`, build `npm install && npm run build`, publish `dist`, env `VITE_API_URL` |
| Penjadual | cron-job.org | Job 1: `POST /api/collect` setiap 5 minit. Job 2 (akan dicipta): `POST /api/maintenance` sekali sehari 04:00. Header `x-collector-secret`, zon Asia/Kuala_Lumpur |

URL: dashboard `https://airspace-dashboard.onrender.com`, API `https://malaysian-airspace-analytics.onrender.com`.

Setiap `git push` ke `main` mencetus deploy semula perkhidmatan berkaitan (API hanya bila folder `server` berubah, dashboard bila `client` berubah).

## Keputusan penting dan sebabnya

- **Penjadual luaran (cron-job.org)**: pelan percuma Render tidur. Panggilan setiap 5 minit menjaga ia terjaga.
- **Sambungan Neon langsung**: collector guna `pg_advisory_lock` yang bermasalah pada sambungan pooled.
- **Routing berasaskan `#`** (`#/airports`): tiada pakej tambahan dan tiada konfigurasi rewrite di hos statik.
- **Dashboard di Render, bukan Vercel**: satu akaun untuk semua, Static Site percuma dan tidak tidur.
- **Tema dashboard**: navy gelap, biru langit untuk data hari ini, kuning untuk paras biasa.
- **`hourly_stats` menyimpan jumlah, bukan purata**: `snapshots`, `aircraft_sum` dan `peak_aircraft` bagi setiap (jam, lapangan terbang). Purata = jumlah ÷ snapshot, sama seperti `/hourly`, jadi snapshot tanpa pesawat dikira 0. Baris `airport = '*'` bermaksud semua pesawat.
- **Ringkas dahulu, baru padam**: `/api/maintenance` meringkaskan 48 jam terakhir (idempotent, selamat dijalankan berulang kali), meringkaskan jam yang akan dipadam, kemudian memadam `observations` lebih 30 hari. Jadual `snapshots` tidak dipadam (kecil, 288 baris sehari, diperlukan carta jurang data).
- **Hanya jam penuh diringkaskan**, supaya jam yang sedang berjalan tidak disimpan separuh jalan.

## Keputusan pengukuran

- **Spot-check ringkasan (kriteria kejayaan #4): lulus.** Tempoh 10 Nov 07:00 hingga 11 Nov 07:00 UTC: 24 jam, 267 snapshot, 13,259 jumlah pesawat. Query padanan terhadap data mentah memberi 0 baris untuk semua pesawat (`*`) dan untuk KUL.
- **Kadar pengumpulan (kriteria kejayaan #2)**: 267 daripada 288 snapshot dijangka dalam 24 jam, kira-kira 92.7%. Punca jurang biasanya Render bangun daripada tidur atau redeploy semasa `git push`. Semak semula dengan `GET /api/stats/collector`.
- **Purata**: kira-kira 50 pesawat setiap snapshot sepanjang 24 jam, lebih rendah daripada 70 hingga 84 pada waktu siang kerana trafik malam sedikit.
- `/api/maintenance` diuji tempatan: HTTP 200, `summarizedRows` 257, `deletedObservations` 0 (data baru sehari, tiada yang lebih 30 hari).

## Isu diketahui dan hutang teknikal

- Ayat "Paling sibuk: hari, jam" pada halaman Lapangan terbang dikira walaupun data hanya beberapa jam. Tambah syarat minimum data.
- Garis "Paras biasa" belum muncul sehingga data melebihi sehari (jangkaan).
- Bundle JS 621 kB (amaran Vite). Boleh dipecah dengan `import()` kemudian.
- `api.test.js` (ujian dengan Postgres sebenar) **belum disahkan** dijalankan di komputer tempatan, dan belum ada ujian untuk `/density` dan `/maintenance` (termasuk retensi dengan data lama). Ujian unit (16) lulus.
- Semak tab **Actions** di GitHub sama ada CI server lulus.
- **Selepas 30 hari**, `/hourly`, `/airports/compare` dan endpoint lain yang membaca `observations` akan kosong bagi tarikh lama. Penyelesaian: tukar `/hourly` dan carta jam kepada `hourly_stats`.
- Pemantauan Neon: semak jam pengiraan percuma, dan saiz pangkalan data selepas seminggu:
  ```sql
  SELECT pg_size_pretty(pg_database_size(current_database()));
  ```
- Pastikan `server/.env` tempatan sentiasa guna kata laluan Neon terkini.

## Tugasan keselamatan

1. ~~Tukar kata laluan Neon~~ **Siap.** `DATABASE_URL` di Render sudah dikemas kini, collector disahkan masih berjalan (semua larian `ok = true`).
2. ~~Tukar `CORS_ORIGIN`~~ **Siap.** Kini `https://airspace-dashboard.onrender.com`, disahkan dengan header `access-control-allow-origin`.
3. Jangan commit `.env` atau `.env.local`. Kedua-duanya sudah dikecualikan oleh `.gitignore`.
4. Jangan tampal `COLLECTOR_SECRET` dalam sembang atau dokumen. Rahsia Render dan rahsia `server/.env` boleh berbeza.

## Seterusnya (urutan cadangan)

1. Tutup Fasa 4:
   - `git add server`, `git commit -m "feat: hourly_stats dan retensi 30 hari (Fasa 4)"`, `git push`.
   - Uji `POST /api/maintenance` di Render (jangkaan 200 dengan JSON).
   - Cipta cron job kedua di cron-job.org: POST `/api/maintenance`, sekali sehari 04:00 (Asia/Kuala_Lumpur), timeout 60s.
2. Tukar `/hourly` dan carta jam kepada `hourly_stats`. Ini juga memberi bukti "sebelum dan selepas" untuk `EXPLAIN ANALYZE`.
3. Tulis ujian untuk `/density` dan `/maintenance` dalam `api.test.js`.
4. Tambah syarat minimum data pada ayat "paling sibuk".
5. Fasa 5: eksport CSV/PDF, ujian dashboard (Vitest), job `client` dalam CI, tangkapan skrin dalam README.
6. Ukur kriteria kejayaan lain (lihat PROPOSAL.md).

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

Semak ringkasan jam (pastikan jadual `hourly_stats` terisi):
```sql
SELECT count(*) AS jam, sum(snapshots) AS snapshot, sum(aircraft_sum) AS jumlah
FROM hourly_stats WHERE airport = '*';
```

Jalankan penyelenggaraan secara manual (tempatan):
```powershell
$s = (Get-Content server\.env | Select-String '^COLLECTOR_SECRET=').Line.Split('=',2)[1]
curl.exe -s -X POST -H "x-collector-secret: $s" http://localhost:3000/api/maintenance
```

## Log perubahan

- **10 Nov 2026**: collector diuji (84 pesawat, adsb.lol), skema dimigrasi ke Neon, API di-deploy ke Render, cron-job.org dikonfigurasi, repo dimasukkan ke GitHub. Dashboard Ringkasan dan Lapangan terbang dibina dan di-deploy sebagai Static Site. Folder `src` berganda di akar repo dibuang.
- **11 Nov 2026**: halaman Syarikat dan peta kepadatan (petak grid 0.1 darjah, Leaflet, tile OpenStreetMap) siap dan di-deploy. leaflet.heat gagal dimuat sebagai modul ES, jadi digantikan dengan petak segi empat Leaflet. Kata laluan Neon ditukar dan `CORS_ORIGIN` dihadkan kepada URL dashboard. Migrasi `002_hourly_stats.sql` dan `server/src/maintenance.js` ditambah, endpoint `POST /api/maintenance` dibina dan diuji tempatan, spot-check ringkasan lulus (267 snapshot, padanan tepat).
