import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { mediaIdFromUrl, type MediaKind } from "@/lib/media";

export async function saveMedia(input: {
  kind: MediaKind;
  fileName: string | null;
  mimeType: string;
  bytes: ArrayBuffer;
  uploadedBy: string | null;
}) {
  const id = crypto.randomUUID();
  await db
    .insert(media)
    .values({
      id,
      kind: input.kind,
      fileName: input.fileName,
      mimeType: input.mimeType,
      size: input.bytes.byteLength,
      data: Buffer.from(input.bytes).toString("base64"),
      uploadedBy: input.uploadedBy,
    });
  return id;
}

export async function getMedia(id: string) {
  return db.query.media.findFirst({ where: eq(media.id, id) });
}

/** Metadata only (no payload) for a media URL — used to render document cards. */
export async function getMediaMeta(url: string | null | undefined) {
  const id = mediaIdFromUrl(url);
  if (!id) return null;
  const row = await db.query.media.findFirst({
    where: eq(media.id, id),
    columns: { id: true, kind: true, fileName: true, mimeType: true, size: true, createdAt: true },
  });
  return row ?? null;
}

/**
 * Deletes media rows that a record no longer references (e.g. a replaced
 * photo). External URLs are ignored.
 */
export async function releaseMedia(...urls: (string | null | undefined)[]) {
  const ids = urls.map(mediaIdFromUrl).filter((id): id is string => !!id);
  if (!ids.length) return;
  try {
    await db.delete(media).where(inArray(media.id, ids));
  } catch (e) {
    console.error("media cleanup failed", e);
  }
}

/** Release `prev` only when it was replaced by something else. */
export async function releaseReplaced(prev: string | null | undefined, next: string | null | undefined) {
  if (prev && prev !== next) await releaseMedia(prev);
}
