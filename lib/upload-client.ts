"use client";

import type { MediaKind } from "@/lib/media";

export type UploadedMedia = {
  id: string;
  url: string;
  mimeType: string;
  size: number;
  fileName: string;
};

/**
 * Downscales large raster images in the browser before upload. GIFs (may be
 * animated) and PDFs pass through untouched. Never returns a bigger file.
 */
export async function shrinkImage(
  file: File,
  { maxSide = 1024, quality = 0.85 }: { maxSide?: number; quality?: number } = {},
): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 400 * 1024) {
    bitmap.close();
    return file;
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // JPEG for photos; WebP keeps transparency for PNG/WebP logos.
  const target = file.type === "image/jpeg" ? "image/jpeg" : "image/webp";
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, target, quality));
  if (!blob || blob.size >= file.size) return file;

  const ext = blob.type === "image/jpeg" ? "jpg" : blob.type.split("/")[1];
  const base = file.name.replace(/\.[^.]+$/, "") || "gambar";
  return new File([blob], `${base}.${ext}`, { type: blob.type });
}

export async function uploadMedia(file: File, kind: MediaKind, fallbackError: string): Promise<UploadedMedia> {
  const body = new FormData();
  body.set("file", file);
  body.set("kind", kind);
  const res = await fetch("/api/media", { method: "POST", body });
  const data = (await res.json().catch(() => ({}))) as Partial<UploadedMedia> & { error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? fallbackError);
  return data as UploadedMedia;
}
