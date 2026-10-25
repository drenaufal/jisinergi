import { z } from "zod";
import type { TFunction } from "@/lib/i18n/translate";

/* Shared (client + server) helpers for uploaded media. */

export const MEDIA_PREFIX = "/api/media/";
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const DOCUMENT_TYPES = [...IMAGE_TYPES, "application/pdf"];

export type MediaKind = "image" | "document";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: string) {
  return UUID_RE.test(s);
}

export function mediaUrl(id: string) {
  return `${MEDIA_PREFIX}${id}`;
}

/** Returns the media id when `url` points at our own media endpoint. */
export function mediaIdFromUrl(url: string | null | undefined): string | null {
  if (!url || !url.startsWith(MEDIA_PREFIX)) return null;
  const id = url.slice(MEDIA_PREFIX.length);
  return isUuid(id) ? id : null;
}

/** Form field for a photo / logo: empty, an uploaded media URL, or an external http(s) URL. */
export const imageUrlField = (t: TFunction) =>
  z
    .string()
    .trim()
    .refine(
      (v) => v === "" || mediaIdFromUrl(v) !== null || /^https?:\/\/\S+$/i.test(v),
      t("URL gambar tidak valid"),
    )
    .optional();

/** Form field for a private document: empty or an uploaded media URL only. */
export const documentUrlField = (t: TFunction) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || mediaIdFromUrl(v) !== null, t("Dokumen tidak valid — unggah ulang"))
    .optional();

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
