/**
 * A small, dependency-free reader for the .xlsx workbooks the unit admins keep (Excel and WPS). It reads what the
 * importers need and nothing more: cell values and formulas, merged ranges, cell comments and the pictures
 * WPS embeds in cells with =DISPIMG("ID_…"). A workbook is a zip file, so the zip is read here as well.
 */
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

/* ── zip ───────────────────────────────────────────────────────────── */

type ZipEntry = { name: string; method: number; compressedSize: number; offset: number };

function readZip(buffer: Buffer) {
  // the end-of-central-directory record is within the last 64 KB (+22 bytes)
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65_557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip file (no end-of-central-directory record).");
  const count = buffer.readUInt16LE(eocd + 10);
  let pos = buffer.readUInt32LE(eocd + 16);
  const entries = new Map<string, ZipEntry>();
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(pos) !== 0x02014b50) throw new Error("Corrupt zip central directory.");
    const method = buffer.readUInt16LE(pos + 10);
    const compressedSize = buffer.readUInt32LE(pos + 20);
    const nameLength = buffer.readUInt16LE(pos + 28);
    const extraLength = buffer.readUInt16LE(pos + 30);
    const commentLength = buffer.readUInt16LE(pos + 32);
    const offset = buffer.readUInt32LE(pos + 42);
    const name = buffer.toString("utf8", pos + 46, pos + 46 + nameLength);
    entries.set(name, { name, method, compressedSize, offset });
    pos += 46 + nameLength + extraLength + commentLength;
  }
  const read = (name: string): Buffer | null => {
    const entry = entries.get(name);
    if (!entry) return null;
    const nameLength = buffer.readUInt16LE(entry.offset + 26);
    const extraLength = buffer.readUInt16LE(entry.offset + 28);
    const start = entry.offset + 30 + nameLength + extraLength;
    const raw = buffer.subarray(start, start + entry.compressedSize);
    if (entry.method === 0) return Buffer.from(raw);
    if (entry.method === 8) return inflateRawSync(raw);
    throw new Error(`Unsupported zip compression method ${entry.method} for ${name}.`);
  };
  return { names: [...entries.keys()], read };
}

/* ── xlsx ──────────────────────────────────────────────────────────── */

export type Cell = {
  ref: string;
  col: number;
  row: number;
  /** Cached result: number, text, or null when the cell only holds a picture. */
  value: string | number | null;
  formula: string | null;
  /** The WPS picture id of =DISPIMG("ID_…"), resolved through Workbook.images. */
  image: string | null;
};

export type Sheet = {
  name: string;
  cells: Map<string, Cell>;
  merges: string[];
  /** Comments by cell reference, with the author Excel stored. */
  comments: Map<string, { author: string; text: string }>;
  maxRow: number;
};

export type WorkbookImage = { id: string; mime: string; bytes: Buffer; description: string | null };
export type Workbook = { sheets: Sheet[]; images: Map<string, WorkbookImage> };

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");

// `<t>` / `<t xml:space="preserve">` only: a bare `<t[^>]*>` would also match the `<text>` wrapper of a comment
const textOf = (xml: string) => decode([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));

/** "AB12" → { col: 28, row: 12 } (columns count from 1). */
export function parseRef(ref: string) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) throw new Error(`Bad cell reference ${ref}`);
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col, row: Number(m[2]) };
}

export const colName = (col: number) => {
  let name = "";
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
};

const MIME: Record<string, string> = { jpeg: "image/jpeg", jpg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };

