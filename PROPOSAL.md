# Cadangan Projek: Malaysian Airspace Analytics

> Dikemas kini pada 19 November 2026 berdasarkan `GUIDE.md` dan keadaan sebenar projek. Jika ada proposal asal, selaraskan bahagian yang berbeza.

## Latar belakang

Data pergerakan pesawat dari penerima ADS-B awam tersedia secara langsung, tetapi tidak menyimpan sejarah. Tanpa sejarah, soalan seperti "bila KLIA paling sibuk pada hari bekerja?" tidak boleh dijawab. Projek ini merekod data itu secara berkala dan memaparkannya sebagai analitik sejarah untuk ruang udara Malaysia.

## Objektif

1. Merekod pesawat di ruang udara Malaysia setiap 5 minit, secara automatik dan berterusan.
2. Menyimpan sejarah dalam pangkalan data yang boleh disoal.
3. Memaparkan corak trafik (mengikut jam, hari, lapangan terbang, syarikat penerbangan) melalui dashboard awam.
4. Menunjukkan amalan kejuruteraan: penjadualan, ujian, CI, deploy dan dokumentasi.

## Skop

**Dalam skop**
- Collector berbilang feed dengan fallback
- Skema Postgres, REST API, ujian
- Dashboard: Ringkasan, Lapangan terbang, Syarikat, peta kepadatan (petak grid, bukan heatmap)
- Jadual ringkasan dan retensi data 30 hari
- Eksport CSV dan Excel (PDF pilihan)
- Deploy awam dan dokumentasi

**Di luar skop**
- Penjejakan pesawat masa nyata (live map dengan laluan)
- Ramalan atau pembelajaran mesin
- Pengesahan pengguna
- Jumlah rasmi penerbangan (angka ialah apa yang diperhatikan feed awam)

## Pendekatan teknikal

| Komponen | Pilihan |
|---|---|
| Sumber data | adsb.lol (utama), airplanes.live, adsb.fi, OpenSky (fallback) |
| Penjadual | cron-job.org, POST setiap 5 minit |
| API | Node.js, Express, Zod |
| Pangkalan data | PostgreSQL di Neon |
| Dashboard | React, TypeScript, Vite, Recharts, Leaflet (peta) |
| Hos | Render (API dan laman statik) |

Seni bina: penjadual memanggil API, API mengambil snapshot dan menyimpannya, dashboard membaca statistik daripada API.

## Fasa dan jadual

| Fasa | Kandungan | Sasaran asal | Status |
|---|---|---|---|
| 1 | Skema, collector | Minggu 1 | Siap |
| 2 | API dan ujian | Minggu 1 | Siap |
| 3 | Dashboard (Ringkasan, Lapangan terbang, Syarikat) | Minggu 2 | Siap |
| 4 | Peta kepadatan, `hourly_stats`, retensi | Minggu 3 | Siap |
| 5 | Eksport, CI penuh, dokumentasi | Minggu 4 | Hampir siap (eksport CSV dan Excel serta CI siap; PDF, tangkapan skrin dan dokumentasi akhir tinggal) |

Collector didahulukan kerana data tidak boleh diambil semula.

## Kriteria kejayaan

1. Soalan "bila KUL paling sibuk pada hari bekerja?" dijawab dalam kurang 1 minit menggunakan dashboard.
2. Kadar kejayaan collector tinggi dan boleh diukur melalui `/api/stats/collector`. Diukur: 267 daripada 288 snapshot dijangka dalam satu tempoh 24 jam (92.7%). Collector terhenti kira-kira 52 jam pada 16 hingga 18 Nov kerana jadual cron tersilap, jadi ukur semula dengan julat lebih panjang.
3. Masa query pada data penuh diukur dengan `EXPLAIN ANALYZE`, dan dilaporkan sebelum dan selepas jadual ringkasan. Diukur pada data pendek (19 Nov, KUL, 7 hari dengan kira-kira 4.6 hari berdata, `EXPLAIN (ANALYZE, BUFFERS)` di Neon): query lama 5.96 ms, query baharu 1.92 ms. Kedua-duanya ringan pada data beberapa hari, jadi ukuran diulang apabila data mencapai 30 hari (sekitar 10 Disember). Data sintetik 30 hari (tempatan): 55 ms ke 5 ms.
4. Jadual ringkasan sepadan dengan query mentah (spot-check untuk satu hari). Dipenuhi: spot-check 24 jam (267 snapshot, 13,259 jumlah pesawat) memberi 0 percanggahan untuk semua pesawat dan KUL.
5. URL awam berfungsi dan CI hijau. Dipenuhi (CI hijau pada 18 Nov `a4e6456`, disahkan lagi pada 19 Nov `ff4acc0`).

## Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| Terma penggunaan penyedia feed menghalang kegunaan | Semak terma setiap penyedia, sediakan feed alternatif dalam `feeds.js` |
| Feed utama gagal atau berubah format | Fallback automatik ke feed lain dan OpenSky, kegagalan dilog dalam `collector_runs` |
| Had pengiraan percuma Neon habis kerana cron kerap | Pantau selepas 2 hingga 3 hari, tukar ke setiap 10 minit atau guna Supabase |
| Storan membesar (diukur sekitar 13,300 baris sehari, kira-kira 0.4 juta baris selepas 30 hari) | Retensi 30 hari selepas diringkaskan, semak saiz selepas seminggu |
| `nearest_apt` disalah tafsir sebagai berlepas atau mendarat | Nota pada caption carta, definisi "dalam 60 km" |
| Pelan percuma Render tidur | Cron 5 minit menjaga API terjaga, dashboard berupa laman statik |
| Data hilang bila collector berhenti | Notifikasi emel kegagalan cron-job, jurang kekal sebagai jurang dalam data (bukan diisi 0). Berlaku sekali (16 hingga 18 Nov, kira-kira 52 jam) kerana jadual cron tersilap, dan jurang itu tidak boleh diambil semula |
| `hourly_stats` tertinggal selepas gangguan panjang (jam tidak diringkaskan, `/hourly` menunjukkan 0 palsu) | Berlaku 16 Nov. Maintenance kini meringkaskan dari jam terakhir dalam `hourly_stats` (dihadkan kepada retensi 30 hari), `88b04ba`. Jam yang terlepas dibetulkan dengan upsert sekali jalan |

## Penafian data

Angka mewakili pesawat yang diperhatikan oleh feed ADS-B awam. Liputan bergantung pada penerima sukarelawan dan bukan bilangan rasmi penerbangan.

**Kategori "Tidak dikenal pasti"**: kira-kira separuh pemerhatian tiada callsign, dan separuh lagi menggunakan nombor pendaftaran pesawat (9M-, N, T7-, VP-, VH-, HS-) sebagai callsign, iaitu penerbangan am dan jet korporat. Bukan syarikat penerbangan komersial yang tiada dalam pemetaan (semakan 19 Nov, 7 hari).
