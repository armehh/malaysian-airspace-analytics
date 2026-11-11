# Malaysian Airspace Analytics

Merekod aktiviti pesawat di ruang udara Malaysia setiap 5 minit ke PostgreSQL, kemudian memaparkannya sebagai dashboard analitik sejarah.

> Angka ialah **pesawat yang diperhatikan oleh feed ADS-B awam**, bukan jumlah rasmi penerbangan. Liputan feed bergantung pada penerima sukarelawan, jadi sesetengah kawasan mungkin kurang tepat.

**Dashboard:** https://airspace-dashboard.onrender.com
**API:** https://malaysian-airspace-analytics.onrender.com/api/health

> Kedua-dua perkhidmatan berjalan pada pelan percuma Render. Permintaan pertama selepas tempoh tidak aktif boleh lambat sehingga 50 saat.

## Seni bina

```
cron-job.org ──(POST setiap 5 min)──> Render: API (Node/Express) ──> Neon: PostgreSQL
                                              ^
Render: Dashboard (React, laman statik) ──────┘  (GET /api/stats/*)
```

Penjadual luaran digunakan kerana pelan percuma Render tidur bila tiada permintaan. Panggilan setiap 5 minit juga menjaga API sentiasa terjaga.

## Ciri semasa

- **Collector**: mengambil snapshot pesawat dari tiga wilayah (Semenanjung, Sarawak, Sabah) dengan fallback antara beberapa feed
- **Ringkasan**: bilangan pesawat sekarang, syarikat penerbangan, pesawat tertinggi dan terlaju, trend 24 jam, status collector
- **Lapangan terbang**: ranking, carta setiap jam, dan grid corak mingguan (hari × jam) bagi setiap lapangan terbang

Lihat [PROGRESS.md](PROGRESS.md) untuk status terkini dan perkara yang akan datang.

## Teknologi

| Lapisan | Pilihan |
|---|---|
| Pangkalan data | PostgreSQL (Neon, wilayah Singapore) |
| API | Node.js 20+, Express 5, Zod, `pg` |
| Dashboard | React, TypeScript, Vite, Recharts |
| Ujian | Vitest, Supertest |
| Hos | Render (API dan laman statik), cron-job.org (penjadual) |

## Struktur

```
server/   API, collector, skema SQL, ujian
client/   Dashboard React + Vite
.github/  CI dan penjadual alternatif
GUIDE.md  Panduan pembinaan langkah demi langkah
```

## Mula pantas (tempatan)

### Server
```bash
cd server
cp .env.example .env        # isi DATABASE_URL dan COLLECTOR_SECRET
npm install
npm run migrate
npm run dev
curl -X POST -H "x-collector-secret: <rahsia>" localhost:3000/api/collect
```

### Dashboard
```bash
cd client
npm install
echo VITE_API_URL=http://localhost:3000 > .env.local
npm run dev                 # http://localhost:5173
```

Untuk membaca API yang sudah di-deploy, letak `VITE_API_URL=https://malaysian-airspace-analytics.onrender.com`.

### Nota untuk Windows (PowerShell)
- Guna `curl.exe`, bukan `curl` (alias PowerShell berbeza).
- Jika `npm` disekat, jalankan sekali: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`
- Dalam `.env`, letak `DATABASE_URL` sebagai **satu baris sahaja**. Jangan biarkan baris contoh lama kekal.

## Pemboleh ubah persekitaran

| Pemboleh ubah | Tempat | Fungsi |
|---|---|---|
| `DATABASE_URL` | server | Sambungan Postgres. Guna sambungan **langsung** (tanpa `-pooler`) kerana collector guna advisory lock |
| `COLLECTOR_SECRET` | server | Rahsia untuk header `x-collector-secret` pada `/api/collect` |
| `CORS_ORIGIN` | server | Asal yang dibenarkan membaca API (URL dashboard) |
| `PORT` | server | Lalai 3000 (Render menetapkannya sendiri) |
| `CACHE_TTL_MS` | server | Cache respons statistik, lalai 60000 |
| `VITE_API_URL` | client | Alamat asas API, tanpa garis condong di hujung |

## Endpoint API

| Kaedah | Laluan | Fungsi |
|---|---|---|
| POST | `/api/collect` | Ambil snapshot (perlu header `x-collector-secret`) |
| GET | `/api/health` | Semak hidup + sambungan DB |
| GET | `/api/stats/overview` | Ringkasan terkini + trend 24 jam vs paras biasa |
| GET | `/api/stats/hourly?airport=KUL&from=&to=` | Purata pesawat setiap jam (masa Malaysia) |
| GET | `/api/stats/airports` | Senarai lapangan terbang |
| GET | `/api/stats/airports/compare` | Banding lapangan terbang |
| GET | `/api/stats/airports/:code/weekly` | Grid hari × jam |
| GET | `/api/stats/airlines` | Ranking syarikat penerbangan |
| GET | `/api/stats/airlines/timeseries?bucket=day` | Siri masa syarikat |
| GET | `/api/stats/collector` | Kadar kejayaan collector |

`from` dan `to` ialah tarikh ISO. Lalai ialah 7 hari terakhir, maksimum 90 hari.

## Keputusan reka bentuk

1. **Purata mengira snapshot tanpa pesawat sebagai 0** (`LEFT JOIN`). Jika tidak, jam yang sunyi akan nampak lebih sibuk daripada sebenar.
2. **Larian gagal tidak mencipta snapshot.** Jurang data kekal sebagai jurang, bukan 0. Setiap titik carta membawa bilangan `snapshots` (jangkaan 12 sejam) supaya jam tidak lengkap boleh ditandakan.
3. **Pesawat di darat dibuang**, supaya "ruang udara" bermaksud pesawat di udara.
4. **Semua masa dikumpul dalam Asia/Kuala_Lumpur di SQL**, bukan di pelayar.
5. **Penjadual luaran**, kerana pelan percuma Render tidur dan GitHub Actions cron boleh lewat beberapa minit.

## Had yang diketahui

- `nearest_apt` bermaksud pesawat berada dalam lingkungan **60 km** dari lapangan terbang, bukan bukti berlepas atau mendarat.
- Data ADS-B awam tidak boleh diambil semula. Setiap hari collector tidak berjalan, data hari itu hilang.
- Corak mingguan hanya bermakna selepas beberapa minggu pengumpulan.
- Semak terma penggunaan setiap penyedia feed sebelum menggunakan data ini secara komersial.

## Ujian

```bash
cd server
npm test                    # ujian unit sahaja jika tiada pangkalan data ujian
TEST_DATABASE_URL=postgres://user:pass@localhost/airspace_test npm test   # termasuk ujian API
```

CI (`.github/workflows/ci.yml`) menjalankan ujian server dengan Postgres 16.
