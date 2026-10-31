/**
 * Reads "LAPORAN PENGELUARAN SEKOLAH BOLA.xlsx". Despite the file name it is a league workbook, two sheets:
 *
 *   1. "UANG REGISTRASI & MATCH FEE": each club per age group (U8, U9, …) with the registration fee, its DP / lunas
 *      transfer proofs, the amount paid, then per week the matches played, the transfer proof and the match fee paid;
 *      under the clubs, other income (stand rent, parking) per week.
 *   2. "BUKTI TRANSFER & NOMINAL UANG": the RAB (weekly and monthly forecasting) with, per week, the transfer proof
 *      and the amount really paid for each line.
 */
import { sheetReader, type Workbook } from "./xlsx-reader";
import { budgetOf, emptyParsed, tidy, type ParsedUnit, type Period } from "./excel-types";

const WEEKS = 10;

export function parseLaporan(wb: Workbook): ParsedUnit {
  const out = emptyParsed();
  parseClubs(wb, out);
  parseBudget(wb, out);
  return out;
}

/* ── sheet 1: registrations, match fees, other income ── */

function parseClubs(wb: Workbook, out: ParsedUnit) {
  const sheet = wb.sheets[0];
  const r = sheetReader(sheet);
  const matchCol = (week: number) => 9 + 3 * (week - 1); // TOTAL MATCH; the proof is the next column, the payment the one after
  let ageGroup = "";
  let lastClubRow = 3;

  for (let row = 4; row <= sheet.maxRow; row++) {
    const club = tidy(r.str(3, row));
    if (r.num(1, row) === null || !club) continue;
    lastClubRow = row;
    ageGroup = tidy(r.str(2, row)) || ageGroup;

    const fee = r.num(4, row) ?? 0;
    const paid = r.num(7, row) ?? 0;
    const dpImage = r.image(5, row);
    const finalImage = r.image(6, row);
    // The sheet states only the total paid. With both proofs it was paid in two parts (half the fee as DP), with one proof
    // as that part, with none as an unproven DP.
    let dpAmount = paid;
    let finalAmount = 0;
    let note: string | null = null;
    if (dpImage && finalImage) {
      dpAmount = Math.min(paid, Math.round(fee / 2));
      finalAmount = paid - dpAmount;
      note = "File hanya mencatat total dibayar; DP dan pelunasan dibagi dari total.";
    } else if (!dpImage && finalImage) {
      dpAmount = 0;
      finalAmount = paid;
    }
    out.registrations.push({ ageGroup, clubName: club, fee, dpAmount, dpImage, finalAmount, finalImage, note });

    const rate = r.num(8, row) ?? 0;
    for (let w = 1; w <= WEEKS; w++) {
      const matches = r.num(matchCol(w), row);
      if (matches === null || matches <= 0) continue;
      const payment = r.num(matchCol(w) + 2, row);
      let feePerMatch = rate;
      if (payment !== null && payment !== matches * rate) {
        if (payment > 0 && payment % matches === 0) feePerMatch = payment / matches;
        out.warnings.push(`Match fee ${ageGroup} ${club} minggu ${w}: ${payment} ≠ ${matches} × ${rate}; tarif per laga diambil ${feePerMatch}.`);
      }
      out.matchFees.push({ ageGroup, clubName: club, week: w, matches, feePerMatch, image: r.image(matchCol(w) + 1, row) });
    }
  }

  // other income sits under the clubs, one row each, in the payment columns of the match-fee weeks
  for (let row = lastClubRow + 1; row <= sheet.maxRow; row++) {
    const name = tidy(r.str(3, row));
    if (!name || /^total/i.test(name) || r.num(1, row) !== null) continue;
    for (let w = 1; w <= WEEKS; w++) {
      const amount = r.num(matchCol(w) + 2, row);
      if (amount !== null && amount > 0) out.otherIncome.push({ name, week: w, amount, image: r.image(matchCol(w) + 1, row) });
    }
  }

  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const check = (label: string, expected: number | null, actual: number) => expected !== null && out.checks.push({ label, expected, actual });
  check("Registrasi ditagih (D1)", r.num(4, 1), sum(out.registrations.map((x) => x.fee)));
  check("Registrasi dibayar (G1)", r.num(7, 1), sum(out.registrations.map((x) => x.dpAmount + x.finalAmount)));
  for (const w of [1, 2, 3]) {
    const week = out.matchFees.filter((m) => m.week === w);
    check(`Total laga minggu ${w}`, r.num(matchCol(w), 1), sum(week.map((m) => m.matches)));
    // a week total whose SUM runs past the last club (…N44) also covers the stand rent typed under the clubs
    const col = matchCol(w) + 2;
    const formula = sheet.cells.get(`${colLetter(col)}1`)?.formula ?? "";
    const endRow = Number(/:[A-Z]+(\d+)/.exec(formula)?.[1] ?? 0);
    const others = endRow > lastClubRow ? sum(out.otherIncome.filter((o) => o.week === w).map((o) => o.amount)) : 0;
    // …and when that range even reaches the sheet's own "Total" row, that row is added a second time
    const doubled = endRow > lastClubRow && /^total/i.test(tidy(r.str(3, endRow))) ? (r.num(col, endRow) ?? 0) : 0;
    if (doubled) out.warnings.push(`File: total match fee minggu ${w} (${colLetter(col)}1) menjumlahkan baris Total (${colLetter(col)}${endRow}) sekali lagi, jadi ${doubled} lebih besar dari seharusnya; yang diimpor memakai angka yang benar.`);
    check(`Match fee minggu ${w}`, r.num(col, 1) === null ? null : r.num(col, 1)! - doubled, sum(week.map((m) => m.matches * m.feePerMatch)) + others);
  }
}

