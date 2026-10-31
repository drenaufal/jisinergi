# Keuangan — panduan

Website monitoring keuangan untuk unit bisnis. Spesifikasi awal: sampai 10 unit bisnis; setiap unit punya login sendiri
dan hanya melihat/mengisi datanya sendiri; Owner melihat semuanya; setiap data punya statistik/grafik; ada halaman
ringkasan per unit.

## 1. Jenis unit dan menunya

Unit bisnis ada dua jenis, dengan menu berbeda (`lib/finance/unit-types.ts` adalah satu-satunya tempat yang menentukan):

| Jenis | Menu | Isi |
|---|---|---|
| **Liga** | Aset | pembelian peralatan/sarana (tanggal, nama, nominal, struk) |
| | Dividen | rumus dividen + pembagian ke pemilik dalam persen |
| | Modal | uang yang disetor pemodal, sudah/belum kembali |
| | Match Fee | uang masuk per klub per minggu (laga × tarif), per kelompok umur bila ada; di bawahnya **Pemasukan lain** (sewa stand, tiket parkir) per minggu |
| | Registrasi | uang masuk per klub (dan kelompok umur): biaya, DP, pelunasan, bukti transfer |
| | RAB | rencana anggaran biaya (mingguan × lama program + bulanan); baris yang disimpan **tidak bisa diubah** |
| | RAB Actual | biaya yang benar-benar keluar, per keterangan biaya dan per minggu; bagian mingguan dan bulanan terpisah |
| **Sekolah Bola** | Pemasukan | daftar siswa + pembayaran (registrasi, iuran bulanan) |
| | Pengeluaran | laporan pengeluaran sekolah, ditandai Aset / Non aset |
| | Aset | peralatan dan sarana (juga terisi otomatis dari pengeluaran bertanda Aset) |
| | Modal | uang yang disetor pemilik |
| | Dividen | sisa saldo dan pembagian ke pemilik dalam persen |

Jenis dipilih saat unit dibuat dan **tidak bisa diubah** setelahnya, karena data dan menunya berbeda. Satu jenis data tidak
bisa disimpan di jenis unit yang salah (ditolak di server, bukan hanya disembunyikan di menu).

## 2. Kepemilikan dan Dividen

- Saat unit dibuat, Owner mengisi **pemilik** (boleh lebih dari dua) dan **persentase dividen** masing-masing; totalnya harus
  tepat 100%. Untuk Sekolah Bola ada juga kolom **modal yang disetor**, yang langsung menjadi baris di menu Modal.
- Persentase disimpan dalam *basis point* (10.000 = 100%) agar jumlahnya selalu pas. Nominal bagian tiap pemilik dihitung
  dari dividen dengan pembulatan sisa terbesar, sehingga jumlah bagian **selalu sama persis** dengan dividen
  (`splitByShares` di `lib/finance/ownership.ts`).
- Menu **Dividen** (Liga dan Sekolah Bola) menampilkan rumus dividen, lalu tabel pemilik: nama, persentase, bagian dividen.
  **Hanya Owner** yang bisa mengubah persentase (tombol *Ubah pembagian*); yang diubah persentasenya, bukan nominalnya.
  Dividen yang negatif dibagi dengan cara yang sama (kerugian).
- Pencatatan dividen lama berbasis nominal (`fin_dividends`) sudah tidak dipakai. Migrasi `0001` menyalinnya menjadi
  pemilik + persentase; tabelnya dibiarkan (tidak dihapus) sampai datanya tidak dibutuhkan lagi.

## 3. Rumus

| Angka | Rumus |
|---|---|
| **Dividen Liga** | RAB − (uang modal + uang masuk registrasi + uang masuk match fee) |
| **Dividen Sekolah Bola** = **sisa saldo** | pemasukan − pengeluaran, **per bulan**; akumulasi = jumlah semua bulan |
| **Akumulasi dividen Owner** | Σ dividen unit Liga + Σ dividen unit Sekolah Bola |
| **Progres target** | akumulasi ÷ Rp 3.000.000.000 (akumulasi negatif dihitung 0%; bisa melebihi 100%) |
| **Akumulasi aset Owner** | Σ aset semua unit, Liga dan Sekolah Bola |

