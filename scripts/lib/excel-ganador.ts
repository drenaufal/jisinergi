import type { Workbook } from "@/lib/finance/excel/xlsx-reader";
import { sheetReader } from "@/lib/finance/excel/xlsx-reader";
import { norm, tidy } from "@/lib/finance/excel/excel-types";

/**
 * Reads "LAPORAN KEUANGAN & DATABASE SSB GANADOR.xlsx": a football school's own workbook with two sheets.
 *
 *   LAPORAN KEUANGAN   saldo awal, then one row per cash in (a student's payment) or cash out (an expense)
 *   DATABASE           one row per student: identity, registration + jersey, and the fee paid in each month
 *
 * The two sheets describe the same money from two sides, so the parser reads both and checks them against each other and
 * against the totals the sheets state themselves (scripts/import-ganador.ts refuses to write when any check fails).
 */

export type GanadorStudent = {
  nik: string | null;
  name: string;
  nickname: string | null;
  birthPlace: string | null;
  birthDate: string | null;
  parentPhone: string | null;
  jerseySize: string | null;
  sizeType: string | null;
  /** Null when the sheet has no join date; the importer then falls back to the first payment. */
  joinedOn: string | null;
};

export type GanadorPayment = {
  /** Row number in the LAPORAN KEUANGAN sheet: keeps the order the school entered the rows in. */
  sheetRow: number;
  student: string;
  kind: "registration" | "monthly";
  paidOn: string;
  amount: number;
  note: string | null;
};

export type GanadorExpense = {
  sheetRow: number;
  spentOn: string;
  category: string;
  name: string;
  amount: number;
  attendanceDays: number | null;
  dailyRate: number | null;
};

export type ParsedGanador = {
  title: string;
  /** "Saldo Awal": the money the school started with. The app keeps it as the unit's Modal. */
  openingBalance: number;
  students: GanadorStudent[];
  payments: GanadorPayment[];
  expenses: GanadorExpense[];
  checks: { label: string; expected: number; actual: number }[];
  warnings: string[];
};

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", mei: "05", may: "05", jun: "06", jul: "07",
  agu: "08", agt: "08", aug: "08", sep: "09", okt: "10", oct: "10", nov: "11", des: "12", dec: "12",
};

/** Excel day number → "YYYY-MM-DD" (day 1 = 1900-01-01, with Excel's fictitious 29 Feb 1900 already behind us after day 60). */
export const isoOfSerial = (serial: number) => new Date(Math.round((serial - 25569) * 86_400_000)).toISOString().slice(0, 10);

/**
 * The sheet has no category column, so one is read from the description. Kept deliberately coarse: salaries, the pitch
 * rent, equipment, and everything else.
 */
export function expenseCategory(note: string) {
  if (/^gaji\b/i.test(note)) return "Gaji";
  if (/^sewa\s+lapangan/i.test(note)) return "Sewa lapangan";
  if (/^(pembelian|gawang|rompi|tas\b)/i.test(note)) return "Perlengkapan";
  return "Operasional";
}

const sheetNamed = (wb: Workbook, name: string) => {
  const sheet = wb.sheets.find((s) => norm(s.name) === norm(name));
  if (!sheet) throw new Error(`Sheet “${name}” not found. The workbook has: ${wb.sheets.map((s) => s.name).join(", ")}.`);
  return sheet;
};

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

