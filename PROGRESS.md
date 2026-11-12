# Progress Projek

Dikemas kini: **12 November 2026**
Rujukan pantas untuk menyambung kerja pada bila-bila masa.

## Ringkasan

Collector, API dan dashboard (Ringkasan, Lapangan terbang, Syarikat, Peta kepadatan) sudah **hidup di internet**. Data dikumpul setiap 5 minit sejak 10 November 2026. **Fasa 4 selesai**: `hourly_stats`, `/api/maintenance` (disahkan di Render) dan `/hourly` yang membaca ringkasan. **Fasa 5 bermula**: ujian dashboard (Vitest) dan job `client` dalam CI sudah siap secara tempatan, belum di-push. Kerja yang tinggal ialah eksport CSV/PDF, ujian dashboard tambahan dan dokumentasi akhir.

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
| 4 | Retensi 30 hari (`/api/maintenance`) | Siap, hidup. Disahkan di Render: 200, 486 baris diringkaskan, 0 dipadam. Cron job harian dicipta |
| 4 | `/hourly` membaca `hourly_stats` | Siap, hidup (commit `32e23e8`) |
| 5 | Ujian dashboard (Vitest) + job `client` dalam CI | Siap tempatan (5 ujian lulus, build lulus). Belum di-commit dan di-push |
| 5 | Eksport CSV/PDF | Belum |
| 5 | Ujian dashboard tambahan, tangkapan skrin, dokumentasi akhir | Belum |

## Infrastruktur (tanpa rahsia)

| Komponen | Perkhidmatan | Butiran |
|---|---|---|
| Kod | GitHub | `armehh/malaysian-airspace-analytics`, cabang `main` |
| Pangkalan data | Neon | Postgres, Singapore. Guna sambungan **langsung** (bukan `-pooler`) |
| API | Render Web Service (Free) | Root `server`, build `npm install`, start `npm start`, Singapore |
| Dashboard | Render Static Site | Root `client`, build `npm install && npm run build`, publish `dist`, env `VITE_API_URL` |
| Penjadual | cron-job.org | Job 1: `POST /api/collect` setiap 5 minit. Job 2: `POST /api/maintenance` sekali sehari 04:00 (timeout 60s). Header `x-collector-secret`, zon Asia/Kuala_Lumpur |

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
- **`/hourly` hibrid**: jam penuh yang sudah diringkaskan dibaca daripada `hourly_stats`. `observations` hanya diimbas di dua hujung julat yang belum diringkaskan (jam separa di permulaan, dan jam terkini selepas ringkasan terakhir). Cron harian membuat ringkasan ketinggalan sehingga sehari, jadi bacaan hibrid perlu. Penapis `NOT EXISTS` sahaja tidak mempercepat query kerana Postgres tetap mengimbas semua `observations` dalam julat, maka imbasan dihadkan kepada dua julat itu.

## Keputusan pengukuran

