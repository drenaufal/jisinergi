# Keuangan — panduan

Website monitoring keuangan untuk unit bisnis. Spesifikasi awal: sampai 10 unit bisnis; setiap unit punya login sendiri
dan hanya melihat/mengisi datanya sendiri; Owner melihat semuanya; setiap data punya statistik/grafik; ada halaman
ringkasan per unit.

## 1. Jenis unit dan menunya

Unit bisnis ada dua jenis, dengan menu berbeda (`lib/finance/unit-types.ts` adalah satu-satunya tempat yang menentukan):

| Jenis | Menu | Isi |
|---|---|---|
| **Liga** | Aset | pembelian peralatan/sarana (tanggal, nama, nominal, struk); terisi otomatis dari biaya RAB Actual pada baris RAB bertanda Aset |
| | Dividen | rumus dividen + pembagian ke pemilik dalam persen + penanda sudah diambil (baru setelah event liga selesai) |
| | Modal | uang yang disetor pemodal, sudah/belum kembali |
| | Match Fee | uang masuk per klub per minggu (laga × tarif), per kelompok umur bila ada; di bawahnya **Pemasukan lain** (sewa stand, tiket parkir) per minggu |
| | Registrasi | uang masuk per klub (dan kelompok umur): biaya, DP, pelunasan, bukti transfer |
| | RAB Budget | rencana anggaran biaya (mingguan × lama program + bulanan); baris yang disimpan **tidak bisa diubah** |
| | RAB Actual | biaya yang benar-benar keluar, per keterangan biaya dan per minggu; bagian mingguan dan bulanan terpisah; bisa diunggah dari Excel |
| **Sekolah Bola** | Pemasukan | daftar siswa + pembayaran (registrasi, iuran bulanan) |
| | Pengeluaran | laporan pengeluaran sekolah, ditandai Aset / Non aset |
| | Laporan Keuangan | uang masuk dan keluar dalam satu daftar seperti lembar “Laporan Keuangan” di Excel: saldo awal, total masuk, total keluar, sisa saldo (hanya baca) |
| | Aset | peralatan dan sarana (juga terisi otomatis dari pengeluaran bertanda Aset) |
| | Modal | uang yang disetor pemilik |
| | Dividen | sisa saldo, pembagian ke pemilik dalam persen, dan uang yang sudah diambil tiap pemilik |

Setiap unit bisa punya **logo** (diunggah saat unit dibuat atau lewat *Ubah unit*; JPG/PNG/WEBP/GIF, maks 5 MB). Logo tampil di menu samping dan di
Kelola Unit Bisnis; tanpa logo, yang tampil huruf pertama nama unit. Formulir unit dan semua pop-up lainnya **bisa digulir**: judulnya tetap di atas,
isinya yang bergulir, dan tombol simpan selalu terlihat di bawah.

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
- **Pengambilan dividen.** Tabel pemilik punya kolom **Ambil** (uang bagian dividen yang sudah diambil) dan **Dividen final** (= bagian dividen − diambil, yaitu
  yang belum diambil). Hanya **Owner** yang bisa mengisinya (sama seperti persentase). Jumlah yang diambil disimpan per pemilik
  (`fin_unit_owners.taken_amount`); mengubah persentase pemilik tidak menghapusnya, dan pemilik yang sudah mengambil uang tidak bisa dihapus.
  - **Sekolah Bola**: kolom Ambil diisi manual (0 sampai bagian dividen pemilik itu) dan ada kotak centang **Ambil semua** per pemilik serta di judul kolom.
  - **Liga**: hanya **semua atau tidak** — satu kotak centang “Sudah diambil” per pemilik, dan tanda “Sudah diambil” tampil di samping namanya.
- **Dividen Liga baru terbentuk saat event liga selesai.** Owner menekan *Tandai liga selesai* di halaman Dividen (`business_units.league_finished_on`).
  Sebelum itu angka dividen hanya perkiraan: tidak bisa diambil dan dihitung **0** di Ringkasan Owner. *Buka kembali* hanya bisa selama belum ada yang mengambil.
