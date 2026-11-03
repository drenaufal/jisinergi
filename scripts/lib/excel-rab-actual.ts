/**
 * Reads "file RAB Actual.xlsx": one sheet with the RAB on the left (WEEKLY / MONTHLY FORCASTING: qty, unit price, total)
 * and what was really spent on the right (WEEKLY / MONTHLY ACTUAL: columns Week 1…10), row for row.
 *
 * A cost sits on the same row as its RAB line, but the two sides do not always agree on the name (a line renamed on one
 * side, a row inserted on the other), so costs are matched to RAB lines by name first and by row last; a cost that matches
 * nothing becomes an extra line of RAB Actual.
 */
import { sheetReader, type Workbook } from "./xlsx-reader";
import { budgetOf, emptyParsed, norm, tidy, type ParsedUnit, type Period } from "./excel-types";

const COL = { no: 1, letter: 2, name: 3, qty: 4, unit: 5, total: 6, actualName: 16, week1: 17, actualTotal: 27 };
const WEEKS = 10;

/** Equipment the unit keeps. The sheet does not say which lines are assets; these are marked so the Aset menu has something to show. */
const ASSET_LINES = new Set(["soundsistem", "ht", "mejalipatoutdoor", "kamera", "perlengkapanmedis"]);

type Candidate = { row: number; name: string; period: Period; category: string; weeks: { week: number; amount: number; ref: string }[] };

