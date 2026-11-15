/**
 * A small, dependency-free writer for the .xlsx templates the app hands out (RAB Budget, RAB Actual). It writes what a
 * template needs and nothing more: text, numbers, formulas, a few cell styles, column widths, a frozen header row and
 * drop-down lists. The zip around it is written here as well (deflate from node:zlib).
 */
import { deflateRawSync } from "node:zlib";

/* ── zip ───────────────────────────────────────────────────────────── */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  // a fixed timestamp (2026-01-01 00:00): the same template always gives the same bytes
  const time = 0;
  const date = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const packed = deflateRawSync(f.data);
    const crc = crc32(f.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // utf-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(f.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + packed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/* ── xlsx ──────────────────────────────────────────────────────────── */

/** Cell looks the templates use. */
export type CellStyle = "default" | "header" | "money" | "text" | "date" | "title" | "note" | "bold" | "moneyBold";
const STYLE_INDEX: Record<CellStyle, number> = { default: 0, header: 1, money: 2, text: 3, date: 4, title: 5, note: 6, bold: 7, moneyBold: 8 };

export type CellInput = string | number | null | undefined | { value?: string | number | null; formula?: string; style?: CellStyle };

export type SheetSpec = {
  name: string;
  /** Width (in characters) and the style empty cells of the column get, so what the person types is formatted too. */
  columns: { width: number; style?: CellStyle }[];
  rows: CellInput[][];
  /** Style for a whole row (cells may still set their own). */
  rowStyles?: Record<number, CellStyle>;
  /** Row heights in points, by 1-based row number (for a wrapped note in a merged cell). */
  rowHeights?: Record<number, number>;
  /** Rows above this one stay in view when scrolling (1-based: 2 freezes row 1). */
  freezeBelowRow?: number;
  /**
   * Drop-down lists: fixed `options` ({ range: "B2:B500", options: ["Mingguan", "Bulanan"] }) or a cell range `source`
   * ("'Daftar RAB'!$C$5:$C$40"). `strict: false` lets the person type something not in the list.
   */
  lists?: { range: string; options?: string[]; source?: string; strict?: boolean }[];
  merges?: string[];
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const colName = (col: number) => {
  let name = "";
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
};

function cellXml(ref: string, input: CellInput, rowStyle: CellStyle | undefined) {
  const cell = input !== null && typeof input === "object" ? input : { value: input };
  const style = STYLE_INDEX[cell.style ?? rowStyle ?? "default"];
  const s = style ? ` s="${style}"` : "";
  if (cell.formula) return `<c r="${ref}"${s}><f>${esc(cell.formula.replace(/^=/, ""))}</f></c>`;
  if (cell.value === null || cell.value === undefined || cell.value === "") return style ? `<c r="${ref}"${s}/>` : "";
  if (typeof cell.value === "number") return `<c r="${ref}"${s}><v>${cell.value}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(cell.value)}</t></is></c>`;
}

function sheetXml(sheet: SheetSpec) {
  const cols = sheet.columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"${c.style ? ` style="${STYLE_INDEX[c.style]}"` : ""}/>`)
    .join("");
  const rows = sheet.rows
    .map((cells, r) => {
      const rowStyle = sheet.rowStyles?.[r + 1];
      const body = cells.map((c, i) => cellXml(`${colName(i + 1)}${r + 1}`, c, rowStyle)).join("");
      const height = sheet.rowHeights?.[r + 1];
      return body ? `<row r="${r + 1}"${height ? ` ht="${height}" customHeight="1"` : ""}>${body}</row>` : "";
    })
    .join("");
  const freeze = sheet.freezeBelowRow
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.freezeBelowRow - 1}" topLeftCell="A${sheet.freezeBelowRow}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
  const merges = sheet.merges?.length ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : "";
  const lists = sheet.lists?.length
    ? `<dataValidations count="${sheet.lists.length}">${sheet.lists
        .map((l) => {
          const formula = l.source ? esc(l.source) : `"${esc((l.options ?? []).join(","))}"`;
          return `<dataValidation type="list" allowBlank="1" showErrorMessage="${l.strict === false ? 0 : 1}" sqref="${l.range}"><formula1>${formula}</formula1></dataValidation>`;
        })
        .join("")}</dataValidations>`
    : "";
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `${freeze}<sheetFormatPr defaultRowHeight="15"/>${cols ? `<cols>${cols}</cols>` : ""}<sheetData>${rows}</sheetData>${merges}${lists}` +
    `<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`
  );
}

const STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd"/></numFmts>` +
  `<fonts count="5">` +
  `<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>` +
  `<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>` +
  `<font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font>` +
  `<font><i/><sz val="10"/><color rgb="FF555555"/><name val="Calibri"/><family val="2"/></font>` +
  `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>` +
  `</fonts>` +
  `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FF000000"/><bgColor indexed="64"/></patternFill></fill></fills>` +
  `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>` +
  `<border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="9">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` + // default
  `<xf numFmtId="0" fontId="4" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>` + // header
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>` + // money
  `<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>` + // text
  `<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>` + // date
  `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` + // title
  `<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` + // note
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` + // bold
  `<xf numFmtId="164" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>` + // moneyBold
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

/** The bytes of an .xlsx workbook with these sheets (the first one opens first). Formulas are calculated when Excel opens it. */
export function buildWorkbook(sheets: SheetSpec[]): Buffer {
  const files: { name: string; data: Buffer }[] = [];
  const add = (name: string, xml: string) => files.push({ name, data: Buffer.from(xml, "utf8") });
  const head = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;

  add(
    "[Content_Types].xml",
    head +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      `</Types>`,
  );
  add(
    "_rels/.rels",
    head +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`,
  );
  add(
    "xl/workbook.xml",
    head +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<bookViews><workbookView activeTab="0"/></bookViews><sheets>` +
      sheets.map((s, i) => `<sheet name="${esc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
      `</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
  );
  add(
    "xl/_rels/workbook.xml.rels",
    head +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>`,
  );
  add("xl/styles.xml", STYLES);
  sheets.forEach((s, i) => add(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)));
  return zip(files);
}
