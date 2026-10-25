/**
 * Demo data for a Liga unit, transcribed by script from the six original workbooks
 * (ASET, DEVIDEN, MODAL, UANG MASUK MATCH FEE, UANG MASUK REGISTRASI, RAB).
 * Amounts are exactly the workbook values (Rupiah). Only labels were tidied: typos fixed and the
 * "@price" suffix dropped from RAB item names because the unit price has its own column now.
 * It is loaded into ONE unit (see lib/finance/seed.ts) — the workbooks never had a unit column.
 */

export const SEED_ASSETS: { purchasedOn: string; name: string; amount: number }[] = [
  { purchasedOn: "2026-10-04", name: "Dispenser Minum", amount: 1000000 },
  { purchasedOn: "2026-10-07", name: "Sound Sistem", amount: 2000000 },
  { purchasedOn: "2026-10-07", name: "HT", amount: 900000 },
  { purchasedOn: "2026-10-13", name: "Meja Lipat Outdoor", amount: 900000 },
  { purchasedOn: "2026-10-14", name: "Cooler Box", amount: 500000 },
];

export const SEED_CAPITAL: { owner: string; amount: number; status: "outstanding" | "returned" }[] = [
  { owner: "A", amount: 50000000, status: "returned" },
  { owner: "B", amount: 10000000, status: "outstanding" },
];

/** Dividend recipients: the two capital owners (A and B). */
export const SEED_DIVIDENDS: { recipient: string; amount: number }[] = [
  { recipient: "A", amount: 70000000 },
  { recipient: "B", amount: 30000000 },
];

/** `fee` is the registration fee billed; `dp` and `final` are what the club has paid so far. */
export const SEED_REGISTRATIONS: { club: string; fee: number; dp: number; final: number }[] = [
  { club: "CYSSS", fee: 1750000, dp: 750000, final: 0 },
  { club: "Maesa", fee: 1750000, dp: 750000, final: 0 },
  { club: "Kukusan", fee: 1750000, dp: 750000, final: 0 },
  { club: "Rindam", fee: 1750000, dp: 750000, final: 0 },
  { club: "Bogor", fee: 1750000, dp: 750000, final: 0 },
  { club: "CTYM", fee: 1750000, dp: 750000, final: 0 },
  { club: "Madura", fee: 1750000, dp: 750000, final: 0 },
  { club: "Ranco", fee: 1750000, dp: 750000, final: 0 },
  { club: "Ganesa", fee: 1750000, dp: 750000, final: 0 },
  { club: "PKNS", fee: 1750000, dp: 750000, final: 0 },
];

/** Only the weeks that have been played; the workbook leaves weeks 4–10 empty. */
export const SEED_MATCH_FEES: { club: string; week: number; matches: number; fee: number }[] = [
  { club: "CYSSS", week: 1, matches: 2, fee: 500000 },
  { club: "CYSSS", week: 2, matches: 1, fee: 500000 },
  { club: "CYSSS", week: 3, matches: 2, fee: 500000 },
  { club: "Maesa", week: 1, matches: 1, fee: 500000 },
  { club: "Maesa", week: 2, matches: 2, fee: 500000 },
  { club: "Maesa", week: 3, matches: 2, fee: 500000 },
  { club: "Kukusan", week: 1, matches: 2, fee: 500000 },
  { club: "Kukusan", week: 2, matches: 1, fee: 500000 },
  { club: "Kukusan", week: 3, matches: 2, fee: 500000 },
  { club: "Rindam", week: 1, matches: 2, fee: 500000 },
  { club: "Rindam", week: 2, matches: 2, fee: 500000 },
  { club: "Rindam", week: 3, matches: 2, fee: 500000 },
  { club: "Bogor", week: 1, matches: 1, fee: 500000 },
  { club: "Bogor", week: 2, matches: 2, fee: 500000 },
  { club: "Bogor", week: 3, matches: 2, fee: 500000 },
  { club: "CTYM", week: 1, matches: 2, fee: 500000 },
  { club: "CTYM", week: 2, matches: 1, fee: 500000 },
  { club: "CTYM", week: 3, matches: 1, fee: 500000 },
  { club: "Madura", week: 1, matches: 2, fee: 500000 },
  { club: "Madura", week: 2, matches: 1, fee: 500000 },
  { club: "Madura", week: 3, matches: 1, fee: 500000 },
  { club: "Ranco", week: 1, matches: 2, fee: 500000 },
  { club: "Ranco", week: 2, matches: 2, fee: 500000 },
  { club: "Ranco", week: 3, matches: 2, fee: 500000 },
  { club: "Ganesa", week: 1, matches: 2, fee: 500000 },
  { club: "Ganesa", week: 2, matches: 2, fee: 500000 },
  { club: "Ganesa", week: 3, matches: 2, fee: 500000 },
  { club: "PKNS", week: 1, matches: 2, fee: 500000 },
  { club: "PKNS", week: 2, matches: 2, fee: 500000 },
  { club: "PKNS", week: 3, matches: 2, fee: 500000 },
];

