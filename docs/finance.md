# Keuangan — panduan

Website monitoring keuangan untuk unit bisnis. Spesifikasi awal: sampai 10 unit bisnis; setiap unit punya login sendiri
dan hanya melihat/mengisi datanya sendiri; Owner melihat semuanya; setiap data punya statistik/grafik; ada halaman
ringkasan per unit.

## 1. Jenis unit dan menunya

Unit bisnis ada dua jenis, dengan menu berbeda (`lib/finance/unit-types.ts` adalah satu-satunya tempat yang menentukan):

| Jenis | Menu | Isi |
|---|---|---|
| **Liga** | Aset | pembelian peralatan/sarana (tanggal, nama, nominal, struk) |
| | Dividen | rumus dividen + catatan pembagian ke pemodal |
| | Modal | uang yang disetor pemodal, sudah/belum kembali |
| | Match Fee | uang masuk per klub per minggu (laga × tarif) |
| | Registrasi | uang masuk per klub: biaya, DP, pelunasan |
| | RAB | rencana anggaran biaya (mingguan × lama program + bulanan) |
| **Sekolah Bola** | Pemasukan | daftar siswa + pembayaran (registrasi, jersey, iuran bulanan) |
| | Pengeluaran | laporan pengeluaran sekolah |

Jenis dipilih saat unit dibuat dan **tidak bisa diubah** setelahnya, karena data dan menunya berbeda. Satu jenis data tidak
bisa disimpan di jenis unit yang salah (ditolak di server, bukan hanya disembunyikan di menu).

## 2. Rumus

| Angka | Rumus |
|---|---|
| **Dividen Liga** | RAB − (uang modal + uang masuk registrasi + uang masuk match fee) |
| **Dividen Sekolah Bola** | pemasukan − pengeluaran, **per bulan**; akumulasi = jumlah semua bulan |
| **Akumulasi dividen Owner** | Σ dividen unit Liga + Σ dividen unit Sekolah Bola |
| **Progres target** | akumulasi ÷ Rp 3.000.000.000 (akumulasi negatif dihitung 0%; bisa melebihi 100%) |

Rincian:

- *RAB* = biaya mingguan × `programWeeks` unit + biaya bulanan (dihitung sekali). *Uang modal* = semua modal yang disetor.
  *Registrasi* = DP + pelunasan yang sudah **diterima**. *Match fee* = laga × tarif per laga.
- Sekolah Bola memakai dasar kas: pembayaran dihitung di bulan **tanggal dibayar**, pengeluaran di bulan **tanggal pengeluaran**.
  Bulan yang hanya punya pengeluaran menghasilkan dividen negatif. **Diskon tidak mengurangi pemasukan** — pemasukan adalah uang
  yang benar-benar diterima; diskon hanya dicatat sebagai informasi.
- Hasil Dividen Liga bisa **negatif** bila modal + registrasi + match fee melebihi RAB.

## 3. Pemasukan Sekolah Bola (dari formulir “SEKOLAH BOLA”)

Formulir Excel punya satu baris per anak dengan kolom: Nama Anak, Tgl Bergabung, Uang/Bukti/Diskon Registrasi,
Uang/Bukti Pembelian Jersey, Uang/Bukti/Diskon Pembayaran Bulanan, No Punggung, Nama Panggilan, Tanggal Lahir.
Di aplikasi data itu dipecah menjadi dua tabel supaya iuran bulanan bisa dicatat setiap bulan:

- `fin_students` — identitas anak (nama, nama panggilan, tgl bergabung, tgl lahir, no punggung)
- `fin_student_payments` — satu baris per pembayaran: jenis (`registration` / `jersey` / `monthly`), tanggal, uang, diskon,
  bulan yang dibayar (khusus bulanan, `YYYY-MM`), bukti. Aturan: satu registrasi per siswa, satu iuran per siswa per bulan,
  jersey boleh berkali-kali dan tanpa diskon.

Tab **Siswa** menampilkan satu baris per anak (seperti baris Excel) dengan ringkasan pembayarannya dan tombol **Bayar**;
tab **Pembayaran** menampilkan semua pembayaran, bisa difilter per jenis.

## 4. Pengeluaran Sekolah Bola

Tabel `fin_expenses`: tanggal, kategori, keterangan, nominal, bukti, catatan. **Kolom ini dibuat generik** karena file
“LAPORAN PENGELUARAN SEKOLAH BOLA” belum tersedia saat dibangun — sesuaikan setelah melihat kolom aslinya.

## 5. Peran dan akses

| | Owner | Admin Unit Bisnis |
|---|---|---|
| Melihat unit | semua | hanya unitnya |
| Menambah / mengubah data | semua unit | hanya unitnya |
| Menghapus data | ya | tidak |
| Membuat unit dan akun login | ya | tidak |
| Ringkasan Owner, Jejak Audit | ya | tidak |

Akses dijaga **di server**: alamat unit lain, halaman Owner, dan jenis menu yang tidak dimiliki unit itu ditolak (dialihkan
dengan pemberitahuan, atau 404). Bukti pembayaran hanya bisa dibuka oleh pemilik unitnya atau Owner. Setiap perubahan
tercatat di Jejak Audit.

## 6. Data demo

`npm run db:seed:demo` membuat dua unit contoh agar semua layar terisi:

- **Liga Demo** (`LIGA-DEMO`): angka asli dari enam workbook awal (ASET, DEVIDEN, MODAL, UANG MASUK MATCH FEE, UANG MASUK
  REGISTRASI, RAB). `npm run test:finance` mencocokkannya dengan total yang dihitung Excel (aset 5,3 jt · modal 60 jt ·
  registrasi ditagih 17,5 jt / diterima 7,5 jt · 52 laga / 26 jt match fee · RAB 265,2 jt) → dividen rumus Rp 171.700.000.
- **Sekolah Bola Demo** (`SB-DEMO`): data **karangan** (8 siswa “Siswa Contoh”, pembayaran Agu–Okt 2026, 10 pengeluaran).

Hapus keduanya dengan `npm run db:seed:demo -- --remove` sebelum memakai data sungguhan.

## 7. Belum ada / ide lanjutan

Unduh Excel sesuai format formulir · impor dari Excel · tombol hapus unit di aplikasi · target dividen yang bisa diubah dari
layar (saat ini konstanta `DIVIDEND_TARGET`) · pengingat iuran belum bayar · grafik dividen per bulan di Ringkasan Owner.