export function parseGanador(wb: Workbook): ParsedGanador {
  const out: ParsedGanador = { title: "", openingBalance: 0, students: [], payments: [], expenses: [], checks: [], warnings: [] };
  const warn = (m: string) => out.warnings.push(m);

  /* ── LAPORAN KEUANGAN ── */
  const reportSheet = sheetNamed(wb, "LAPORAN KEUANGAN");
  const report = sheetReader(reportSheet);
  out.title = tidy(report.str("A", 1));
  out.openingBalance = report.num("B", 2) ?? 0;
  const stated = { totalIn: report.num("A", 5), totalOut: report.num("C", 5), balance: report.num("E", 5) };

  type Entry = { row: number; date: string; note: string; days: number | null; rate: number | null; cashIn: number; cashOut: number };
  const entries: Entry[] = [];
  for (let row = 8; row <= reportSheet.maxRow; row++) {
    const note = tidy(report.str("C", row));
    const dateSerial = report.num("B", row);
    const cashIn = report.num("F", row) ?? 0;
    const cashOut = report.num("G", row) ?? 0;
    if (!note && dateSerial === null && !cashIn && !cashOut) continue;
    if (!cashIn && !cashOut) {
      warn(`Laporan baris ${row} (“${note}”) tidak punya Cash In maupun Cash Out; dilewati.`);
      continue;
    }
    if (cashIn && cashOut) throw new Error(`Laporan baris ${row}: Cash In dan Cash Out terisi bersamaan.`);
    if (dateSerial === null) throw new Error(`Laporan baris ${row} (“${note}”): tanggal kosong.`);
    if (!note) throw new Error(`Laporan baris ${row}: Note kosong.`);
    entries.push({ row, date: isoOfSerial(dateSerial), note, days: report.num("D", row), rate: report.num("E", row), cashIn, cashOut });
  }

  /* ── DATABASE ── */
  const dbSheet = sheetNamed(wb, "DATABASE");
  const db = sheetReader(dbSheet);
  const incomeEntries = entries.filter((e) => e.cashIn);

  // the month headers carry no year; the cash-in dates say which one it is
  const years = [...new Set(incomeEntries.map((e) => e.date.slice(0, 4)))];
  if (years.length > 1) warn(`Tanggal Cash In memuat lebih dari satu tahun (${years.join(", ")}); kolom bulan di DATABASE dibaca sebagai tahun ${years.sort().at(-1)}.`);
  const year = years.sort().at(-1) ?? String(new Date().getFullYear());

  const monthColumns: { col: number; month: string }[] = [];
  for (let col = 13; col <= 19; col++) {
    const label = tidy(db.str(col, 2)).toLowerCase().slice(0, 3);
    const mm = MONTHS[label];
    if (!mm) throw new Error(`DATABASE: kolom ${col} (“${db.str(col, 2)}”) bukan nama bulan.`);
    monthColumns.push({ col, month: `${year}-${mm}` });
  }

  type Cell = { amount: number; isRegistration: boolean; used: boolean };
  const grid = new Map<string, Map<string, Cell>>();
  const gross = new Map<string, { registration: number; jersey: number; net: number }>();

  for (let row = 3; row <= dbSheet.maxRow; row++) {
    const name = tidy(db.str("C", row));
    if (!name) continue;
    const text = (col: string) => tidy(db.str(col, row)) || null;
    const cellText = (col: string) => {
      const v = db.cell(col, row)?.value;
      if (typeof v === "number") {
        warn(`DATABASE baris ${row}: kolom ${col} berisi angka (${v}); angka nol di depan nomor telepon bisa hilang.`);
        return String(v);
      }
      return text(col);
    };
    const birthSerial = db.num("F", row);
    const joinedSerial = db.num("A", row);
    out.students.push({
      nik: text("B"),
      name,
      nickname: text("D"),
      birthPlace: text("E"),
      birthDate: birthSerial === null ? null : isoOfSerial(birthSerial),
      parentPhone: cellText("G"),
      jerseySize: text("H"),
      sizeType: text("I"),
      joinedOn: joinedSerial === null ? null : isoOfSerial(joinedSerial),
    });

    const registration = db.num("J", row) ?? 0;
    const jersey = db.num("K", row) ?? 0;
    const net = db.num("L", row) ?? 0;
    if (registration || jersey || net) {
      if (registration - jersey !== net) throw new Error(`DATABASE baris ${row} (${name}): Registrasi ${registration} − Jersey ${jersey} ≠ Total ${net}.`);
      gross.set(norm(name), { registration, jersey, net });
    }

    // the registration is the month cell that points at the Total column (=L4); every other month cell is a plain fee
    const cells = new Map<string, Cell>();
    for (const { col, month } of monthColumns) {
      const cell = db.cell(col, row);
      const amount = typeof cell?.value === "number" ? cell.value : 0;
      if (!amount) continue;
      const isRegistration = !!cell?.formula && cell.formula.replace(/\$/g, "").toUpperCase() === `L${row}`;
      cells.set(month, { amount, isRegistration, used: false });
    }
    const registrationCells = [...cells.entries()].filter(([, c]) => c.isRegistration);
    if (registrationCells.length > 1) throw new Error(`DATABASE baris ${row} (${name}): lebih dari satu bulan yang berisi Total registrasi.`);
    if (net > 0 && registrationCells.length === 0) throw new Error(`DATABASE baris ${row} (${name}): Total registrasi ${net} tidak ditemukan di kolom bulan mana pun.`);
    if (registrationCells[0] && registrationCells[0][1].amount !== net) throw new Error(`DATABASE baris ${row} (${name}): bulan registrasi ${registrationCells[0][1].amount} ≠ Total ${net}.`);
    grid.set(norm(name), cells);

    const rowSum = [...cells.values()].reduce((a, c) => a + c.amount, 0);
    const statedRow = db.num("T", row);
    if (statedRow !== null) out.checks.push({ label: `DATABASE ${name}: Grand Total baris`, expected: statedRow, actual: rowSum });
  }
  if (out.students.length === 0) throw new Error("DATABASE: tidak ada siswa.");
  const duplicates = out.students.map((s) => norm(s.name)).filter((n, i, all) => all.indexOf(n) !== i);
  if (duplicates.length) throw new Error(`DATABASE: nama siswa ganda (${[...new Set(duplicates)].join(", ")}).`);

  /* ── tie the two sheets together ── */
  for (const e of incomeEntries) {
    const student = out.students.find((s) => norm(s.name) === norm(e.note));
    if (!student) throw new Error(`Laporan baris ${e.row}: “${e.note}” tidak ada di sheet DATABASE.`);
    const month = e.date.slice(0, 7);
    const cell = grid.get(norm(student.name))?.get(month);
    if (!cell) throw new Error(`Laporan baris ${e.row}: ${student.name} membayar ${e.cashIn} pada ${e.date}, tetapi kolom bulan ${month} di DATABASE kosong.`);
    if (cell.used) throw new Error(`Laporan baris ${e.row}: ${student.name} dua kali membayar di bulan ${month}.`);
    if (cell.amount !== e.cashIn) throw new Error(`Laporan baris ${e.row}: ${student.name} bulan ${month} Rp ${e.cashIn} di Laporan, tetapi Rp ${cell.amount} di DATABASE.`);
    cell.used = true;

    const fees = gross.get(norm(student.name));
    out.payments.push({
      sheetRow: e.row,
      student: student.name,
      kind: cell.isRegistration ? "registration" : "monthly",
      paidOn: e.date,
      amount: e.cashIn,
      note: cell.isRegistration && fees ? `Registrasi Rp ${fees.registration.toLocaleString("id-ID")} dikurangi jersey Rp ${fees.jersey.toLocaleString("id-ID")} (uang jersey bukan pemasukan).` : null,
    });
  }
  for (const [name, cells] of grid) {
    for (const [month, cell] of cells) {
      if (!cell.used) throw new Error(`DATABASE: ${out.students.find((s) => norm(s.name) === name)!.name} membayar Rp ${cell.amount} di bulan ${month}, tetapi tidak ada barisnya di Laporan.`);
    }
  }

  for (const e of entries.filter((x) => x.cashOut)) {
    if (e.days !== null && e.rate !== null && e.days * e.rate !== e.cashOut) {
      warn(`Laporan baris ${e.row} (${e.note}): absen ${e.days} × gaji satuan ${e.rate} = ${e.days * e.rate}, tetapi Cash Out ${e.cashOut}.`);
    }
    out.expenses.push({
      sheetRow: e.row,
      spentOn: e.date,
      category: expenseCategory(e.note),
      name: e.note,
      amount: e.cashOut,
      attendanceDays: e.days,
      dailyRate: e.rate,
    });
  }

  /* ── things to look at, not reasons to stop ── */
  for (const s of out.students) {
    const mine = out.payments.filter((p) => norm(p.student) === norm(s.name)).map((p) => p.paidOn).sort();
    if (!s.joinedOn) {
      if (mine[0]) warn(`${s.name}: tidak ada Tanggal Bergabung; dipakai tanggal pembayaran pertama (${mine[0]}).`);
      else warn(`${s.name}: tidak ada Tanggal Bergabung dan belum pernah membayar.`);
      continue;
    }
    if (mine[0] && daysBetween(s.joinedOn, mine[0]) > 90) warn(`${s.name}: bergabung ${s.joinedOn}, tetapi pembayaran pertama baru ${mine[0]} — tahun di Tanggal Bergabung mungkin salah ketik.`);
    if (mine[0] && daysBetween(s.joinedOn, mine[0]) < 0) warn(`${s.name}: bergabung ${s.joinedOn}, sesudah pembayaran pertama ${mine[0]}.`);
  }
  const names = out.expenses.filter((e) => e.category === "Gaji").map((e) => e.name.replace(/^gaji\s+/i, ""));
  const near = [...new Set(names)].filter((n, i, all) => all.some((m, j) => j !== i && m !== n && norm(m).slice(0, 5) === norm(n).slice(0, 5)));
  if (near.length) warn(`Nama penerima gaji mirip tetapi ejaannya berbeda: ${near.join(", ")}. Dibiarkan seperti di Excel.`);

  /* ── totals the sheets state themselves ── */
  const totalIn = out.payments.reduce((a, p) => a + p.amount, 0);
  const totalOut = out.expenses.reduce((a, e) => a + e.amount, 0);
  if (stated.totalIn !== null) out.checks.push({ label: "Laporan: Total Masuk", expected: stated.totalIn, actual: totalIn });
  if (stated.totalOut !== null) out.checks.push({ label: "Laporan: Total Keluar", expected: stated.totalOut, actual: totalOut });
  if (stated.balance !== null) out.checks.push({ label: "Laporan: Sisa Saldo (saldo awal + masuk − keluar)", expected: stated.balance, actual: out.openingBalance + totalIn - totalOut });
  const grandTotal = db.num("T", dbSheet.maxRow);
  if (grandTotal !== null) out.checks.push({ label: "DATABASE: Grand Total semua siswa", expected: grandTotal, actual: totalIn });
  for (const { col, month } of monthColumns) {
    const statedMonth = db.num(col, dbSheet.maxRow);
    if (statedMonth === null) continue;
    const actual = out.payments.filter((p) => p.paidOn.slice(0, 7) === month).reduce((a, p) => a + p.amount, 0);
    out.checks.push({ label: `DATABASE: total bulan ${month}`, expected: statedMonth, actual });
  }
  return out;
}
