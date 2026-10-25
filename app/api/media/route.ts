import { NextResponse } from "next/server";
import { actionUser } from "@/lib/auth/session";
import { saveMedia } from "@/lib/media-store";
import {
  DOCUMENT_TYPES,
  IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  formatBytes,
  mediaUrl,
  type MediaKind,
} from "@/lib/media";
import { getT } from "@/lib/i18n/server";

/** Checks the leading bytes so the stored payload really is what its MIME type claims. */
function matchesSignature(bytes: Uint8Array, mime: string) {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  switch (mime) {
    case "image/jpeg":
      return starts(0xff, 0xd8, 0xff);
    case "image/png":
      return starts(0x89, 0x50, 0x4e, 0x47);
    case "image/gif":
      return starts(0x47, 0x49, 0x46, 0x38);
    case "image/webp":
      return starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    case "application/pdf":
      return starts(0x25, 0x50, 0x44, 0x46);
    default:
      return false;
  }
}

export async function POST(req: Request) {
  const t = await getT();
  let user;
  try {
    // Uploads happen inside the data forms, so anyone who may input data may attach a receipt.
    user = await actionUser("input");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : t("Akses ditolak") },
      { status: 403 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: t("Format unggahan tidak valid.") }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: t("Berkas tidak ditemukan.") }, { status: 400 });
  }

  const kind: MediaKind = form.get("kind") === "document" ? "document" : "image";
  const allowed = kind === "document" ? DOCUMENT_TYPES : IMAGE_TYPES;
  if (!allowed.includes(file.type)) {
    return NextResponse.json(
      {
        error:
          kind === "document"
            ? t("Format harus JPG, PNG, WEBP, atau PDF.")
            : t("Format harus JPG, PNG, WEBP, atau GIF."),
      },
      { status: 415 },
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: t("Ukuran maksimal {size}.", { size: formatBytes(MAX_UPLOAD_BYTES) }) },
      { status: 413 },
    );
  }

  const bytes = await file.arrayBuffer();
  if (!matchesSignature(new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength)), file.type)) {
    return NextResponse.json({ error: t("Isi berkas tidak sesuai formatnya.") }, { status: 415 });
  }

  const id = await saveMedia({
    kind,
    fileName: file.name ? file.name.slice(0, 200) : null,
    mimeType: file.type,
    bytes,
    uploadedBy: user.id,
  });

  return NextResponse.json({
    id,
    url: mediaUrl(id),
    mimeType: file.type,
    size: file.size,
    fileName: file.name,
  });
}