- Pencatatan dividen lama berbasis nominal (`fin_dividends`) sudah tidak dipakai. Migrasi `0001` menyalinnya menjadi
  pemilik + persentase; tabelnya dibiarkan (tidak dihapus) sampai datanya tidak dibutuhkan lagi.

## 3. Rumus

| Angka | Rumus |
|---|---|
| **Dividen Liga** | (uang modal + uang masuk registrasi + uang masuk match fee) − **RAB Actual** |
| **Dividen Sekolah Bola** = **sisa saldo** | pemasukan − pengeluaran, **per bulan**; akumulasi = jumlah semua bulan |
| **Dividen final unit** | dividen unit − yang sudah diambil pemilik. Unit Liga yang event-nya belum selesai = 0 |
| **Akumulasi dividen Owner** | Σ dividen final unit Liga + Σ dividen final unit Sekolah Bola (yang belum diambil; yang sudah diambil tampil terpisah sebagai “Sudah diambil”) |
| **Progres target** | akumulasi (dividen final) ÷ Rp 3.000.000.000 (akumulasi negatif dihitung 0%; bisa melebihi 100%) |
| **Akumulasi modal Owner** | Σ modal semua unit, Liga dan Sekolah Bola (tampil di Ringkasan Owner, dengan tabel modal per unit) |
| **Akumulasi aset Owner** | Σ aset semua unit, Liga dan Sekolah Bola |
| **Sisa saldo Laporan Keuangan** (Sekolah Bola) | saldo awal (modal) + total masuk − total keluar |

Rincian:

- *RAB Actual* = jumlah semua biaya actual yang tercatat di menu RAB Actual, termasuk baris di luar RAB Budget. *Uang modal* = semua
  modal yang disetor. *Registrasi* = DP + pelunasan yang sudah **diterima**. *Match fee* = laga × tarif per laga.
  *RAB Budget* (estimasi OPEX = biaya mingguan × `programWeeks` unit + biaya bulanan) tetap tampil di menunya, tetapi **tidak lagi
  dipakai di rumus dividen**.
- Sekolah Bola memakai dasar kas: pembayaran dihitung di bulan **tanggal dibayar**, pengeluaran di bulan **tanggal pengeluaran**.
  Bulan yang hanya punya pengeluaran menghasilkan sisa saldo negatif. **Diskon tidak mengurangi pemasukan** — pemasukan adalah
  uang yang benar-benar diterima; diskon hanya dicatat sebagai informasi.
- **Modal Sekolah Bola tidak mengubah dividen** (rumus dari spesifikasi hanya pemasukan − pengeluaran); modal dan aset
  ditampilkan sendiri. Hanya **Sisa Saldo di Laporan Keuangan** yang dimulai dari saldo awal, seperti lembar Excel-nya — halaman itu
  mencantumkan perbedaan ini.
- Hasil Dividen Liga bisa **negatif** bila RAB Actual melebihi modal + registrasi + match fee.

## 4. RAB Budget dan aset

- Baris RAB yang sudah disimpan **tidak bisa diubah lagi** (tidak ada tombol ubah; server menolaknya). Menambah baris
  tetap bisa. Hanya Owner yang bisa menghapus baris, dan tidak bisa bila baris itu sudah punya biaya actual.
- Setiap baris RAB dipilih **Aset** atau **Non aset** (radio). Baris Aset **belum** membuat aset. Aset baru terisi saat barangnya **benar-benar dibeli**:
  setiap biaya RAB Actual pada baris bertanda Aset otomatis menjadi satu baris di menu Aset (nama = baris RAB, nominal = uang yang dibayar,
  tanggal = tanggal biaya, bukti sama). Mengubah atau menghapus biaya itu ikut mengubah/menghapus asetnya; aset hasil otomatis tidak bisa
  diubah/dihapus sendiri. Biaya pada baris Non aset, atau di luar RAB, tidak membuat aset.
