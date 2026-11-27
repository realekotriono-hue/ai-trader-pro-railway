# AI Trader Pro — Railway deployment

Versi ini memindahkan project Hatchable ke Node.js + Express + Railway PostgreSQL.
Dashboard tetap disajikan dari `public/`, API dipasang pada `/api/*`, dan migrasi SQL dijalankan otomatis saat aplikasi start.

## Deploy ke Railway

1. Buat repository GitHub dan upload seluruh isi folder ini.
2. Di Railway, buat project **New Project → Deploy from GitHub Repo** lalu pilih repository.
3. Tambahkan **PostgreSQL** dari Railway (New → Database → PostgreSQL).
4. Pada service aplikasi, pastikan variable `DATABASE_URL` terhubung dari PostgreSQL (Railway biasanya menawarkan reference variable `${{Postgres.DATABASE_URL}}`).
5. Tambahkan variable `ADMIN_API_KEY` dengan secret acak panjang (minimal 32 karakter). Jangan masukkan secret ini ke GitHub.
6. Deploy. Railway menjalankan `npm start`; cek `/health`.

## Environment variables

- `DATABASE_URL` — wajib untuk data bridge, jurnal, command dan migrasi.
- `ADMIN_API_KEY` — wajib untuk membuat token MT5 dan mengirim perintah live.
- `PORT` — otomatis disediakan Railway.
- `PGSSLMODE=disable` — hanya untuk PostgreSQL lokal tanpa SSL.

## Membuat token MT5 Bridge

Setelah deploy, buat token sekali melalui terminal:

```bash
curl -X POST "https://YOUR-RAILWAY-DOMAIN/api/bridge/token" \
  -H "x-admin-key: YOUR_ADMIN_API_KEY"
```

Simpan token yang dikembalikan. Token hanya ditampilkan saat dibuat dan dipakai oleh EA MT5 sebagai header `x-bridge-token`.

## Endpoint

| Method | Endpoint | Kegunaan |
|---|---|---|
| GET | `/health` | Health check Railway |
| GET | `/api/dashboard?symbol=XAUUSD&tf=M3` | Dashboard + analisis |
| POST | `/api/analyze` | Scoring |
| POST | `/api/bridge/push` | Data pasar/akun dari MT5 |
| GET | `/api/bridge/commands?symbol=XAUUSD` | Ambil antrean order MT5 |
| POST | `/api/bridge/result` | Laporkan hasil eksekusi MT5 |
| POST | `/api/bridge/token` | Buat/rotasi token (admin) |
| POST | `/api/execute` | Antrekan order live (admin) |

Endpoint admin memerlukan header `x-admin-key`. Dashboard meminta key melalui prompt saat pertama kali menekan tombol eksekusi live; key disimpan hanya di `sessionStorage` tab browser dan tidak ditanam di source code.

## Keamanan live trading

Project tetap menggunakan kebijakan yang ada: bridge harus fresh, terminal harus di-arm, confidence minimal 80, MTF + OB + spread harus lolos, tidak boleh ada posisi terbuka pada simbol yang sama, dan risiko dibatasi 0.1–3%. Perintah live membutuhkan konfirmasi di dashboard dan diverifikasi lagi di server. Mulai dari akun demo; jangan aktifkan live sebelum menguji EA, simbol broker, ukuran lot, spread, dan stop level.

## Local run

```bash
cp .env.example .env
# Isi DATABASE_URL dan ADMIN_API_KEY
npm install
npm start
```