Rincian:

- *RAB* = biaya mingguan × `programWeeks` unit + biaya bulanan (dihitung sekali). *Uang modal* = semua modal yang disetor.
  *Registrasi* = DP + pelunasan yang sudah **diterima**. *Match fee* = laga × tarif per laga.
- Sekolah Bola memakai dasar kas: pembayaran dihitung di bulan **tanggal dibayar**, pengeluaran di bulan **tanggal pengeluaran**.
  Bulan yang hanya punya pengeluaran menghasilkan sisa saldo negatif. **Diskon tidak mengurangi pemasukan** — pemasukan adalah
  uang yang benar-benar diterima; diskon hanya dicatat sebagai informasi.
- **Modal Sekolah Bola tidak mengubah sisa saldo/dividen** (rumus dari spesifikasi hanya pemasukan − pengeluaran); modal dan
  aset ditampilkan sendiri.
- Hasil Dividen Liga bisa **negatif** bila modal + registrasi + match fee melebihi RAB.

## 4. RAB dan aset

- Baris RAB yang sudah disimpan **tidak bisa diubah lagi** (tidak ada tombol ubah; server menolaknya). Menambah baris
  tetap bisa. Hanya Owner yang bisa menghapus baris, dan tidak bisa bila baris itu sudah punya biaya actual.
- Setiap baris RAB dipilih **Aset** atau **Non aset** (radio). Baris Aset otomatis membuat baris di menu Aset senilai total
  baris selama program (baris mingguan × jumlah minggu program, baris bulanan sekali), tanggal = hari baris disimpan.
  Aset hasil otomatis mengikuti sumbernya: tidak bisa diubah/dihapus sendiri, hilang bila baris RAB-nya dihapus.
- Sekolah Bola: pengeluaran juga dipilih Aset / Non aset. Pengeluaran Aset membuat satu baris di Aset (nama, nominal,
  tanggal, dan struk sama); mengubah pengeluaran ikut mengubah asetnya, mengganti ke Non aset atau menghapusnya
  menghapus aset itu.

## 5. RAB Actual (Liga)

Halaman seperti lembar Excel “Weekly / Monthly Forecasting dan Actual”: baris = keterangan biaya, kolom = budget, Week 1…n, Total, Sisa.
Biaya **mingguan** dan **bulanan** ada di dua bagian terpisah (nomor kategori dan total masing-masing), dengan
**Total estimasi OPEX** (mingguan + bulanan) di bawahnya.

- Keterangan biaya dan budget diambil dari RAB. Budget yang tampil adalah nilai baris RAB (mingguan = per minggu, bulanan =
  sekali); **Sisa** = budget seluruh program (mingguan × jumlah minggu) − total actual, bertanda ▲ bila melebihi budget.
- *Tambah keterangan biaya* membuat baris di luar RAB (tanpa budget, tampil “Di luar RAB”), mingguan atau bulanan. Kategori yang
  sama dengan RAB (dalam bagian yang sama) bergabung dalam satu kelompok.
- Di bawah total mingguan ada baris **Budget per minggu** dan **Selisih (actual − budget)**, dihitung sampai minggu yang sudah
  berjalan dan punya biaya mingguan (▲ = lebih besar dari budget, ▼ = hemat), seperti baris selisih di Excel. Kartu
  *Rata-rata per minggu* memakai angka yang sama.
- *Tambah biaya actual*: pilih keterangan biaya, nominal, **tanggal**, **bukti pembayaran** (unggah), catatan. Biaya masuk
  ke kolom minggu sesuai tanggalnya dan biaya di minggu yang sama dijumlahkan.
- Klik nama keterangan biaya untuk melihat rincian: tanggal bayar, minggu, nominal, bukti, catatan — dengan tombol ubah/hapus.
  Catatan sel Excel (mis. “Kopi dan rujak”) menjadi catatan biaya.
- **Minggu 1** dimulai pada *Tanggal mulai program* unit (diisi Owner di Kelola Unit Bisnis). Bila kosong, minggu 1 dimulai
  Senin pada minggu biaya actual pertama. Biaya sebelum minggu 1 masuk kolom “Sebelum”; biaya setelah minggu program terakhir
  melebarkan kolom.