const colLetter = (col: number) => {
  let name = "";
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
};

/* ── sheet 2: the RAB and what was paid each week, with proofs ── */

function parseBudget(wb: Workbook, out: ParsedUnit) {
  const sheet = wb.sheets[1];
  const r = sheetReader(sheet);
  const proofCol = (week: number) => 7 + 2 * (week - 1);
  const stated = { weeklyBudget: null as number | null, monthlyBudget: null as number | null };

  let section: "weekly" | "gap" | "monthly" | "done" = "weekly";
  let period: Period = "weekly";
  let category = "";
  let categoryOrder = 0;
  let itemOrder = 0;
  const weeklyTotals = new Map<number, number>();
  let weeklyTotalRow = 0;
  let monthlyTotalRow = 0;

  for (let row = 4; row <= sheet.maxRow && section !== "done"; row++) {
    const a = r.str(1, row);
    const b = r.str(2, row);
    const c = tidy(r.str(3, row));
    if (section === "gap") {
      if ((r.str(4, row) ?? "").toUpperCase().includes("MONTHLY")) {
        section = "monthly";
        period = "monthly";
        category = "";
        categoryOrder = 0;
      }
      continue;
    }
    if (a === "NO") continue;
    if (b !== null && b.trim().toUpperCase() === "TOTAL") {
      if (period === "weekly") {
        stated.weeklyBudget = r.num(6, row);
        weeklyTotalRow = row;
        section = "gap";
      } else {
        stated.monthlyBudget = r.num(6, row);
        monthlyTotalRow = row;
        section = "done";
      }
      continue;
    }

    // a category row has a name in the merged B:C cell; an item row has a letter in B (or nothing) and its name in C
    const isCategory = !!b && !c && !/^[a-z]{1,2}\.?$/i.test(b.trim());
    if (isCategory) {
      category = tidy(b);
      categoryOrder += 1;
      itemOrder = 0;
      continue;
    }
    if (!c || !category) continue;

    itemOrder += 1;
    const { quantity, unitPrice } = budgetOf(r.num(4, row), r.num(5, row), r.num(6, row), (m) => out.warnings.push(m), `RAB ${period} baris ${row} (${c})`);
    const comment = sheet.comments.get(`E${row}`)?.text;
    out.lines.push({ period, category, categoryOrder, name: c, itemOrder, quantity, unitPrice, note: comment ? comment.charAt(0) + comment.slice(1).toLowerCase() : null, isAsset: false });

    for (let w = 1; w <= WEEKS; w++) {
      const amount = r.num(proofCol(w) + 1, row);
      if (amount === null || amount <= 0) continue;
      out.costs.push({ target: { line: out.lines.length - 1 }, week: w, amount, image: r.image(proofCol(w), row), note: null });
      if (period === "weekly") weeklyTotals.set(w, (weeklyTotals.get(w) ?? 0) + amount);
    }
  }

  const sumLines = (p: Period) => out.lines.filter((l) => l.period === p).reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  const costOf = (p: Period) => out.costs.filter((x) => "line" in x.target && out.lines[x.target.line].period === p).reduce((a, x) => a + x.amount, 0);
  const check = (label: string, expected: number | null, actual: number) => expected !== null && out.checks.push({ label, expected, actual });
  check("RAB mingguan per minggu (F58)", stated.weeklyBudget, sumLines("weekly"));
  check("RAB bulanan (F114)", stated.monthlyBudget, sumLines("monthly"));
  if (weeklyTotalRow) {
    for (let w = 1; w <= WEEKS; w++) check(`Actual mingguan minggu ${w}`, r.num(proofCol(w) + 1, weeklyTotalRow), weeklyTotals.get(w) ?? 0);
    check("Actual mingguan 10 minggu (AA58)", r.num(27, weeklyTotalRow), costOf("weekly"));
  }
  if (monthlyTotalRow) check("Actual bulanan (AA114)", r.num(27, monthlyTotalRow), costOf("monthly"));
}
