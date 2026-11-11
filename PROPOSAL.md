# Cadangan Projek: Malaysian Airspace Analytics

> Draf yang dikemas kini berdasarkan `GUIDE.md` dan keadaan sebenar projek pada 10 November 2026. Jika ada proposal asal, selaraskan bahagian yang berbeza.

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
- Dashboard: Ringkasan, Lapangan terbang, Syarikat, peta heatmap
- Jadual ringkasan dan retensi data 30 hari
- Eksport CSV dan PDF
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
| 3 | Dashboard (Ringkasan, Lapangan terbang, Syarikat) | Minggu 2 | Separa (Syarikat belum) |
| 4 | Heatmap, `hourly_stats`, retensi | Minggu 3 | Belum |
| 5 | Eksport, CI penuh, dokumentasi | Minggu 4 | Belum |

Collector didahulukan kerana data tidak boleh diambil semula.

## Kriteria kejayaan

1. Soalan "bila KUL paling sibuk pada hari bekerja?" dijawab dalam kurang 1 minit menggunakan dashboard.
2. Kadar kejayaan collector tinggi dan boleh diukur melalui `/api/stats/collector`.
3. Masa query pada data penuh diukur dengan `EXPLAIN ANALYZE`, dan dilaporkan sebelum dan selepas jadual ringkasan.
4. Jadual ringkasan sepadan dengan query mentah (spot-check untuk satu hari).
5. URL awam berfungsi dan CI hijau.

## Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| Terma penggunaan penyedia feed menghalang kegunaan | Semak terma setiap penyedia, sediakan feed alternatif dalam `feeds.js` |
| Feed utama gagal atau berubah format | Fallback automatik ke feed lain dan OpenSky, kegagalan dilog dalam `collector_runs` |
| Had pengiraan percuma Neon habis kerana cron kerap | Pantau selepas 2 hingga 3 hari, tukar ke setiap 10 minit atau guna Supabase |
| Storan membesar (anggaran sekitar 22,000 baris sehari) | Retensi 30 hari selepas diringkaskan, semak saiz selepas seminggu |
| `nearest_apt` disalah tafsir sebagai berlepas atau mendarat | Nota pada caption carta, definisi "dalam 60 km" |
| Pelan percuma Render tidur | Cron 5 minit menjaga API terjaga, dashboard berupa laman statik |
| Data hilang bila collector berhenti | Notifikasi emel kegagalan cron-job, jurang ditandakan pada carta |

## Penafian data

Angka mewakili pesawat yang diperhatikan oleh feed ADS-B awam. Liputan bergantung pada penerima sukarelawan dan bukan bilangan rasmi penerbangan.
