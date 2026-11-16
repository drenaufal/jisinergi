/**
 * The Excel templates for RAB Budget and RAB Actual: building them (what the template download hands out) and reading them
 * back (what "Import Excel" accepts). One row of the template = one RAB line (RAB Budget) or one cost (RAB Actual).
 * The columns are found by their header text, so a person may move columns around or add their own.
 *
 * Reading never touches the database: the RAB Actual rows are matched to the unit's lines by `resolveActualRows`,
 * with the lines handed in, and the result goes through the same plan as the old workbook (rab-actual-plan.ts).
 */
import type { Sheet, Workbook } from "./xlsx-reader";
import { sheetReader } from "./xlsx-reader";
import { buildWorkbook, type CellInput } from "./xlsx-writer";
import { emptyParsed, norm, tidy, type ParsedUnit, type Period } from "./excel-types";

export const BUDGET_SHEET = "RAB Budget";
export const ACTUAL_SHEET = "RAB Actual";
const RAB_LIST_SHEET = "Daftar RAB";
const GUIDE_SHEET = "Petunjuk";

const HEADER_ROW = 4;
const FIRST_ROW = HEADER_ROW + 1;
const TEMPLATE_ROWS = 500;
const LAST_ROW = FIRST_ROW + TEMPLATE_ROWS - 1;
/** Problems listed one by one before the rest are only counted. */
const MAX_PROBLEMS = 15;

const PERIOD_LABEL: Record<Period, string> = { weekly: "Mingguan", monthly: "Bulanan" };

/* ── columns ───────────────────────────────────────────────────────── */

type ColumnDef = { key: string; header: string; aliases: string[]; required: boolean };

const BUDGET_COLUMNS = [
  { key: "period", header: "Jenis Biaya", aliases: ["jenisbiaya", "jenis", "periode"], required: true },
  { key: "category", header: "Kategori", aliases: ["kategori"], required: true },
  { key: "name", header: "Nama Biaya", aliases: ["namabiaya", "keteranganbiaya", "nama", "item"], required: true },
  { key: "quantity", header: "Jumlah Satuan", aliases: ["jumlahsatuan", "jumlah", "qty"], required: true },
  { key: "unitPrice", header: "Harga Satuan (Rp)", aliases: ["hargasatuanrp", "hargasatuan", "biayasatuan", "biayasatuanrp"], required: true },
  { key: "total", header: "Total (Rp)", aliases: ["totalrp", "total", "totalbiaya"], required: false },
  { key: "asset", header: "Aset (Ya/Tidak)", aliases: ["asetyatidak", "aset", "asset"], required: false },
  { key: "note", header: "Catatan", aliases: ["catatan", "keterangan", "note"], required: false },
] as const satisfies readonly ColumnDef[];

const ACTUAL_COLUMNS = [
  { key: "date", header: "Tanggal", aliases: ["tanggal", "tanggalbayar", "tgl"], required: true },
  { key: "period", header: "Jenis Biaya", aliases: ["jenisbiaya", "jenis", "periode"], required: false },
  { key: "category", header: "Kategori", aliases: ["kategori"], required: false },
  { key: "name", header: "Keterangan Biaya", aliases: ["keteranganbiaya", "namabiaya", "nama", "item"], required: true },
  { key: "amount", header: "Nominal (Rp)", aliases: ["nominalrp", "nominal", "jumlahrp", "biaya"], required: true },
  { key: "note", header: "Catatan", aliases: ["catatan", "keterangan", "note"], required: false },
] as const satisfies readonly ColumnDef[];

type ColumnMap<C extends readonly ColumnDef[]> = Record<C[number]["key"], number | null>;

/** The header row of a template sheet and where each column is, or null when the sheet does not look like one. */
function findHeader<C extends readonly ColumnDef[]>(sheet: Sheet, defs: C): { row: number; cols: ColumnMap<C> } | null {
  const r = sheetReader(sheet);
  for (let row = 1; row <= Math.min(sheet.maxRow, 20); row++) {
    const found: Record<string, number | null> = Object.fromEntries(defs.map((d) => [d.key, null]));
    for (let col = 1; col <= 30; col++) {
      const text = r.str(col, row);
      if (!text) continue;
      const key = norm(text);
      const def = defs.find((d) => found[d.key] === null && (d.aliases as readonly string[]).includes(key));
      if (def) found[def.key] = col;
    }
    if (defs.every((d) => !d.required || found[d.key] !== null)) return { row, cols: found as ColumnMap<C> };
  }
  return null;
}