export const SEED_BUDGET: {
  period: "weekly" | "monthly";
  category: string;
  categoryOrder: number;
  name: string;
  itemOrder: number;
  quantity: number;
  unitPrice: number;
}[] = [
  { period: "weekly", category: "Biaya Peralatan & Sarana Pertandingan", categoryOrder: 1, name: "Sewa Lapangan", itemOrder: 1, quantity: 1, unitPrice: 4686000 },
  { period: "weekly", category: "Biaya Peralatan & Sarana Pertandingan", categoryOrder: 1, name: "Penyewaan TV", itemOrder: 2, quantity: 1, unitPrice: 0 },
  { period: "weekly", category: "Biaya Wasit", categoryOrder: 2, name: "Honorium Wasit dan Hakim Garis", itemOrder: 1, quantity: 1, unitPrice: 1400000 },
  { period: "weekly", category: "Biaya Panitia", categoryOrder: 3, name: "Beckan", itemOrder: 1, quantity: 1, unitPrice: 1000000 },
  { period: "weekly", category: "Biaya Panitia", categoryOrder: 3, name: "Aglar", itemOrder: 2, quantity: 1, unitPrice: 2000000 },
  { period: "weekly", category: "Biaya Panitia", categoryOrder: 3, name: "Iqbal", itemOrder: 3, quantity: 1, unitPrice: 2000000 },
  { period: "weekly", category: "Biaya Panitia", categoryOrder: 3, name: "Ketua Panitia", itemOrder: 4, quantity: 1, unitPrice: 800000 },
  { period: "weekly", category: "Biaya Panitia", categoryOrder: 3, name: "Pembantu Umum", itemOrder: 5, quantity: 1, unitPrice: 150000 },
  { period: "weekly", category: "Biaya Panitia", categoryOrder: 3, name: "Talent Scouting", itemOrder: 6, quantity: 1, unitPrice: 250000 },
  { period: "weekly", category: "Biaya Panitia", categoryOrder: 3, name: "Ball Boy 1", itemOrder: 7, quantity: 1, unitPrice: 100000 },
  { period: "weekly", category: "Biaya Panitia", categoryOrder: 3, name: "Ball Boy 2", itemOrder: 8, quantity: 1, unitPrice: 100000 },
  { period: "weekly", category: "Biaya Panitia", categoryOrder: 3, name: "Runner 1", itemOrder: 9, quantity: 1, unitPrice: 150000 },
  { period: "weekly", category: "Biaya Panitia", categoryOrder: 3, name: "Runner 2", itemOrder: 10, quantity: 1, unitPrice: 150000 },
  { period: "weekly", category: "Biaya Panitia", categoryOrder: 3, name: "DSP 1", itemOrder: 11, quantity: 1, unitPrice: 150000 },
  { period: "weekly", category: "Biaya Panitia", categoryOrder: 3, name: "DSP 2", itemOrder: 12, quantity: 1, unitPrice: 150000 },
  { period: "weekly", category: "Biaya Panitia", categoryOrder: 3, name: "Tim Website & Match Reports 1", itemOrder: 13, quantity: 1, unitPrice: 400000 },
  { period: "weekly", category: "Biaya Panitia", categoryOrder: 3, name: "Tim Website & Match Reports 2", itemOrder: 14, quantity: 1, unitPrice: 400000 },
  { period: "weekly", category: "Biaya Panitia", categoryOrder: 3, name: "Tim Website & Match Reports 3", itemOrder: 15, quantity: 1, unitPrice: 400000 },
  { period: "weekly", category: "Biaya Panitia", categoryOrder: 3, name: "Tim Website & Match Reports 4", itemOrder: 16, quantity: 1, unitPrice: 400000 },
  { period: "weekly", category: "Biaya Panitia", categoryOrder: 3, name: "Logistik", itemOrder: 17, quantity: 1, unitPrice: 100000 },
  { period: "weekly", category: "Biaya Panitia", categoryOrder: 3, name: "Logistik", itemOrder: 18, quantity: 1, unitPrice: 100000 },
  { period: "weekly", category: "Biaya Panitia", categoryOrder: 3, name: "Medsos", itemOrder: 19, quantity: 1, unitPrice: 500000 },
  { period: "weekly", category: "Biaya Panitia", categoryOrder: 3, name: "Finance", itemOrder: 20, quantity: 1, unitPrice: 900000 },
  { period: "weekly", category: "Biaya Panitia", categoryOrder: 3, name: "Awak Tandu 1", itemOrder: 21, quantity: 1, unitPrice: 100000 },
  { period: "weekly", category: "Biaya Panitia", categoryOrder: 3, name: "Awak Tandu 2", itemOrder: 22, quantity: 1, unitPrice: 100000 },
  { period: "weekly", category: "Biaya Konsumsi", categoryOrder: 4, name: "Makan", itemOrder: 1, quantity: 40, unitPrice: 20000 },
  { period: "weekly", category: "Biaya Konsumsi", categoryOrder: 4, name: "Galon Aqua Peserta", itemOrder: 2, quantity: 20, unitPrice: 20000 },
  { period: "weekly", category: "Biaya Konsumsi", categoryOrder: 4, name: "Sarapan Panitia", itemOrder: 3, quantity: 3, unitPrice: 50000 },
  { period: "weekly", category: "Biaya Konsumsi", categoryOrder: 4, name: "Air Mineral Panitia", itemOrder: 4, quantity: 5, unitPrice: 20000 },
  { period: "weekly", category: "Biaya Konsumsi", categoryOrder: 4, name: "Es Batu Peserta & Panitia", itemOrder: 5, quantity: 10, unitPrice: 25000 },
  { period: "weekly", category: "Biaya Keamanan", categoryOrder: 5, name: "Keamanan Internal", itemOrder: 1, quantity: 0, unitPrice: 0 },
  { period: "weekly", category: "Biaya Keamanan", categoryOrder: 5, name: "Izin Pertandingan / Babinsa 1", itemOrder: 2, quantity: 1, unitPrice: 200000 },
  { period: "weekly", category: "Biaya Keamanan", categoryOrder: 5, name: "Izin Pertandingan / Babinsa 2", itemOrder: 3, quantity: 1, unitPrice: 200000 },
  { period: "weekly", category: "Biaya Medis", categoryOrder: 6, name: "Tim Medis 1", itemOrder: 1, quantity: 1, unitPrice: 350000 },
  { period: "weekly", category: "Biaya Medis", categoryOrder: 6, name: "Tim Medis 2", itemOrder: 2, quantity: 1, unitPrice: 350000 },
  { period: "weekly", category: "Biaya Medis", categoryOrder: 6, name: "Ambulance", itemOrder: 3, quantity: 1, unitPrice: 800000 },
  { period: "weekly", category: "Biaya Live Streaming", categoryOrder: 7, name: "Jasa Live", itemOrder: 1, quantity: 1, unitPrice: 1430000 },
  { period: "weekly", category: "Biaya Live Streaming", categoryOrder: 7, name: "FG 1", itemOrder: 2, quantity: 1, unitPrice: 550000 },
  { period: "weekly", category: "Biaya Live Streaming", categoryOrder: 7, name: "FG 2", itemOrder: 3, quantity: 1, unitPrice: 550000 },
  { period: "monthly", category: "Biaya Peralatan & Sarana Pertandingan", categoryOrder: 1, name: "Pembelian Gawang", itemOrder: 1, quantity: 0, unitPrice: 0 },
  { period: "monthly", category: "Biaya Peralatan & Sarana Pertandingan", categoryOrder: 1, name: "Dispenser Minum", itemOrder: 2, quantity: 1, unitPrice: 1000000 },
  { period: "monthly", category: "Biaya Peralatan & Sarana Pertandingan", categoryOrder: 1, name: "Sound Sistem", itemOrder: 3, quantity: 1, unitPrice: 2000000 },
  { period: "monthly", category: "Biaya Peralatan & Sarana Pertandingan", categoryOrder: 1, name: "Lakban", itemOrder: 4, quantity: 4, unitPrice: 50000 },
  { period: "monthly", category: "Biaya Peralatan & Sarana Pertandingan", categoryOrder: 1, name: "HT", itemOrder: 5, quantity: 5, unitPrice: 180000 },
  { period: "monthly", category: "Biaya Peralatan & Sarana Pertandingan", categoryOrder: 1, name: "Perlengkapan Medis", itemOrder: 6, quantity: 1, unitPrice: 300000 },
  { period: "monthly", category: "Biaya Peralatan & Sarana Pertandingan", categoryOrder: 1, name: "Meja Lipat Outdoor", itemOrder: 7, quantity: 3, unitPrice: 300000 },
  { period: "monthly", category: "Biaya Peralatan & Sarana Pertandingan", categoryOrder: 1, name: "Cooler Box", itemOrder: 8, quantity: 1, unitPrice: 500000 },
  { period: "monthly", category: "Biaya Peralatan & Sarana Pertandingan", categoryOrder: 1, name: "Beli Tandu & Tempat tidur karet", itemOrder: 9, quantity: 1, unitPrice: 0 },
  { period: "monthly", category: "Biaya Publikasi", categoryOrder: 2, name: "Banner", itemOrder: 1, quantity: 5, unitPrice: 200000 },
  { period: "monthly", category: "Biaya Publikasi", categoryOrder: 2, name: "Giant Backdrop", itemOrder: 2, quantity: 2, unitPrice: 320000 },
  { period: "monthly", category: "Biaya Hadiah", categoryOrder: 3, name: "Piala Juara 1 Champions", itemOrder: 1, quantity: 2, unitPrice: 1500000 },
  { period: "monthly", category: "Biaya Hadiah", categoryOrder: 3, name: "Piala Juara 2 Champions", itemOrder: 2, quantity: 2, unitPrice: 300000 },
  { period: "monthly", category: "Biaya Hadiah", categoryOrder: 3, name: "Piala Juara 3 Champions", itemOrder: 3, quantity: 2, unitPrice: 300000 },
  { period: "monthly", category: "Biaya Hadiah", categoryOrder: 3, name: "Piala Juara 4 Champions", itemOrder: 4, quantity: 2, unitPrice: 300000 },
  { period: "monthly", category: "Biaya Hadiah", categoryOrder: 3, name: "Piala Juara 1 Plate", itemOrder: 5, quantity: 2, unitPrice: 200000 },
  { period: "monthly", category: "Biaya Hadiah", categoryOrder: 3, name: "Piala Juara 2 Plate", itemOrder: 6, quantity: 2, unitPrice: 200000 },
  { period: "monthly", category: "Biaya Hadiah", categoryOrder: 3, name: "Piala Juara 3 Plate", itemOrder: 7, quantity: 2, unitPrice: 200000 },
  { period: "monthly", category: "Biaya Hadiah", categoryOrder: 3, name: "Piala Juara 4 Plate", itemOrder: 8, quantity: 2, unitPrice: 200000 },
  { period: "monthly", category: "Biaya Hadiah", categoryOrder: 3, name: "Hadiah Uang Juara 1", itemOrder: 9, quantity: 2, unitPrice: 3000000 },
  { period: "monthly", category: "Biaya Hadiah", categoryOrder: 3, name: "Hadiah Uang Juara 2", itemOrder: 10, quantity: 2, unitPrice: 2000000 },
  { period: "monthly", category: "Biaya Hadiah", categoryOrder: 3, name: "Hadiah Uang Juara 3", itemOrder: 11, quantity: 2, unitPrice: 1000000 },
  { period: "monthly", category: "Biaya Hadiah", categoryOrder: 3, name: "Door Prize TV 43 inch", itemOrder: 12, quantity: 1, unitPrice: 3500000 },
  { period: "monthly", category: "Biaya Hadiah", categoryOrder: 3, name: "Medali Juara", itemOrder: 13, quantity: 160, unitPrice: 35000 },
  { period: "monthly", category: "Biaya Hadiah", categoryOrder: 3, name: "Piala Pemain Terbaik", itemOrder: 14, quantity: 2, unitPrice: 150000 },
  { period: "monthly", category: "Biaya Hadiah", categoryOrder: 3, name: "Piala Kiper Terbaik", itemOrder: 15, quantity: 2, unitPrice: 150000 },
  { period: "monthly", category: "Biaya Seragam", categoryOrder: 4, name: "Seragam Panitia", itemOrder: 1, quantity: 20, unitPrice: 100000 },
  { period: "monthly", category: "Lain-Lain", categoryOrder: 5, name: "Izin Pertandingan", itemOrder: 1, quantity: 1, unitPrice: 1500000 },
  { period: "monthly", category: "Biaya Live Streaming & Wartawan", categoryOrder: 6, name: "Liputan TV & Digital", itemOrder: 1, quantity: 0, unitPrice: 0 },
];

/** Totals Excel itself computed in the workbooks; scripts/test-finance.ts checks the seed against them. */
export const EXCEL_CONTROL_TOTALS = {
  "assetsTotal": 5300000,
  "capitalTotal": 60000000,
  "dividendTotal": 100000000,
  "registrationFee": 17500000,
  "matchFeeMatches": 52,
  "matchFeeAmount": 26000000,
  "rabWeeklyPerWeek": 22616000,
  "rabWeeklyAll": 226160000,
  "rabMonthly": 39040000,
  "rabTotal": 265200000
};