- **Spot-check ringkasan (kriteria kejayaan #4): lulus.** Tempoh 10 Nov 07:00 hingga 11 Nov 07:00 UTC: 24 jam, 267 snapshot, 13,259 jumlah pesawat. Query padanan terhadap data mentah memberi 0 baris untuk semua pesawat (`*`) dan untuk KUL.
- **Kadar pengumpulan (kriteria kejayaan #2)**: 267 daripada 288 snapshot dijangka dalam satu tempoh 24 jam (92.7%). Merentas 10 Nov 15:00 hingga 12 Nov 07:00 MYT (41 jam, daripada output `/hourly`): 450 daripada 486 dijangka, kira-kira 92.6%. Jam 13:00 hingga 19:00 pada 11 Nov hanya 8 hingga 10 snapshot setiap jam, sepadan dengan waktu banyak `git push`. Punca jurang biasanya Render bangun daripada tidur atau redeploy semasa `git push`. Semak semula dengan `GET /api/stats/collector`.
- **Purata**: kira-kira 50 pesawat setiap snapshot sepanjang 24 jam, lebih rendah daripada 70 hingga 84 pada waktu siang kerana trafik malam sedikit.
- `/api/maintenance`: HTTP 200 di tempatan (`summarizedRows` 257) dan di Render (`summarizedRows` 486, `deletedObservations` 0, cutoff 13 Okt). Tiada apa dipadam kerana data baru dua hari.
- **Anggaran storan**: spot-check 24 jam ialah 13,259 baris `observations`, jadi kira-kira 13,300 sehari dan kira-kira 0.4 juta baris selepas 30 hari. Sahkan dengan `pg_size_pretty` selepas seminggu.
- **EXPLAIN ANALYZE `/hourly`** (`explain-hourly.sql`). Data sintetik 30 hari di komputer tempatan (kira-kira 408,000 baris `observations`, KUL): 7 hari 17 ms ke 3 ms, 30 hari 55 ms ke 5 ms, hasil sama pada 32 kombinasi julat dan lapangan terbang. **Nombor sebenar daripada Neon (Execution Time dalam tab Plan) belum direkodkan di sini.** Pada data beberapa hari kedua-dua query di bawah 5 ms, jadi jangan tulis dakwaan kelajuan dalam laporan. Ukur semula apabila data mencapai 30 hari (sekitar 10 Disember). Faedah sebenar: selepas hari ke-30 hanya query baharu mempunyai sejarah jam demi jam.

## Isu diketahui dan hutang teknikal

- Ayat "Paling sibuk: hari, jam" pada halaman Lapangan terbang dikira walaupun data hanya beberapa jam. Tambah syarat minimum data.
- Garis "Paras biasa" belum muncul sehingga data melebihi sehari (jangkaan).
- `api.test.js` kini ada ujian untuk `/hourly`, `/density` dan `/maintenance` (termasuk retensi dengan data lama), tetapi ia memerlukan Postgres. Semak tab **Actions** di GitHub sama ada job server hijau untuk `32e23e8`, dan sama ada ujian ini pernah dijalankan dengan `TEST_DATABASE_URL` di komputer tempatan.
- Bundle JS utama 628 kB (amaran Vite). Peta (Leaflet) sudah dipecahkan ke chunk berasingan.
- **Selepas 30 hari**, `/hourly` masih memberi sejarah lama (daripada `hourly_stats`), tetapi `/airports/compare`, `/airports/:code/weekly`, `/airlines`, `/airlines/timeseries` dan `/density` membaca `observations` dan hanya merangkumi 30 hari terakhir. Corak mingguan dan syarikat tidak diringkaskan.
- Pemantauan Neon: semak jam pengiraan percuma, dan saiz pangkalan data selepas seminggu:
  ```sql
  SELECT pg_size_pretty(pg_database_size(current_database()));
  ```
- Pastikan `server/.env` tempatan sentiasa guna kata laluan Neon terkini.

## Tugasan keselamatan

1. ~~Tukar kata laluan Neon~~ **Siap.** `DATABASE_URL` di Render sudah dikemas kini, collector disahkan masih berjalan (semua larian `ok = true`).
2. ~~Tukar `CORS_ORIGIN`~~ **Siap.** Kini `https://airspace-dashboard.onrender.com`, disahkan dengan header `access-control-allow-origin`.
3. Jangan commit `.env` atau `.env.local`. Kedua-duanya sudah dikecualikan oleh `.gitignore`.
4. Jangan tampal `COLLECTOR_SECRET` dalam sembang atau dokumen, dan jangan biarkan ia kelihatan dalam output terminal yang dikongsi (`Read-Host` memaparkan apa yang ditaip). `COLLECTOR_SECRET` telah ditukar kerana terdedah (lihat log 12 Nov). Nilai baharu mesti sama di Render, **kedua-dua** job cron-job.org dan `server/.env`.

## Seterusnya (urutan cadangan)

1. Commit dan push Fasa 5: `.github/workflows/ci.yml`, `PROGRESS.md`, `README.md`, `client/package.json`, `client/package-lock.json`, `client/src/lib/airlineColors.test.ts` (nama fail eksplisit, bukan `git add .`). Semak tab **Actions**: job `server` dan `client` mesti hijau.
2. Sahkan cron job harian: selepas 04:00 esok, `SELECT max(hour) FROM hourly_stats WHERE airport = '*';` patut dalam sejam terakhir, dan `deletedObservations` kekal 0 sehingga data melebihi 30 hari.
3. Rekod Execution Time sebenar daripada Neon (tab Plan) untuk `explain-hourly.sql` dalam bahagian pengukuran di atas.
4. Eksport CSV (`/api/export.csv?type=hourly|airlines&from&to`), kemudian PDF.
5. Tambah syarat minimum data pada ayat "paling sibuk" (halaman Lapangan terbang).
6. Tambah ujian dashboard lain (cth. pemetaan warna peta), tangkapan skrin dan kajian kes dalam README.
7. Ukur semula EXPLAIN apabila data mencapai 30 hari, dan ukur kriteria kejayaan lain (lihat PROPOSAL.md). Semak anggaran storan dalam PROPOSAL.md, yang mungkin terlalu tinggi berbanding 13,300 baris sehari.

## Cara sambung semula

```powershell
# Dashboard
cd C:\Users\ASUS\Downloads\malaysian-airspace-analytics\client
npm run dev                 # http://localhost:5173

# Ujian dashboard
npm test                    # Vitest, dalam folder client

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
- **12 Nov 2026**: `/api/maintenance` disahkan di Render (200, 486 baris diringkaskan, 0 dipadam, cutoff 13 Okt). `/hourly` kini membaca `hourly_stats` (hujung julat yang belum diringkaskan masih dibaca daripada `observations`), commit `32e23e8`, dengan ujian baharu untuk `/hourly`, `/density` dan `/maintenance`. Fasa 4 ditutup. `COLLECTOR_SECRET` ditukar kerana terdedah dalam output terminal, dan cron job harian untuk `/api/maintenance` dicipta.
- **12 Nov 2026**: Fasa 5 bermula. Vitest dipasang dalam `client` (5 ujian `airlineColors` lulus, build lulus) dan job `client` ditambah dalam `ci.yml` (`npm ci`, `npm test`, `npm run build`). Belum di-push.