- Header kolom RAB: *No · Keterangan biaya · **Jumlah Satuan** · Harga satuan · Total*. **Kategori bisa dilipat/dibuka** (klik nama kategori, atau
  *Buka semua / Ciutkan semua*). Di layar HP tiap baris tampil sebagai kartu bertumpuk, bukan tabel lebar.
- Sekolah Bola: pengeluaran juga dipilih Aset / Non aset. Pengeluaran Aset membuat satu baris di Aset (nama, nominal,
  tanggal, dan struk sama); mengubah pengeluaran ikut mengubah asetnya, mengganti ke Non aset atau menghapusnya
  menghapus aset itu.

## 5. RAB Actual (Liga)

RAB Actual adalah pengurang di rumus dividen Liga: totalnya (semua biaya actual) muncul sebagai baris “RAB Actual” di Dividen, Ringkasan unit, dan Ringkasan Owner.

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
- **Unggah Excel** (tombol di kepala halaman): unggah file seperti “file RAB Actual.xlsx” (RAB di kiri, Week 1… di kanan). File dibaca dan diperiksa dulu
  (pratinjau: berapa baris RAB baru, berapa biaya, total yang tertulis di sheet harus cocok), baru disimpan setelah *Simpan ke RAB Actual*.
  Baris RAB yang sudah ada di unit dipakai ulang (nama dicocokkan tanpa memandang huruf besar/kecil), hanya yang belum ada yang dibuat. Biaya
  bertanggal hari pertama minggunya; bila unit belum punya tanggal mulai program, tanggal minggu 1 diisi di formulir unggah dan disimpan sebagai
  tanggal mulai program. Biaya yang sama (baris, tanggal, nominal) yang sudah tercatat dilewati, jadi mengunggah file yang sama dua kali tidak
  menggandakan. Biaya pada baris bertanda Aset otomatis masuk ke menu Aset. Aturannya ada di `lib/finance/excel/rab-actual-plan.ts`.
- Kategori dilipat/dibuka seperti di RAB Budget; di HP tiap keterangan biaya menjadi kartu (budget, actual, sisa, dan minggu yang punya biaya).
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

- `fin_students` — identitas anak (nama, nama panggilan, tgl bergabung, **tgl lahir (kolom sendiri di tab Siswa)**, no punggung) dan,
  dari sheet DATABASE SSB Ganador: **NIK** (nomor induk siswa, mis. GDJ001), tempat lahir, no telepon orang tua, ukuran jersey dan
  tipe ukuran. Semuanya opsional.
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

Tabel `fin_expenses`: tanggal, kategori, keterangan, nominal, **Aset/Non aset**, bukti, catatan, dan untuk baris gaji **absen**
(hari hadir) serta **gaji satuan** (gaji per hari; opsional, hanya informasi — nominal tetap yang dibayarkan). **Kolom ini dibuat
generik** karena file “LAPORAN PENGELUARAN SEKOLAH BOLA” ternyata berisi data Liga; sheet “Laporan Keuangan” SSB Ganador adalah contoh
pertama pengeluaran sekolah yang sesungguhnya.

## 7b. Laporan Keuangan (Sekolah Bola)

Halaman hanya-baca `/u/<kode>/laporan-keuangan` yang menampilkan lembar “LAPORAN KEUANGAN” seperti di Excel: judul, **Saldo Awal**,
**Total Masuk / Total Keluar / Sisa Saldo**, lalu tabel *No · Date · Note · Absen · Gaji Satuan · Cash In · Cash Out*.

- Semuanya dibaca dari menu lain, tidak ada yang diketik di sini: Cash In = pembayaran siswa (Pemasukan; Note = nama siswa),
  Cash Out = Pengeluaran, Saldo Awal = total Modal unit.
- Urutan: tanggal terlama dulu; baris pada hari yang sama mengikuti urutan input. Nomor dihitung ulang dari urutan itu, jadi bisa
  berbeda dari kolom No di Excel (Excel menaruh gaji bulan April–Mei di bawah baris Agustus–September).
