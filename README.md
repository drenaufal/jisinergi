# Footgrit Finance

Website untuk **monitoring keuangan unit bisnis**. Next.js 16 · React 19 · Auth.js · Drizzle ORM · MariaDB/MySQL · Tailwind 4.
Tampilan hitam-putih, sudut siku, bahasa Indonesia.

## Alur

1. **Owner membuat unit bisnis** (menu *Kelola Unit Bisnis*) dan memilih jenisnya: **Liga** atau **Sekolah Bola**.
2. Owner membuat **akun Admin Unit** untuk unit itu. Admin Unit hanya melihat dan mengisi unitnya sendiri.
3. Data diisi lewat **menu unit**. Menu bergantung pada jenis unit:

| Jenis | Menu |
|---|---|
| **Liga** | Aset · Dividen · Modal · Match Fee (+ pemasukan lain) · Registrasi · RAB · RAB Actual |
| **Sekolah Bola** | Pemasukan (siswa + pembayaran) · Pengeluaran · Aset · Modal · Dividen |

Setiap unit punya **pemilik** (boleh lebih dari dua) dengan persentase dividen masing-masing; Owner mengubah persentasenya di menu Dividen. Baris **RAB** yang sudah disimpan tidak bisa diubah, dan baris/pengeluaran bertanda **Aset** otomatis masuk ke menu Aset. Setiap unit juga punya halaman **Ringkasan** dengan angka dan grafik.

## Peran

| Peran | Bisa |
|---|---|
| **Owner** | Melihat dan mengisi semua unit · membuat unit dan akun · menghapus data · jejak audit · **Ringkasan Owner** (dividen terakumulasi vs target Rp 3 M, penjelasan Liga dan Sekolah Bola dipisah, filter per unit) |
| **Admin Unit Bisnis** | Hanya melihat dan menginput data unitnya sendiri. Tidak bisa menghapus. |

## Rumus

- **Dividen Liga** = RAB − (uang modal + uang masuk registrasi + uang masuk match fee)
- **Dividen Sekolah Bola (per bulan)** = pemasukan − pengeluaran (**sisa saldo**), dihitung per bulan lalu dijumlahkan
- **Bagian tiap pemilik** = dividen unit × persentase pemilik itu
- **Akumulasi Owner** = dividen semua unit Liga + dividen semua unit Sekolah Bola, dibandingkan dengan target `DIVIDEND_TARGET` (Rp 3.000.000.000, di `lib/finance/config.ts`)

Detail dan keputusan baca data: [docs/finance.md](docs/finance.md).

## Menjalankan di komputer lokal

```bash
cp .env.example .env.local      # isi DATABASE_URL dan AUTH_SECRET
npm install
npm run db:setup-local          # buat database lokal, migrasi, dan akun Owner (meminta password root MariaDB)
# atau, bila database sudah ada:
npm run db:migrate
OWNER_EMAIL=anda@contoh.com OWNER_PASSWORD='min-8-karakter' npm run db:seed:owner
npm run db:seed:demo            # opsional: dua unit contoh (Liga dan Sekolah Bola)
npm run db:import:excel         # opsional: unit Liga dari dua file Excel contoh (dengan foto bukti), lihat docs/finance.md
npm run dev                     # http://localhost:3000
```

`DEMO_PASSWORD=… npm run db:seed:demo` juga membuat akun Admin Unit contoh. Hapus semua data contoh dengan `npm run db:seed:demo -- --remove`.

## Deploy

Butuh hosting Node.js (20+) dan database MariaDB/MySQL.

1. Isi variabel lingkungan dari `.env.example` di hosting. `AUTH_URL` harus URL publik situs; `AUTH_SECRET` nilai acak baru (`npx auth secret`).
2. `npm ci && npm run build && npm run db:migrate`
3. Buat akun Owner: `OWNER_EMAIL=… OWNER_PASSWORD=… npm run db:seed:owner`
4. `npm start`

## Pemeriksaan

```bash
npm run typecheck && npm run test:finance && npm run test:access && npm run lint
npm run test:records            # aturan di lapisan database; membuat dan menghapus unit sementara
```

`test:finance` dan `test:access` tidak butuh database; `test:records` butuh database yang sudah dimigrasi.

## Struktur

| Bagian | Lokasi |
|---|---|
| Halaman unit (`/u/<kode>/…`) | `app/(app)/u/[code]/` |
| Ringkasan Owner, Kelola Unit, Jejak Audit | `app/(app)/ringkasan`, `app/(app)/unit`, `app/(app)/audit` |
| Menu per jenis unit | `lib/finance/unit-types.ts` |
| Hitungan (rumus dividen, target) | `lib/finance/calc.ts` |
| Siapa boleh apa | `lib/auth/rbac.ts`, `lib/finance/scope.ts` |
| Skema database | `lib/db/schema.ts`, `drizzle/` |