function findTemplateSheet<C extends readonly ColumnDef[]>(wb: Workbook, preferred: string, defs: C) {
  const ordered = [...wb.sheets].sort((a, b) => Number(norm(b.name) === norm(preferred)) - Number(norm(a.name) === norm(preferred)));
  for (const sheet of ordered) {
    if (norm(sheet.name) === norm(GUIDE_SHEET) || norm(sheet.name) === norm(RAB_LIST_SHEET)) continue;
    const header = findHeader(sheet, defs);
    if (header) return { sheet, ...header };
  }
  return null;
}

/* ── cell values ───────────────────────────────────────────────────── */

const raw = (sheet: Sheet, col: number | null, row: number) => {
  if (col === null) return null;
  const r = sheetReader(sheet);
  const v = r.cell(col, row)?.value;
  if (v === null || v === undefined) return null;
  return typeof v === "string" ? (v.replace(/\s+/g, " ").trim() || null) : v;
};

function periodOf(v: string | number | null): Period | null | "bad" {
  if (v === null) return null;
  const k = norm(String(v));
  if (["mingguan", "minggu", "weekly", "week", "m"].includes(k)) return "weekly";
  if (["bulanan", "bulan", "monthly", "month", "sekali", "b"].includes(k)) return "monthly";
  return "bad";
}

/** Rupiah from a number cell or text like "Rp 1.500.000". Null when empty, NaN when unreadable. */
function moneyOf(v: string | number | null): number | null {
  if (v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : NaN;
  const cleaned = v.replace(/rp/gi, "").replace(/\s/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  // "1.500.000" and "1,500,000" are thousands; a trailing ",50" / ".50" is cents
  const m = /^-?[\d.,]+$/.exec(cleaned);
  if (!m) return NaN;
  const withoutCents = cleaned.replace(/[.,]\d{1,2}$/, "");
  const digits = withoutCents.replace(/[.,]/g, "");
  return digits === "" ? NaN : Number(digits);
}

function wholeOf(v: string | number | null): number | null {
  if (v === null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function yesNo(v: string | number | null): boolean | "bad" {
  if (v === null) return false;
  const k = norm(String(v));
  if (["ya", "y", "yes", "aset", "asset", "1", "true", "v"].includes(k)) return true;
  if (["tidak", "t", "no", "n", "nonaset", "bukan", "0", "false", ""].includes(k)) return false;
  return "bad";
}

const pad = (n: number) => String(n).padStart(2, "0");
const validIso = (y: number, m: number, d: number) => {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
};
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, agt: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12 };

/** An ISO date from an Excel date (a day number) or text such as 2026-11-03, 03/11/2026 or 3 Nov 2026. */
export function dateOf(v: string | number | null): string | null | "bad" {
  if (v === null) return null;
  if (typeof v === "number") {
    if (v < 30000 || v > 80000) return "bad";
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86_400_000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = v.trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return validIso(+m[1], +m[2], +m[3]) ?? "bad";
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) return validIso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]) ?? "bad";
  m = /^(\d{1,2})[\s-]+([a-z]{3})[a-z]*[\s-]+(\d{4})$/i.exec(s);
  if (m && MONTHS[m[2].toLowerCase()]) return validIso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]) ?? "bad";
  return "bad";
}

function problemList() {
  const all: string[] = [];
  return {
    add: (p: string) => all.push(p),
    get count() {
      return all.length;
    },
    list: () => (all.length > MAX_PROBLEMS ? [...all.slice(0, MAX_PROBLEMS), `…dan ${all.length - MAX_PROBLEMS} masalah lain.`] : all),
  };
}

/* ── RAB Budget ────────────────────────────────────────────────────── */

export type BudgetTemplateResult = { parsed: ParsedUnit; problems: string[]; rows: number };

