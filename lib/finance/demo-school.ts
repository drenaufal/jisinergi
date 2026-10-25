/**
 * Demo data for a Sekolah Bola unit. It is invented (the "SEKOLAH BOLA" workbook is an empty template), with obviously
 * generic names, so every screen has something to show. Delete the demo unit in the app once real data goes in.
 */

export type DemoStudent = { name: string; nickname: string | null; joinedOn: string; birthDate: string; jerseyNumber: number };

export const DEMO_STUDENTS: DemoStudent[] = [
  { name: "Siswa Contoh 01", nickname: "Si Satu", joinedOn: "2026-08-03", birthDate: "2014-02-11", jerseyNumber: 1 },
  { name: "Siswa Contoh 02", nickname: null, joinedOn: "2026-08-03", birthDate: "2014-05-30", jerseyNumber: 2 },
  { name: "Siswa Contoh 03", nickname: "Si Tiga", joinedOn: "2026-08-10", birthDate: "2013-11-02", jerseyNumber: 3 },
  { name: "Siswa Contoh 04", nickname: null, joinedOn: "2026-08-10", birthDate: "2015-01-19", jerseyNumber: 4 },
  { name: "Siswa Contoh 05", nickname: null, joinedOn: "2026-08-17", birthDate: "2014-09-07", jerseyNumber: 5 },
  { name: "Siswa Contoh 06", nickname: "Si Enam", joinedOn: "2026-09-01", birthDate: "2013-07-25", jerseyNumber: 6 },
  { name: "Siswa Contoh 07", nickname: null, joinedOn: "2026-09-01", birthDate: "2015-03-14", jerseyNumber: 7 },
  { name: "Siswa Contoh 08", nickname: null, joinedOn: "2026-09-14", birthDate: "2014-12-01", jerseyNumber: 8 },
];

export const DEMO_REGISTRATION_FEE = 500_000;
export const DEMO_JERSEY_PRICE = 250_000;
export const DEMO_MONTHLY_FEE = 200_000;

/** Which months each student paid (index = student). October is deliberately incomplete so "belum bayar" shows. */
export const DEMO_MONTHLY_PAID: string[][] = [
  ["2026-08", "2026-09", "2026-10"],
  ["2026-08", "2026-09", "2026-10"],
  ["2026-08", "2026-09"],
  ["2026-08", "2026-09", "2026-10"],
  ["2026-08", "2026-09"],
  ["2026-09", "2026-10"],
  ["2026-09"],
  ["2026-09", "2026-10"],
];

/** Students who got a discount on registration (index → Rupiah) and on a monthly fee (index → Rupiah per month). */
export const DEMO_REGISTRATION_DISCOUNT: Record<number, number> = { 1: 100_000, 4: 250_000 };
export const DEMO_MONTHLY_DISCOUNT: Record<number, number> = { 3: 50_000 };

export const DEMO_EXPENSES: { spentOn: string; category: string; name: string; amount: number }[] = [
  { spentOn: "2026-08-02", category: "Sewa lapangan", name: "Sewa lapangan Agustus", amount: 600_000 },
  { spentOn: "2026-08-05", category: "Perlengkapan", name: "Bola latihan (5 buah)", amount: 750_000 },
  { spentOn: "2026-08-05", category: "Perlengkapan", name: "Cones dan rompi latihan", amount: 380_000 },
  { spentOn: "2026-08-31", category: "Honor pelatih", name: "Honor pelatih Agustus", amount: 1_200_000 },
  { spentOn: "2026-09-02", category: "Sewa lapangan", name: "Sewa lapangan September", amount: 600_000 },
  { spentOn: "2026-09-12", category: "Konsumsi", name: "Air minum dan snack latihan", amount: 145_000 },
  { spentOn: "2026-09-30", category: "Honor pelatih", name: "Honor pelatih September", amount: 1_200_000 },
  { spentOn: "2026-10-02", category: "Sewa lapangan", name: "Sewa lapangan Oktober", amount: 600_000 },
  { spentOn: "2026-10-11", category: "Konsumsi", name: "Air minum dan snack latihan", amount: 160_000 },
  { spentOn: "2026-10-20", category: "Perlengkapan", name: "Kotak P3K", amount: 120_000 },
];