export function parseRabActual(wb: Workbook): ParsedUnit {
  const sheet = wb.sheets[0];
  const r = sheetReader(sheet);
  const out = emptyParsed();
  const lineRow: number[] = [];
  const candidates: Candidate[] = [];
  const stated = { weeklyBudget: null as number | null, weeklyActual: null as number | null, monthlyBudget: null as number | null, monthlyActual: null as number | null };

  let section: "weekly" | "gap" | "monthly" | "done" = "weekly";
  let period: Period = "weekly";
  let category = "";
  let categoryOrder = 0;
  let itemOrder = 0;

  for (let row = 4; row <= sheet.maxRow && section !== "done"; row++) {
    const b = r.str(COL.letter, row);
    if (section === "gap") {
      if ((r.str(4, row) ?? "").toUpperCase().includes("MONTHLY")) {
        section = "monthly";
        period = "monthly";
        category = "";
        categoryOrder = 0;
      }
      continue;
    }
    if (r.str(COL.no, row) === "NO") continue;
    if (b !== null && /^total/i.test(b)) {
      if (b.trim().toUpperCase() === "TOTAL") {
        if (period === "weekly") {
          stated.weeklyBudget = r.num(COL.total, row);
          stated.weeklyActual = r.num(COL.actualTotal, row + 1); // the "TOTAL 10 WEEK" row under it
          section = "gap";
        } else {
          stated.monthlyBudget = r.num(COL.total, row);
          stated.monthlyActual = r.num(COL.actualTotal, row);
          section = "done";
        }
      }
      continue;
    }

    const name = tidy(r.str(COL.name, row));
    const isCategory = r.num(COL.no, row) !== null && b !== null && !name;
    if (isCategory) {
      category = tidy(b);
      categoryOrder += 1;
      itemOrder = 0;
    }

    if (name && category) {
      itemOrder += 1;
      const label = `RAB ${period} baris ${row} (${name})`;
      const { quantity, unitPrice } = budgetOf(r.num(COL.qty, row), r.num(COL.unit, row), r.num(COL.total, row), (m) => out.warnings.push(m), label);
      const notes = ["D", "E", "F"].map((c) => sheet.comments.get(`${c}${row}`)?.text).filter((x): x is string => !!x);
      const [qty, unit, total] = [r.num(COL.qty, row), r.num(COL.unit, row), r.num(COL.total, row)];
      // the sheet states a total that is not quantity × price (a typed-in figure): keep what it said
      const budgetNote = qty !== null && unit !== null && total !== null && qty * unit > 0 && qty * unit !== total ? `Di file: ${qty} × ${unit}, biaya ${total}` : null;
      out.lines.push({
        period,
        category,
        categoryOrder,
        name,
        itemOrder,
        quantity,
        unitPrice,
        note: [...notes.map((n) => n.charAt(0) + n.slice(1).toLowerCase()), budgetNote].filter(Boolean).join(" · ") || null,
        isAsset: period === "monthly" && /peralatan/i.test(category) && ASSET_LINES.has(norm(name)),
      });
      lineRow.push(row);
    }

    // what was spent on this row, whatever the right-hand name says
    const actualName = tidy(r.str(COL.actualName, row));
    if (actualName && category) {
      const weeks = [];
      for (let w = 1; w <= WEEKS; w++) {
        const amount = r.num(COL.week1 + w - 1, row);
        if (amount !== null && amount > 0) weeks.push({ week: w, amount, ref: `${String.fromCharCode(64 + COL.week1 + w - 1)}${row}` });
      }
      if (weeks.length) candidates.push({ row, name: actualName, period, category, weeks });
    }
  }

  /* match: same name → one name inside the other → same row → a new extra line */
  const lineIndexesOf = (c: Candidate) => out.lines.map((l, i) => (l.period === c.period && l.category === c.category ? i : -1)).filter((i) => i >= 0);
  const matched = new Map<Candidate, { line: number; renamed: boolean }>();
  const taken = new Set<number>();
  const claim = (c: Candidate, line: number, renamed: boolean) => {
    matched.set(c, { line, renamed });
    taken.add(line);
  };
  for (const c of candidates) {
    const hit = lineIndexesOf(c).find((i) => !taken.has(i) && norm(out.lines[i].name) === norm(c.name));
    if (hit !== undefined) claim(c, hit, false);
  }
  for (const c of candidates) {
    if (matched.has(c)) continue;
    const hit = lineIndexesOf(c).find((i) => {
      const a = norm(out.lines[i].name);
      const bb = norm(c.name);
      return !taken.has(i) && a.length >= 4 && bb.length >= 4 && (a.includes(bb) || bb.includes(a));
    });
    if (hit !== undefined) claim(c, hit, false);
  }
  for (const c of candidates) {
    if (matched.has(c)) continue;
    const hit = lineIndexesOf(c).find((i) => lineRow[i] === c.row && !taken.has(i));
    if (hit !== undefined) claim(c, hit, true);
  }
  const extraIndex = new Map<string, number>();
  for (const c of candidates) {
    const m = matched.get(c);
    for (const w of c.weeks) {
      const comment = sheet.comments.get(w.ref)?.text ?? null;
      let target: { line: number } | { extra: number };
      let note = comment;
      if (m) {
        target = { line: m.line };
        if (m.renamed) note = [comment, `Tertulis di file: ${c.name}`].filter(Boolean).join(" · ");
      } else {
        const key = `${c.period}|${norm(c.category)}|${norm(c.name)}`;
        let idx = extraIndex.get(key);
        if (idx === undefined) {
          idx = out.extras.push({ period: c.period, category: c.category, name: c.name }) - 1;
          extraIndex.set(key, idx);
        }
        target = { extra: idx };
      }
      out.costs.push({ target, week: w.week, amount: w.amount, image: null, note });
    }
  }

  /* what the sheet says its own totals are */
  const sumLines = (p: Period) => out.lines.filter((l) => l.period === p).reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  const costOfPeriod = (p: Period) =>
    out.costs.filter((c) => ("line" in c.target ? out.lines[c.target.line].period : out.extras[c.target.extra].period) === p).reduce((a, c) => a + c.amount, 0);
  const check = (label: string, expected: number | null, actual: number) => expected !== null && out.checks.push({ label, expected, actual });
  check("RAB mingguan per minggu (F47)", stated.weeklyBudget, sumLines("weekly"));
  check("RAB bulanan (F95)", stated.monthlyBudget, sumLines("monthly"));
  check("Actual mingguan 10 minggu (AA48)", stated.weeklyActual, costOfPeriod("weekly"));
  check("Actual bulanan (AA95)", stated.monthlyActual, costOfPeriod("monthly"));
  const opex = r.num(COL.actualTotal, 97);
  check("Total estimasi OPEX actual (AA97)", opex, costOfPeriod("weekly") + costOfPeriod("monthly"));
  return out;
}