/** Reads a RAB Budget template. Null when the workbook has no sheet with its headers (not this template). */
export function parseBudgetTemplate(wb: Workbook): BudgetTemplateResult | null {
  const found = findTemplateSheet(wb, BUDGET_SHEET, BUDGET_COLUMNS);
  if (!found) return null;
  const { sheet, row: headerRow, cols } = found;
  const parsed = emptyParsed();
  const problems = problemList();
  const seen = new Map<string, number>();
  let rows = 0;

  for (let row = headerRow + 1; row <= sheet.maxRow; row++) {
    const v = {
      period: raw(sheet, cols.period, row),
      category: raw(sheet, cols.category, row),
      name: raw(sheet, cols.name, row),
      quantity: raw(sheet, cols.quantity, row),
      unitPrice: raw(sheet, cols.unitPrice, row),
      asset: raw(sheet, cols.asset, row),
      note: raw(sheet, cols.note, row),
    };
    // a row with nothing typed in it (only the Total formula) is skipped
    if (Object.values(v).every((x) => x === null)) continue;
    rows += 1;
    const at = `Baris ${row}`;
    const errors: string[] = [];

    const period = periodOf(v.period);
    if (period === null) errors.push("Jenis Biaya kosong (isi Mingguan atau Bulanan)");
    else if (period === "bad") errors.push(`Jenis Biaya “${v.period}” tidak dikenal (isi Mingguan atau Bulanan)`);
    const category = tidy(v.category === null ? "" : String(v.category));
    if (!category) errors.push("Kategori kosong");
    else if (category.length > 160) errors.push("Kategori lebih dari 160 karakter");
    const name = tidy(v.name === null ? "" : String(v.name));
    if (!name) errors.push("Nama Biaya kosong");
    else if (name.length > 200) errors.push("Nama Biaya lebih dari 200 karakter");
    const quantity = v.quantity === null ? 1 : wholeOf(v.quantity);
    if (quantity === null || Number.isNaN(quantity) || !Number.isInteger(quantity) || quantity < 0 || quantity > 1_000_000) errors.push("Jumlah Satuan harus angka bulat 0 atau lebih");
    const unitPrice = moneyOf(v.unitPrice);
    if (unitPrice === null) errors.push("Harga Satuan kosong");
    else if (Number.isNaN(unitPrice) || unitPrice < 0) errors.push(`Harga Satuan “${v.unitPrice}” bukan angka rupiah`);
    else if (unitPrice > 1_000_000_000_000) errors.push("Harga Satuan terlalu besar");
    const isAsset = yesNo(v.asset);
    if (isAsset === "bad") errors.push(`Kolom Aset “${v.asset}” tidak dikenal (isi Ya atau Tidak)`);
    const note = v.note === null ? null : String(v.note).slice(0, 1000);

    if (!errors.length && period !== "bad" && period !== null) {
      const key = `${period}|${norm(category)}|${norm(name)}`;
      const first = seen.get(key);
      if (first !== undefined) errors.push(`nama biaya sama dengan baris ${first} (jenis dan kategori yang sama)`);
      else seen.set(key, row);
    }
    if (errors.length) {
      problems.add(`${at}: ${errors.join("; ")}.`);
      continue;
    }
    parsed.lines.push({
      period: period as Period,
      category,
      categoryOrder: 0,
      name,
      itemOrder: 0,
      quantity: quantity as number,
      unitPrice: unitPrice as number,
      note,
      isAsset: isAsset === true,
    });
  }
  return { parsed, problems: problems.list(), rows };
}

/* ── RAB Actual ────────────────────────────────────────────────────── */

export type ActualTemplateRow = { row: number; spentOn: string; period: Period | null; category: string | null; name: string; amount: number; note: string | null };
export type ActualTemplateResult = { rows: ActualTemplateRow[]; problems: string[]; count: number };

