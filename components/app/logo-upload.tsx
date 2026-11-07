"use client";

import * as React from "react";
import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { IMAGE_TYPES, MAX_UPLOAD_BYTES, formatBytes } from "@/lib/media";
import { shrinkImage, uploadMedia } from "@/lib/upload-client";
import { useT } from "@/lib/i18n/client";

/**
 * Logo of a business unit. Uploads the picture as an `image` media row and posts its URL in a hidden input
 * (empty = no logo). Big pictures are scaled down in the browser before they are sent.
 */
export function LogoUpload({
  name,
  label,
  hint,
  defaultValue,
  error: fieldError,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultValue?: string | null;
  error?: string;
}) {
  const t = useT();
  const [url, setUrl] = React.useState(defaultValue ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFile = async (picked: File | undefined) => {
    if (!picked) return;
    setError(null);
    if (!IMAGE_TYPES.includes(picked.type)) {
      setError(t("Format harus JPG, PNG, WEBP, atau GIF."));
      return;
    }
    setBusy(true);
    try {
      const file = await shrinkImage(picked, { maxSide: 512, quality: 0.9 });
      if (file.size > MAX_UPLOAD_BYTES) throw new Error(t("Ukuran maksimal {size}.", { size: formatBytes(MAX_UPLOAD_BYTES) }));
      const res = await uploadMedia(file, "image", t("Gagal mengunggah berkas."));
      setUrl(res.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Gagal mengunggah berkas."));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const shownError = error ?? fieldError;

  return (
    <div>
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-ink">{label}</span>
      <div className="flex items-center gap-3">
        <span className="grid size-16 shrink-0 place-items-center overflow-hidden border border-line bg-surface-2 text-ink-muted">
          {busy ? (
            <Loader2 className="size-5 animate-spin" />
          ) : url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={label} className="size-full bg-white object-contain" />
          ) : (
            <ImagePlus className="size-6" />
          )}
        </span>
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="inline-flex h-8 items-center gap-1.5 border border-ink px-3 text-xs font-semibold text-ink transition-colors hover:bg-ink hover:text-white disabled:opacity-50"
            >
              <Upload className="size-3.5" /> {url ? t("Ganti logo") : t("Unggah logo")}
            </button>
            {url && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setUrl("")}
                className="inline-flex h-8 items-center gap-1.5 border border-line px-3 text-xs font-medium text-ink-secondary transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
              >
                <Trash2 className="size-3.5" /> {t("Hapus logo")}
              </button>
            )}
          </div>
          <p className="text-[11px] text-ink-muted">{hint ?? t("JPG, PNG, WEBP, atau GIF · maks {size}. Logo persegi paling pas.", { size: formatBytes(MAX_UPLOAD_BYTES) })}</p>
        </div>
      </div>
      {shownError && <p className="mt-1 text-[11px] font-semibold text-ink">⚠ {shownError}</p>}
      <input ref={inputRef} type="file" accept={IMAGE_TYPES.join(",")} className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      <input type="hidden" name={name} value={url} />
    </div>
  );
}