## 5b. Kelompok umur, registrasi, match fee, dan pemasukan lain (Liga)

- Klub mendaftar **per kelompok umur** (U8, U9, …; kolom opsional). Klub yang sama di dua kelompok punya dua registrasi dan
  dua baris match fee; kunci unik = unit + kelompok + klub (+ minggu). Halaman Registrasi menampilkan kolom kelompok dan
  ringkasan per kelompok; kisi Match Fee dikelompokkan per kelompok dengan subtotal.
- Registrasi punya bukti **DP** dan bukti **pelunasan**; match fee punya bukti transfer per minggu.
- **Pemasukan lain** (sewa stand, tiket parkir): nama, minggu, nominal, bukti transfer. Ditampilkan di halaman Match Fee dan
  disebut di kartu “Uang masuk”, tetapi **tidak ikut rumus dividen** (rumus dari spesifikasi hanya modal + registrasi +
  match fee).

## 6. Pemasukan Sekolah Bola (dari formulir “SEKOLAH BOLA”)

Formulir Excel punya satu baris per anak dengan kolom: Nama Anak, Tgl Bergabung, Uang/Bukti/Diskon Registrasi,
Uang/Bukti/Diskon Pembayaran Bulanan, No Punggung, Nama Panggilan, Tanggal Lahir. Di aplikasi data itu dipecah menjadi dua
tabel supaya iuran bulanan bisa dicatat setiap bulan:

- `fin_students` — identitas anak (nama, nama panggilan, tgl bergabung, **tgl lahir (kolom sendiri di tab Siswa)**, no punggung)
- `fin_student_payments` — satu baris per pembayaran: jenis (`registration` / `monthly`), tanggal, uang, diskon,
  bulan yang tercakup (`YYYY-MM`), bukti.

Aturan:

- **Uang registrasi sudah termasuk iuran bulan saat registrasi dibayar.** Registrasi disimpan dengan bulan itu sebagai
  periodenya; iuran bulanan untuk bulan yang sama ditolak (dan sebaliknya), dan kolom “Bulan ini” menandai siswa lunas.
- **Uang jersey tidak dicatat sebagai pemasukan.** Jenis pembayaran jersey dihapus dari form, kartu, dan perhitungan. Baris
  `jersey` lama (bila ada) dibiarkan di database tetapi tidak ditampilkan dan tidak dihitung.
- Satu registrasi per siswa, satu iuran per siswa per bulan.
- Kartu **Sisa saldo** di halaman Pemasukan = pemasukan − pengeluaran bulan ini (dividen per bulan), dengan akumulasinya.

Tab **Siswa** menampilkan satu baris per anak (seperti baris Excel) dengan tombol **Bayar**; tab **Pembayaran** menampilkan
semua pembayaran, bisa difilter per jenis.

## 7. Pengeluaran Sekolah Bola

Tabel `fin_expenses`: tanggal, kategori, keterangan, nominal, **Aset/Non aset**, bukti, catatan. **Kolom ini dibuat generik**
karena file “LAPORAN PENGELUARAN SEKOLAH BOLA” belum tersedia saat dibangun — sesuaikan setelah melihat kolom aslinya.

## 8. Peran dan akses

| | Owner | Admin Unit Bisnis |
|---|---|---|
| Melihat unit | semua | hanya unitnya |
| Menambah / mengubah data | semua unit | hanya unitnya (kecuali RAB yang terkunci dan aset otomatis) |
| Menghapus data | ya | tidak |
| Membuat unit, akun login, dan mengubah persentase dividen | ya | tidak |
| Ringkasan Owner (target dividen, akumulasi aset), Jejak Audit | ya | tidak |

Akses dijaga **di server**: alamat unit lain, halaman Owner, dan jenis menu yang tidak dimiliki unit itu ditolak (dialihkan
dengan pemberitahuan, atau 404). Bukti pembayaran hanya bisa dibuka oleh pemilik unitnya atau Owner. Setiap perubahan
tercatat di Jejak Audit.