/** Reads a RAB Actual template. Null when the workbook has no sheet with its headers (then it may be the old workbook). */
export function parseActualTemplate(wb: Workbook): ActualTemplateResult | null {
  const found = findTemplateSheet(wb, ACTUAL_SHEET, ACTUAL_COLUMNS);
  if (!found) return null;
  const { sheet, row: headerRow, cols } = found;
  const problems = problemList();
  const rows: ActualTemplateRow[] = [];
  let count = 0;

  for (let row = headerRow + 1; row <= sheet.maxRow; row++) {
    const v = {
      date: raw(sheet, cols.date, row),
      period: raw(sheet, cols.period, row),
      category: raw(sheet, cols.category, row),
      name: raw(sheet, cols.name, row),
      amount: raw(sheet, cols.amount, row),
      note: raw(sheet, cols.note, row),
    };
    if (Object.values(v).every((x) => x === null)) continue;
    count += 1;
    const errors: string[] = [];

    const spentOn = dateOf(v.date);
    if (spentOn === null) errors.push("Tanggal kosong");
    else if (spentOn === "bad") errors.push(`Tanggal “${v.date}” tidak terbaca (tulis seperti 2026-11-03)`);
    const period = periodOf(v.period);
    if (period === "bad") errors.push(`Jenis Biaya “${v.period}” tidak dikenal (isi Mingguan atau Bulanan)`);
    const category = tidy(v.category === null ? "" : String(v.category));
    if (category.length > 160) errors.push("Kategori lebih dari 160 karakter");
    const name = tidy(v.name === null ? "" : String(v.name));
    if (!name) errors.push("Keterangan Biaya kosong");
    else if (name.length > 200) errors.push("Keterangan Biaya lebih dari 200 karakter");
    const amount = moneyOf(v.amount);
    if (amount === null) errors.push("Nominal kosong");
    else if (Number.isNaN(amount)) errors.push(`Nominal “${v.amount}” bukan angka rupiah`);
    else if (amount <= 0) errors.push("Nominal harus lebih dari 0");
    else if (amount > 1_000_000_000_000) errors.push("Nominal terlalu besar");

    if (errors.length) {
      problems.add(`Baris ${row}: ${errors.join("; ")}.`);
      continue;
    }
    rows.push({
      row,
      spentOn: spentOn as string,
      period: period === "bad" ? null : period,
      category: category || null,
      name,
      amount: amount as number,
      note: v.note === null ? null : String(v.note).slice(0, 1000),
    });
  }
  return { rows, problems: problems.list(), count };
}

type KnownLine = { period: Period; category: string; name: string };

/**
 * Turns template rows into what the RAB Actual plan takes: every distinct line becomes an "extra" line, which the plan
 * books on the RAB line of the same category and name when there is one. An empty Kategori / Jenis Biaya is taken from
 * the unit's line of that name, when exactly one has it.
 */
export function resolveActualRows(rows: readonly ActualTemplateRow[], budget: readonly KnownLine[], extras: readonly KnownLine[]) {
  const parsed = emptyParsed();
  const problems = problemList();
  const known = [...budget.map((l) => ({ ...l, inRab: true })), ...extras.map((l) => ({ ...l, inRab: false }))];
  const byName = (name: string) => known.filter((l) => norm(l.name) === norm(name));
  const extraIndex = new Map<string, number>();
  const outside = new Map<string, string>();

  for (const r of rows) {
    let category = r.category;
    let period = r.period;
    const sameName = byName(r.name);
    const exact = category ? sameName.filter((l) => norm(l.category) === norm(category!)) : sameName;
    if (!category) {
      const categories = [...new Set(sameName.map((l) => norm(l.category)))];
      if (categories.length === 1) category = sameName[0].category;
      else if (categories.length > 1) {
        problems.add(`Baris ${r.row}: “${r.name}” ada di beberapa kategori (${[...new Set(sameName.map((l) => l.category))].join(", ")}). Isi kolom Kategori.`);
        continue;
      } else {
        problems.add(`Baris ${r.row}: Kategori kosong dan “${r.name}” tidak ada di RAB. Isi kolom Kategori dan Jenis Biaya.`);
        continue;
      }
    }
    if (!period) {
      const periods = [...new Set(exact.map((l) => l.period))];
      if (periods.length === 1) period = periods[0];
      else {
        problems.add(`Baris ${r.row}: Jenis Biaya kosong. Isi Mingguan atau Bulanan.`);
        continue;
      }
    }
    const key = `${period}|${norm(category)}|${norm(r.name)}`;
    let idx = extraIndex.get(key);
    if (idx === undefined) {
      const line = exact.find((l) => l.inRab) ?? exact[0];
      idx = parsed.extras.push({ period, category: line?.category ?? category, name: line?.name ?? r.name }) - 1;
      extraIndex.set(key, idx);
      if (!exact.some((l) => l.inRab)) outside.set(key, `${r.name} (${category})`);
    }
    parsed.costs.push({ target: { extra: idx }, week: 0, spentOn: r.spentOn, amount: r.amount, image: null, note: r.note });
  }
  return { parsed, problems: problems.list(), outside: [...outside.values()] };
}

/* ── building the templates ────────────────────────────────────────── */

const listRange = (col: string) => `${col}${FIRST_ROW}:${col}${LAST_ROW}`;

function guideSheet(title: string, lines: string[], example: { header: string[]; rows: CellInput[][] }) {
  const rows: CellInput[][] = [[{ value: title, style: "title" }], []];
  for (const l of lines) rows.push([{ value: l, style: l.startsWith("•") ? "default" : "bold" }]);
  rows.push([], [{ value: "Contoh pengisian", style: "bold" }]);
  rows.push(example.header.map((h) => ({ value: h, style: "header" as const })));
  rows.push(...example.rows);
  return { name: GUIDE_SHEET, columns: [{ width: 22 }, { width: 22 }, { width: 30 }, { width: 16 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 30 }], rows };
}

