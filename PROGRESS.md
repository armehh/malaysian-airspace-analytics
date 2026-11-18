# Progress Projek

Dikemas kini: **16 November 2026**
Rujukan pantas untuk menyambung kerja pada bila-bila masa.

## Ringkasan

Collector, API dan dashboard (Ringkasan, Lapangan terbang, Syarikat, Peta kepadatan) sudah **hidup di internet**. Data dikumpul setiap 5 minit sejak 10 November 2026. **Fasa 4 selesai** (`hourly_stats`, `/api/maintenance`, `/hourly` hibrid). **Fasa 5 hampir siap**: ujian dashboard dan job `client` dalam CI, eksport CSV dan Excel bertema (`export.csv`, `export.xlsx`) beserta butang muat turun pada dashboard sudah hidup. Eksport Excel dan butangnya disahkan berfungsi di Render. Kerja yang tinggal: **betulkan CI** (commit `d98842c` bertanda X merah), PDF (pilihan), tangkapan skrin dan dokumentasi akhir.

## Status mengikut fasa

| Fasa | Kandungan | Status |
|---|---|---|
| 1 | Skema SQL, collector | Siap, hidup |
| 2 | REST API, ujian | Siap, hidup |
| 3 | Dashboard: Ringkasan, Lapangan terbang, Syarikat | Siap, hidup |
| 4 | Peta kepadatan (`/density`) | Siap, hidup |
| 4 | Jadual `hourly_stats` + spot-check | Siap, spot-check lulus |
| 4 | Retensi 30 hari (`/api/maintenance`) | Siap, hidup. Disahkan di Render: 200, 486 baris diringkaskan, 0 dipadam. Cron job harian dicipta |
| 4 | `/hourly` membaca `hourly_stats` | Siap, hidup (commit `32e23e8`) |
| 5 | Ujian dashboard (Vitest) + job `client` dalam CI | Siap, di-push (`ea33fdd`) |
| 5 | Eksport CSV (`/api/stats/export.csv`) | Siap, hidup, disahkan di Render (`1cc255c`) |
| 5 | Butang "Muat turun CSV" (Lapangan terbang, Syarikat) | Siap, hidup (`f7f9dd7`) |
| 5 | Eksport Excel bertema (`/api/stats/export.xlsx`) | Siap, hidup, disahkan di Render (`ee41b31`). Muat turun dua kali berturut-turut berfungsi |
| 5 | Butang "Muat turun Excel" pada dashboard | Siap, hidup (`d98842c`), di sebelah butang CSV pada halaman Lapangan terbang dan Syarikat |
| 5 | Eksport PDF | Belum |
| 5 | Tangkapan skrin dan dokumentasi akhir | Belum |

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
- **Eksport CSV**: format RFC 4180 (koma, hujung baris CRLF). Nilai bermula `=`, `+`, `-`, `@`, tab atau CR diawali `'` untuk mengelak formula injection. `type` tidak sah memberi 400. Query `/hourly` dan `/airlines` dikongsi dengan eksport (`hourlyData`, `airlinesData`), jadi respons JSON tidak berubah. CSV hanya teks, jadi tidak boleh membawa warna atau format.
- **Eksport Excel (.xlsx) untuk rupa profesional**: dijana dengan `exceljs` di server (`server/src/lib/xlsx.js`), dengan tema navy dan biru langit yang sama seperti dashboard. `type=hourly` menghasilkan dua helaian: **Ringkasan** (empat kad KPI: purata pesawat, puncak, jam tersibuk, liputan data, dan profil 24 jam dengan bar data) dan **Data** (header dibekukan, penapis automatik, bar data pada purata, penyorotan oren bila liputan di bawah 75%). `type=airlines` menghasilkan satu helaian **Ranking**. Sel berangka ialah nombor sebenar, tarikh ialah tarikh sebenar (waktu Malaysia), dan nama syarikat yang bermula `=` kekal sebagai teks. Susun atur cetak A4 ditetapkan. Parameter dan had sama seperti `export.csv`. CSV dikekalkan untuk pengguna yang mahu data mentah.

## Keputusan pengukuran

