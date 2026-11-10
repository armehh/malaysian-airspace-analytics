# Malaysian Airspace Analytics

Merekod aktiviti pesawat di ruang udara Malaysia setiap 5 minit ke PostgreSQL, kemudian memaparkannya sebagai analitik sejarah.

> Angka ialah **pesawat yang diperhatikan oleh feed ADS-B awam**, bukan jumlah rasmi penerbangan.

## Struktur
- `server/` — Node.js + Express: collector, skema SQL, REST API, ujian (Fasa 1–2 siap)
- `client/` — React + Vite + TypeScript (Fasa 3, belum dibuat — lihat GUIDE.md)

## Mula pantas (tempatan)
```bash
cd server
cp .env.example .env        # isi DATABASE_URL & COLLECTOR_SECRET
npm install
npm run migrate
npm run dev
curl -X POST -H "x-collector-secret: <rahsia>" localhost:3000/api/collect
```

## Endpoint
| Kaedah | Laluan | Fungsi |
|---|---|---|
| POST | `/api/collect` | Ambil snapshot (perlu header `x-collector-secret`) |
| GET | `/api/health` | Semak hidup + DB |
| GET | `/api/stats/overview` | Ringkasan terkini + trend 24 jam vs biasa |
| GET | `/api/stats/hourly?airport=KUL&from=&to=` | Purata pesawat per jam (MYT) |
| GET | `/api/stats/airports/compare` | Banding lapangan terbang |
| GET | `/api/stats/airports/:code/weekly` | Grid hari × jam |
| GET | `/api/stats/airlines` | Ranking syarikat |
| GET | `/api/stats/airlines/timeseries?bucket=day` | Siri masa (stacked area) |
| GET | `/api/stats/collector` | Kadar kejayaan collector |

`from`/`to` ialah tarikh ISO, lalai 7 hari terakhir, maksimum 90 hari.

## Ujian
```bash
TEST_DATABASE_URL=postgres://user:pass@localhost/airspace_test npm test
```