/** "Template RAB Budget": header in row 4, rows from row 5; Total is a formula; Jenis Biaya and Aset are drop-downs. */
export function budgetTemplate(unit: { name: string; programWeeks: number }): Buffer {
  const head = BUDGET_COLUMNS.map((c) => ({ value: c.header, style: "header" as const }));
  const rows: CellInput[][] = [
    [{ value: `Template RAB Budget — ${unit.name}`, style: "title" }],
    [{ value: `Satu baris = satu baris RAB. Biaya mingguan dikalikan ${unit.programWeeks} minggu program; biaya bulanan dihitung sekali. Baris yang sudah ada di RAB Budget dilewati. Lihat sheet “Petunjuk”.`, style: "note" }],
    [],
    head,
  ];
  for (let r = FIRST_ROW; r <= LAST_ROW; r++) {
    rows.push([null, null, null, null, null, { formula: `IF(OR(D${r}="",E${r}=""),"",D${r}*E${r})`, style: "money" }, null, null]);
  }
  return buildWorkbook([
    {
      name: BUDGET_SHEET,
      columns: [{ width: 14, style: "text" }, { width: 24, style: "text" }, { width: 34, style: "text" }, { width: 14, style: "money" }, { width: 18, style: "money" }, { width: 18, style: "money" }, { width: 15, style: "text" }, { width: 36, style: "text" }],
      rows,
      merges: ["A1:H1", "A2:H2"],
      rowHeights: { 2: 34 },
      freezeBelowRow: FIRST_ROW,
      lists: [
        { range: listRange("A"), options: [PERIOD_LABEL.weekly, PERIOD_LABEL.monthly] },
        { range: listRange("G"), options: ["Ya", "Tidak"] },
      ],
    },
    guideSheet(
      "Petunjuk — Template RAB Budget",
      [
        "Cara mengisi",
        "• Isi sheet “RAB Budget” mulai baris 5. Satu baris = satu baris RAB. Jangan ubah judul kolom di baris 4.",
        "• Jenis Biaya: Mingguan (berulang setiap minggu pertandingan) atau Bulanan (dikeluarkan satu kali).",
        "• Kategori: kelompok biaya, misalnya Lapangan, Perangkat Pertandingan, Peralatan. Baris dengan kategori sama dikelompokkan.",
        "• Nama Biaya: nama baris RAB. Jumlah Satuan: angka bulat (kosong = 1). Harga Satuan: rupiah tanpa titik atau “Rp”.",
        "• Total dihitung otomatis (Jumlah Satuan × Harga Satuan) dan tidak dibaca saat diunggah.",
        "• Aset: Ya bila barangnya akan dimiliki unit (pembeliannya di RAB Actual otomatis masuk menu Aset). Kosong = Tidak.",
        "Penting",
        "• Baris RAB Budget yang sudah disimpan tidak bisa diubah. Periksa dulu; file diperiksa sebelum disimpan.",
        "• Baris yang jenis, kategori, dan namanya sudah ada di RAB Budget unit ini dilewati, jadi file yang sama aman diunggah ulang.",
      ],
      {
        header: BUDGET_COLUMNS.map((c) => c.header),
        rows: [
          ["Mingguan", "Lapangan", "Sewa lapangan", 2, 1500000, { value: 3000000, style: "money" }, "Tidak", "2 lapangan per minggu"],
          ["Mingguan", "Perangkat Pertandingan", "Honor wasit", 8, 250000, { value: 2000000, style: "money" }, "Tidak", null],
          ["Bulanan", "Peralatan", "Sound sistem", 1, 7500000, { value: 7500000, style: "money" }, "Ya", "Dibeli sekali"],
        ],
      },
    ),
  ]);
}