- **Spot-check ringkasan (kriteria kejayaan #4): lulus.** Tempoh 10 Nov 07:00 hingga 11 Nov 07:00 UTC: 24 jam, 267 snapshot, 13,259 jumlah pesawat. Query padanan terhadap data mentah memberi 0 baris untuk semua pesawat (`*`) dan untuk KUL.
- **Kadar pengumpulan (kriteria kejayaan #2)**: 267 daripada 288 snapshot dijangka dalam satu tempoh 24 jam (92.7%). Merentas 10 Nov 15:00 hingga 12 Nov 07:00 MYT (41 jam, daripada output `/hourly`): 450 daripada 486 dijangka, kira-kira 92.6%. Punca jurang biasanya Render bangun daripada tidur atau redeploy semasa `git push`. Ukur semula dengan julat lebih panjang melalui `GET /api/stats/collector`.
- **Purata**: kira-kira 50 pesawat setiap snapshot sepanjang 24 jam, lebih rendah daripada 70 hingga 90 pada waktu siang kerana trafik malam sedikit.
- `/api/maintenance`: HTTP 200 di tempatan (`summarizedRows` 257) dan di Render (`summarizedRows` 486, `deletedObservations` 0, cutoff 13 Okt). Tiada apa dipadam kerana data baru dua hari.
- **Anggaran storan**: spot-check 24 jam ialah 13,259 baris `observations`, jadi kira-kira 13,300 sehari dan kira-kira 0.4 juta baris selepas 30 hari. Anggaran lama dalam PROPOSAL.md (22,000 sehari) terlalu tinggi dan perlu dibetulkan. Sahkan dengan `pg_size_pretty` selepas seminggu.
- **EXPLAIN ANALYZE `/hourly`** (`explain-hourly.sql`):
  - Data sekitar 3 hari di Neon: query lama **4.11 ms** (Execution Time dalam tab Plan, larian pertama). Nombor query baharu **belum direkodkan**.
  - Data sintetik 30 hari di komputer tempatan (kira-kira 408,000 baris `observations`, KUL): 7 hari 17 ms ke 3 ms, 30 hari 55 ms ke 5 ms, hasil sama pada 32 kombinasi julat dan lapangan terbang.
  - Dalam laporan, tulis bahawa pada data beberapa hari kedua-dua query di bawah 5 ms, dan ukuran diulang apabila data mencapai 30 hari (sekitar 10 Disember). Jangan tulis "3× lebih laju". Faedah sebenar: selepas hari ke-30 hanya query baharu mempunyai sejarah jam demi jam.
- **Ujian**: server 25 lulus dan 37 dilangkau (di komputer tanpa Postgres). Yang dilangkau (25 dalam `api.test.js`, 6 dalam `export.test.js`, 6 dalam `export-xlsx.test.js`) memerlukan `TEST_DATABASE_URL` dan dijalankan oleh CI. Client 11 lulus (5 `airlineColors`, selebihnya `csvUrl`).

## Isu diketahui dan hutang teknikal

- **CI tidak hijau.** Commit `d98842c` bertanda X merah di GitHub (dilihat 16 Nov). Buka tab **Actions**, kenal pasti job yang gagal dan baris ralat pertama. Kemungkinan `server`, kerana ujian Postgres (termasuk 6 ujian laluan `export.xlsx`) dijalankan di situ buat kali pertama. Kemungkinan lain ialah `npm ci` pada job `client` jika `client/package-lock.json` tidak selari dengan `package.json`. Dashboard tetap hidup kerana Render membina berasingan daripada CI.
- ~~Eksport Excel belum diuji di Render.~~ **Selesai (16 Nov).** `export.xlsx` dimuat turun dua kali berturut-turut dan dibuka dengan betul, jadi middleware cache tidak merosakkan respons binari. Fail yang dibuka: Lapangan terbang (helaian "Ringkasan" dan "Data") dan Syarikat (helaian "Ranking").
- Garis "Paras biasa" belum muncul sehingga data melebihi sehari (jangkaan).
- Bundle JS utama 628 kB (amaran Vite). Peta (Leaflet) sudah dipecahkan ke chunk berasingan.
- **Selepas 30 hari**, `/hourly` masih memberi sejarah lama (daripada `hourly_stats`), tetapi `/airports/compare`, `/airports/:code/weekly`, `/airlines`, `/airlines/timeseries` dan `/density` membaca `observations` dan hanya merangkumi 30 hari terakhir. Corak mingguan dan syarikat tidak diringkaskan.
- IndiGo muncul dalam ranking tetapi tiada warna tetap dalam `airlineColors.ts` (guna warna sandaran). "Tidak dikenal pasti" berada di tempat ke-4, jadi semak sama ada awalan callsign yang kerap muncul belum ada dalam `airlines.js`.
- Jadual cron `airspace-maintenance`: semak "Next execution" ialah 04:00 pagi (zon Asia/Kuala_Lumpur), bukan 16:00. Sahkan larian terakhir kedua-dua job cron ialah 200 dan `COLLECTOR_SECRET` sama pada kedua-duanya. Pemerhatian 16 Nov: `max(hour)` dalam `hourly_stats` ialah 2026-11-15 19:00 UTC (03:00 MYT), konsisten dengan cron 04:00 yang berjalan, tetapi HISTORY di cron-job.org belum disemak.
- Pemantauan Neon: semak jam pengiraan percuma, dan saiz pangkalan data selepas seminggu:
  ```sql
  SELECT pg_size_pretty(pg_database_size(current_database()));
  ```
- Halaman Lapangan terbang: ayat "Paling sibuk" kini hanya muncul bila data melebihi 2 hari dan menunjukkan `data ≈ X hari`. Label paksi X carta jam menunjukkan tarikh dan jam. (Diselesaikan dalam `f7f9dd7`.)

## Tugasan keselamatan

1. ~~Tukar kata laluan Neon~~ **Siap.** `DATABASE_URL` di Render sudah dikemas kini, collector disahkan masih berjalan.
2. ~~Tukar `CORS_ORIGIN`~~ **Siap.** Kini `https://airspace-dashboard.onrender.com`.
3. Jangan commit `.env` atau `.env.local`. Kedua-duanya sudah dikecualikan oleh `.gitignore`.
4. Jangan tampal `COLLECTOR_SECRET` dalam sembang atau dokumen, dan jangan biarkan ia kelihatan dalam output terminal yang dikongsi (`Read-Host` memaparkan apa yang ditaip). `COLLECTOR_SECRET` telah ditukar kerana terdedah. Nilai baharu mesti sama di Render dan **kedua-dua** job cron-job.org (`server/.env` tempatan boleh berbeza).
5. Jangan guna Neon production sebagai `TEST_DATABASE_URL`: ujian lama menjalankan `DROP SCHEMA public CASCADE`. Guna branch ujian di Neon atau Postgres tempatan.

## Seterusnya (urutan cadangan)

1. **Betulkan CI** untuk `d98842c`: kenal pasti job yang gagal dalam tab **Actions** dan pastikan `server` dan `client` hijau.
2. ~~Butang "Muat turun Excel"~~ Siap (`d98842c`).
3. Sahkan cron harian: selepas 04:00, `SELECT max(hour) FROM hourly_stats WHERE airport = '*';` patut dalam sejam terakhir, dan `deletedObservations` kekal 0 sehingga data melebihi 30 hari.
4. Rekod Execution Time query baharu daripada Neon (tab Plan) untuk `explain-hourly.sql`.
5. Eksport PDF (`/api/stats/export.pdf`, `pdfkit`): tajuk, julat tarikh, jadual 10 teratas dan nota "diperhatikan oleh feed ADS-B".
6. Kemas kini PROPOSAL.md (status fasa, anggaran storan 13,300 baris sehari, kriteria kejayaan yang sudah diukur), tangkapan skrin dan kajian kes dalam README.
7. Ukur semula EXPLAIN apabila data mencapai 30 hari, dan ukur kriteria kejayaan lain (lihat PROPOSAL.md).
8. Tambah ujian dashboard lain (cth. pemetaan warna peta), warna IndiGo, dan semak awalan "Tidak dikenal pasti".

## Cara sambung semula

Ganti `<folder repo>` dengan lokasi klon repo (cth. `C:\Users\User\Documents\malaysian-airspace-analytics`). Server dan dashboard dijalankan dalam **dua tetingkap PowerShell berasingan**, dan kedua-duanya mesti dibiarkan terbuka. Akar repo tiada `package.json`, jadi `npm run` mesti dijalankan dalam `server` atau `client`.

```powershell
# Tetingkap 1: server (perlu server\.env, lihat bawah)
cd <folder repo>\server
npm run dev                 # http://localhost:3000

# Tetingkap 2: dashboard
cd <folder repo>\client
"VITE_API_URL=http://localhost:3000" | Out-File -Encoding ascii .env.local
npm run dev                 # http://localhost:5173

# Ujian
npm --prefix server test
npm --prefix client test

# Semak data terkini (cloud)
curl.exe https://malaysian-airspace-analytics.onrender.com/api/stats/overview
```

`server\.env` tiada di GitHub. Salin `server\.env.example` dan isi (setiap satu **satu baris sahaja**): `DATABASE_URL` (sambungan Neon langsung), `COLLECTOR_SECRET` (nilai apa-apa untuk tempatan) dan `CORS_ORIGIN=http://localhost:5173`. `CORS_ORIGIN` mesti nilai itu, kerana API di Render hanya membenarkan URL dashboard Render, jadi dashboard tempatan tidak boleh membaca API Render secara terus.

Windows: jika `npm --prefix server test` memberi "Cannot find native binding" (rolldown), pasang binari yang tertinggal tanpa mengubah lockfile:
```powershell
$v = (Get-Content server\node_modules\rolldown\package.json | ConvertFrom-Json).version
npm --prefix server install --no-save "@rolldown/binding-win32-x64-msvc@$v"
```
`npm install` dalam `client` boleh mengubah `client/package-lock.json` pada komputer baharu. Jangan commit perubahan itu (`git checkout -- client/package-lock.json`). Gunakan nama fail eksplisit dalam `git add`, bukan `git add .`.

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
Jangan jalankan ini jika `DATABASE_URL` tempatan menunjuk ke Neon production, melainkan memang dimaksudkan.

## Log perubahan

- **10 Nov 2026**: collector diuji (84 pesawat, adsb.lol), skema dimigrasi ke Neon, API di-deploy ke Render, cron-job.org dikonfigurasi, repo dimasukkan ke GitHub. Dashboard Ringkasan dan Lapangan terbang dibina dan di-deploy sebagai Static Site. Folder `src` berganda di akar repo dibuang.
- **11 Nov 2026**: halaman Syarikat dan peta kepadatan (petak grid 0.1 darjah, Leaflet, tile OpenStreetMap) siap dan di-deploy. leaflet.heat gagal dimuat sebagai modul ES, jadi digantikan dengan petak segi empat Leaflet. Kata laluan Neon ditukar dan `CORS_ORIGIN` dihadkan kepada URL dashboard. Migrasi `002_hourly_stats.sql` dan `server/src/maintenance.js` ditambah, endpoint `POST /api/maintenance` dibina dan diuji tempatan, spot-check ringkasan lulus (267 snapshot, padanan tepat).
- **12 Nov 2026**: `/api/maintenance` disahkan di Render (200, 486 baris diringkaskan, 0 dipadam, cutoff 13 Okt). `/hourly` kini membaca `hourly_stats` (hujung julat yang belum diringkaskan masih dibaca daripada `observations`), commit `32e23e8`, dengan ujian baharu untuk `/hourly`, `/density` dan `/maintenance`. Fasa 4 ditutup. `COLLECTOR_SECRET` ditukar kerana terdedah dalam output terminal, dan cron job harian untuk `/api/maintenance` dicipta. Fasa 5 bermula: Vitest dipasang dalam `client` dan job `client` ditambah dalam `ci.yml` (`ea33fdd`).
- **13 hingga 15 Nov 2026**: eksport CSV (`/api/stats/export.csv`, `1cc255c`), disahkan di Render. Butang "Muat turun CSV" pada halaman Lapangan terbang dan Syarikat, ayat "Paling sibuk" hanya bila data melebihi 2 hari, dan label paksi X dengan jam (`f7f9dd7`).
- **15 Nov 2026**: eksport Excel bertema (`/api/stats/export.xlsx`, `ee41b31`) dengan `exceljs`, ujian unit dan ujian laluan baharu. Kerja disambung pada komputer lain (klon baharu), dan masalah pemasangan rolldown di Windows dicatat di atas.
- **16 Nov 2026**: butang "Muat turun Excel" (di sebelah butang CSV) pada halaman Lapangan terbang dan Syarikat di-push (`d98842c`), dan README serta PROGRESS dikemas kini (`b9dd70d`). Eksport Excel disahkan di Render: muat turun dua kali berturut-turut berfungsi, jadi cache tidak merosakkan respons binari. Ayat "Paling sibuk" menunjukkan `data ≈ 5.6 hari`. Commit `d98842c` bertanda X merah di GitHub: job CI yang gagal belum dikenal pasti.