- Sisa Saldo = Saldo Awal + Total Masuk − Total Keluar. Ini **bukan** angka Dividen: dividen Sekolah Bola tidak memasukkan modal.
  Logikanya ada di `financialReport` (`lib/finance/calc.ts`).

## 8. Peran dan akses

| | Owner | Admin Unit Bisnis |
|---|---|---|
| Melihat unit | semua | hanya unitnya |
| Menambah / mengubah data | semua unit | hanya unitnya (kecuali RAB yang terkunci dan aset otomatis) |
| Menghapus data | ya | tidak |
| Membuat unit, akun login, mengubah persentase dividen, mengisi dividen yang diambil, menandai liga selesai | ya | tidak |
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

**Impor SSB Ganador** — `npm run db:import:ganador` memuat “LAPORAN KEUANGAN & DATABASE SSB GANADOR.xlsx” (dua sheet) sebagai satu unit
Sekolah Bola `SB-GANADOR`:

| Sheet / kolom | Masuk ke |
|---|---|
| LAPORAN KEUANGAN · Saldo Awal | **Modal** (satu baris, pemodal “Saldo awal” — Excel tidak menyebut nama; ganti bila perlu) |
| LAPORAN KEUANGAN · Cash In | **Pemasukan**: pembayaran siswa (registrasi atau iuran bulanan), tanggal sesuai Date |
| LAPORAN KEUANGAN · Cash Out, absen, gaji satuan | **Pengeluaran** (kategori dibaca dari keterangan: Gaji / Sewa lapangan / Perlengkapan / Operasional; semua Non aset) |
| DATABASE · identitas siswa | **Siswa** (NIK, nama, panggilan, tempat/tgl lahir, telepon orang tua, ukuran jersey) |
| DATABASE · Registrasi − Jersey = Total | pembayaran registrasi senilai Total; uang jersey tidak dihitung sebagai pemasukan (rinciannya di catatan pembayaran) |

Kedua sheet menceritakan uang yang sama dari dua sisi, jadi importer **mencocokkannya**: setiap Cash In harus punya sel bulan yang sama
di DATABASE (nama, bulan, nominal) dan sebaliknya, lalu semua total yang tertulis di sheet (Total Masuk, Total Keluar, Sisa Saldo, Grand
Total per siswa dan per bulan) harus sama dengan hasil bacaan. Bila ada yang berbeda, **tidak ada yang ditulis**. Pilihan: `--file`,
`--dry-run`, `--reset`, `--remove`. Hal yang perlu dicek manusia dicetak sebagai peringatan (siswa tanpa tanggal bergabung, tahun
bergabung yang mungkin salah ketik, ejaan nama yang berbeda).

Hapus data demo dengan `npm run db:seed:demo -- --remove` sebelum memakai data sungguhan. Untuk memuat ulang data demo
Sekolah Bola dengan aturan terbaru (tanpa jersey, aset dari pengeluaran): `npm run db:seed:demo -- --reset`.

## 10. Pemeriksaan otomatis

- `npm run test:finance` — rumus, validasi, grid RAB Actual, kepemilikan (tanpa database)
- `npm run test:access` — peran, menu, navigasi (tanpa database)
- `npm run test:records` — aturan di lapisan database (RAB terkunci, aset otomatis, biaya actual, registrasi mencakup
  bulannya, kelompok umur, pemasukan lain, akses bukti, akses antar unit). **Butuh database**: membuat dua unit sementara berkode `ZZTEST-…` dan menghapusnya lagi.

## 11. Belum ada / ide lanjutan

Unduh Excel sesuai format formulir · tombol hapus unit di aplikasi · target dividen yang bisa diubah dari
layar (saat ini konstanta `DIVIDEND_TARGET`) · pengingat iuran belum bayar · grafik dividen per bulan di Ringkasan Owner ·
hapus tabel lama `fin_dividends`.