/** "Template RAB Actual": one row per cost, with its date; sheet "Daftar RAB" lists the unit's lines to copy names from. */
export function actualTemplate(unit: { name: string }, lines: readonly (KnownLine & { budget: number; isAsset: boolean; inRab: boolean })[]): Buffer {
  const head = ACTUAL_COLUMNS.map((c) => ({ value: c.header, style: "header" as const }));
  const rows: CellInput[][] = [
    [{ value: `Template RAB Actual — ${unit.name}`, style: "title" }],
    [{ value: "Satu baris = satu biaya yang benar-benar keluar. Keterangan Biaya sebaiknya sama persis dengan nama di sheet “Daftar RAB”; nama lain menjadi baris di luar RAB. Lihat sheet “Petunjuk”.", style: "note" }],
    [],
    head,
  ];
  const listRows: CellInput[][] = [
    [{ value: `Daftar RAB — ${unit.name}`, style: "title" }],
    [{ value: "Nama baris yang sudah ada di unit ini. Salin Jenis Biaya, Kategori, dan Keterangan Biaya dari sini ke sheet “RAB Actual”.", style: "note" }],
    [],
    ["Jenis Biaya", "Kategori", "Keterangan Biaya", "Budget (Rp)", "Aset", "Sumber"].map((h) => ({ value: h, style: "header" as const })),
    ...lines.map((l) => [
      { value: PERIOD_LABEL[l.period], style: "text" as const },
      { value: l.category, style: "text" as const },
      { value: l.name, style: "text" as const },
      { value: l.budget, style: "money" as const },
      { value: l.isAsset ? "Ya" : "Tidak", style: "text" as const },
      { value: l.inRab ? "RAB Budget" : "Di luar RAB", style: "text" as const },
    ]),
  ];
  if (!lines.length) listRows.push([{ value: "Unit ini belum punya baris RAB Budget.", style: "note" }]);
  const nameList = lines.length ? `'${RAB_LIST_SHEET}'!$C$${FIRST_ROW}:$C$${FIRST_ROW + lines.length - 1}` : null;

  return buildWorkbook([
    {
      name: ACTUAL_SHEET,
      columns: [{ width: 14, style: "date" }, { width: 14, style: "text" }, { width: 24, style: "text" }, { width: 34, style: "text" }, { width: 18, style: "money" }, { width: 36, style: "text" }],
      rows,
      merges: ["A1:F1", "A2:F2"],
      rowHeights: { 2: 34 },
      freezeBelowRow: FIRST_ROW,
      lists: [
        { range: listRange("B"), options: [PERIOD_LABEL.weekly, PERIOD_LABEL.monthly] },
        ...(nameList ? [{ range: listRange("D"), source: nameList, strict: false }] : []),
      ],
    },
    { name: RAB_LIST_SHEET, columns: [{ width: 14 }, { width: 24 }, { width: 34 }, { width: 18 }, { width: 10 }, { width: 14 }], rows: listRows, merges: ["A1:F1", "A2:F2"], freezeBelowRow: FIRST_ROW },
    guideSheet(
      "Petunjuk — Template RAB Actual",
      [
        "Cara mengisi",
        "• Isi sheet “RAB Actual” mulai baris 5. Satu baris = satu biaya. Jangan ubah judul kolom di baris 4.",
        "• Tanggal: tanggal uang dibayar, paling aman ditulis tahun-bulan-tanggal (contoh 2026-11-03). Biaya masuk ke minggu tempat tanggal itu jatuh.",
        "• Keterangan Biaya: pilih atau salin dari sheet “Daftar RAB”. Kategori dan Jenis Biaya boleh kosong bila namanya ada di daftar.",
        "• Nama yang tidak ada di daftar menjadi baris baru di luar RAB; untuk itu Kategori dan Jenis Biaya wajib diisi.",
        "• Nominal: rupiah tanpa titik atau “Rp”. Catatan boleh kosong. Bukti bayar bisa ditambahkan nanti dari halaman RAB Actual.",
        "Penting",
        "• Biaya pada baris bertanda Aset otomatis tercatat juga di menu Aset.",
        "• Biaya dengan baris, tanggal, dan nominal yang sama dengan yang sudah tercatat dilewati, jadi file yang sama aman diunggah ulang.",
      ],
      {
        header: ACTUAL_COLUMNS.map((c) => c.header),
        rows: [
          [{ value: "2026-11-03", style: "text" }, "Mingguan", "Lapangan", "Sewa lapangan", { value: 3000000, style: "money" }, "Minggu pertama"],
          [{ value: "2026-11-03", style: "text" }, null, null, "Honor wasit", { value: 2000000, style: "money" }, "Kategori diambil dari Daftar RAB"],
          [{ value: "2026-11-05", style: "text" }, "Bulanan", "Peralatan", "Sound sistem", { value: 7250000, style: "money" }, null],
        ],
      },
    ),
  ]);
}