export function readWorkbook(path: string): Workbook {
  const zip = readZip(readFileSync(path));
  const text = (name: string) => zip.read(name)?.toString("utf8") ?? null;
  const rels = (name: string) => {
    const xml = text(name);
    const map = new Map<string, string>();
    if (xml) for (const m of xml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
      const id = /\bId="([^"]*)"/.exec(m[1])?.[1];
      const target = /\bTarget="([^"]*)"/.exec(m[1])?.[1];
      if (id && target) map.set(id, target);
    }
    return map;
  };
  /** A relationship target ("worksheets/sheet1.xml", "../comments1.xml", "/xl/…") as a path inside the zip. */
  const resolve = (base: string, target: string) => {
    if (target.startsWith("/")) return target.slice(1);
    const parts = base.split("/").slice(0, -1);
    for (const seg of target.split("/")) {
      if (seg === "..") parts.pop();
      else if (seg !== ".") parts.push(seg);
    }
    return parts.join("/");
  };

  const shared: string[] = [];
  const sharedXml = text("xl/sharedStrings.xml");
  if (sharedXml) for (const m of sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));

  /* pictures embedded in cells (WPS): ID_… → rId → media file */
  const images = new Map<string, WorkbookImage>();
  const cellImages = text("xl/cellimages.xml");
  if (cellImages) {
    const imageRels = rels("xl/_rels/cellimages.xml.rels");
    for (const m of cellImages.matchAll(/<xdr:cNvPr\b([^>]*)\/?>[\s\S]*?<a:blip r:embed="([^"]*)"/g)) {
      const id = /\bname="([^"]*)"/.exec(m[1])?.[1];
      const description = /\bdescr="([^"]*)"/.exec(m[1])?.[1] ?? null;
      const target = imageRels.get(m[2]);
      if (!id || !target) continue;
      const file = resolve("xl/cellimages.xml", target);
      const bytes = zip.read(file);
      if (!bytes) continue;
      const mime = MIME[file.split(".").pop()!.toLowerCase()];
      if (mime) images.set(id, { id, mime, bytes, description: description ? decode(description) : null });
    }
  }

  const workbookXml = text("xl/workbook.xml")!;
  const workbookRels = rels("xl/_rels/workbook.xml.rels");
  const sheets: Sheet[] = [];
  for (const m of workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = decode(/\bname="([^"]*)"/.exec(m[1])![1]);
    const rid = /\br:id="([^"]*)"/.exec(m[1])![1];
    const path = resolve("xl/workbook.xml", workbookRels.get(rid)!);
    const xml = text(path)!;
    const sheet: Sheet = { name, cells: new Map(), merges: [...xml.matchAll(/<mergeCell ref="([^"]*)"/g)].map((x) => x[1]), comments: new Map(), maxRow: 0 };

    for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const body = c[2] ?? "";
      const ref = /\br="([^"]*)"/.exec(attrs)?.[1];
      if (!ref) continue;
      const type = /\bt="([^"]*)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      const f = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(body)?.[1];
      const inline = /<is>([\s\S]*?)<\/is>/.exec(body)?.[1];
      let value: string | number | null = null;
      if (type === "s" && v !== undefined) value = shared[Number(v)] ?? null;
      else if (type === "inlineStr" && inline !== undefined) value = textOf(inline);
      else if (type === "str" && v !== undefined) value = decode(v);
      else if (v !== undefined && v !== "") value = type === "b" ? Number(v) : Number.isFinite(Number(v)) ? Number(v) : decode(v);
      const formula = f ? decode(f) : null;
      const image = /DISPIMG\("(ID_[0-9A-Fa-f]+)"/.exec(`${formula ?? ""} ${typeof value === "string" ? value : ""}`)?.[1] ?? null;
      if (value === null && !formula) continue;
      const { col, row } = parseRef(ref);
      sheet.cells.set(ref, { ref, col, row, value: image ? null : value, formula, image });
      sheet.maxRow = Math.max(sheet.maxRow, row);
    }

    const sheetRels = rels(path.replace(/([^/]+)$/, "_rels/$1.rels"));
    for (const target of sheetRels.values()) {
      if (!/comments\d*\.xml$/.test(target)) continue;
      const commentsXml = text(resolve(path, target));
      const authors = commentsXml ? [...commentsXml.matchAll(/<author>([\s\S]*?)<\/author>/g)].map((a) => decode(a[1])) : [];
      if (commentsXml) {
        for (const cm of commentsXml.matchAll(/<comment ref="([^"]*)"([^>]*)>([\s\S]*?)<\/comment>/g)) {
          const authorId = Number(/authorId="(\d+)"/.exec(cm[2])?.[1] ?? 0);
          sheet.comments.set(cm[1], { author: authors[authorId] ?? "", text: textOf(cm[3]).replace(/\s*\n\s*/g, " ").trim() });
        }
      }
    }
    sheets.push(sheet);
  }
  return { sheets, images };
}

/** Typed access to a sheet: `at("C5")`, `num("F5")`, `str("C5")`. */
export function sheetReader(sheet: Sheet) {
  const at = (ref: string) => sheet.cells.get(ref);
  const cell = (col: number | string, row: number) => at(`${typeof col === "number" ? colName(col) : col}${row}`);
  const num = (col: number | string, row: number) => {
    const v = cell(col, row)?.value;
    return typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
  };
  const str = (col: number | string, row: number) => {
    const v = cell(col, row)?.value;
    return v === null || v === undefined ? null : String(v).replace(/\s+/g, " ").trim() || null;
  };
  const image = (col: number | string, row: number) => cell(col, row)?.image ?? null;
  return { at, cell, num, str, image };
}