## 9. Data demo dan impor Excel

`npm run db:seed:demo` membuat dua unit contoh agar semua layar terisi (menambah yang belum ada, tidak menimpa):

- **Liga Demo** (`LIGA-DEMO`): angka asli dari enam workbook awal (ASET, DEVIDEN, MODAL, UANG MASUK MATCH FEE, UANG MASUK
  REGISTRASI, RAB). `npm run test:finance` mencocokkannya dengan total yang dihitung Excel (aset 5,3 jt · modal 60 jt ·
  registrasi ditagih 17,5 jt / diterima 7,5 jt · 52 laga / 26 jt match fee · RAB 265,2 jt) → dividen rumus Rp 171.700.000.
  Pemilik A 70% / B 30% (dari workbook DEVIDEN) dan contoh **RAB Actual** untuk tiga minggu pertama.
- **Sekolah Bola Demo** (`SB-DEMO`): data **karangan** (8 siswa “Siswa Contoh”, registrasi + iuran Agu–Okt 2026, 10
  pengeluaran dengan 3 bertanda Aset, dua pemilik beserta modalnya).

**Impor dari Excel** — `npm run db:import:excel` memuat dua file contoh sebagai dua unit Liga (angka dan foto bukti asli):

| File | Unit | Isi |
|---|---|---|
| `file RAB Actual.xlsx` | `LIGA-RAB` | RAB mingguan + bulanan, actual 10 minggu (Rp 257.608.000), catatan sel, 2 baris di luar RAB; 5 baris peralatan ditandai Aset |
| `LAPORAN PENGELUARAN SEKOLAH BOLA.xlsx` | `LIGA-IYFL` | 34 klub di U8–U11 (registrasi dengan bukti DP/lunas), 67 baris match fee, 4 pemasukan lain, RAB + actual dengan bukti transfer per minggu |

Pembaca Excel ada di `scripts/lib/` (tanpa dependensi; membaca gambar yang ditanam WPS). Importer memeriksa total hasil bacaan
terhadap total yang tertulis di sheet dan **tidak menulis apa pun bila ada yang berbeda**. Pilihan: `--dry-run`, `--reset`
(ganti dua unit itu), `--remove`, `--rab-actual "<file>"`, `--laporan "<file>"`. Sheet hanya menyebut “Week n”, jadi setiap biaya
bertanggal hari pertama minggunya (minggu 1 = 2 Okt 2026 untuk `LIGA-RAB`, 10 Okt 2026 untuk `LIGA-IYFL`, dari tanggal foto
bukti). Registrasi yang hanya mencatat total dibayar dibagi: dua bukti → DP separuh biaya + sisanya pelunasan, satu bukti →
satu tahap. File “LAPORAN PENGELUARAN SEKOLAH BOLA” sebenarnya berisi data Liga, bukan siswa/pengeluaran sekolah.

Hapus data demo dengan `npm run db:seed:demo -- --remove` sebelum memakai data sungguhan. Untuk memuat ulang data demo
Sekolah Bola dengan aturan terbaru (tanpa jersey, aset dari pengeluaran): `npm run db:seed:demo -- --reset`.

## 10. Pemeriksaan otomatis

- `npm run test:finance` — rumus, validasi, grid RAB Actual, kepemilikan (tanpa database)
- `npm run test:access` — peran, menu, navigasi (tanpa database)
- `npm run test:records` — aturan di lapisan database (RAB terkunci, aset otomatis, biaya actual, registrasi mencakup
  bulannya, kelompok umur, pemasukan lain, akses bukti, akses antar unit). **Butuh database**: membuat dua unit sementara berkode `ZZTEST-…` dan menghapusnya lagi.

## 11. Belum ada / ide lanjutan

Unduh Excel sesuai format formulir · impor dari Excel · tombol hapus unit di aplikasi · target dividen yang bisa diubah dari
layar (saat ini konstanta `DIVIDEND_TARGET`) · pengingat iuran belum bayar · grafik dividen per bulan di Ringkasan Owner ·
nilai aset dari RAB mengikuti biaya actual (saat ini mengikuti budget RAB) · hapus tabel lama `fin_dividends`.
