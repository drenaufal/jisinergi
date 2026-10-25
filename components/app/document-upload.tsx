"use client";

import * as React from "react";
import { ExternalLink, FileText, Loader2, Upload, X, IdCard } from "lucide-react";
import { DOCUMENT_TYPES, MAX_UPLOAD_BYTES, formatBytes } from "@/lib/media";
import { shrinkImage, uploadMedia } from "@/lib/upload-client";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

export type DocumentMeta = { fileName: string | null; mimeType: string; size: number };

/**
 * Private document field (KIA, KK, akta, ijazah, rapor …). Accepts images or PDF, uploads as a
 * `document` media row (only verifiers can open it) and writes the URL into a
 * hidden input.
 */
export function DocumentUpload({
  name,
  label,
  hint,
  defaultValue,
  defaultMeta,
  error: fieldError,
  icon: DocIcon = IdCard,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultValue?: string | null;
  defaultMeta?: DocumentMeta | null;
  error?: string;
  /** Glyph shown in the empty state (defaults to an ID card). */
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const t = useT();
  const [url, setUrl] = React.useState(defaultValue ?? "");
  const [meta, setMeta] = React.useState<DocumentMeta | null>(defaultMeta ?? null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [drag, setDrag] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFile = async (picked: File | undefined) => {
    if (!picked) return;
    setError(null);
    if (!DOCUMENT_TYPES.includes(picked.type)) {
      setError(t("Format harus JPG, PNG, WEBP, atau PDF."));
      return;
    }
    setBusy(true);
    try {
      // Keep scans legible: larger max side than profile photos.
      const file = await shrinkImage(picked, { maxSide: 2000, quality: 0.88 });
      if (file.size > MAX_UPLOAD_BYTES) throw new Error(t("Ukuran maksimal {size}.", { size: formatBytes(MAX_UPLOAD_BYTES) }));
      const res = await uploadMedia(file, "document", t("Gagal mengunggah berkas."));
      setUrl(res.url);
      setMeta({ fileName: res.fileName, mimeType: res.mimeType, size: res.size });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Gagal mengunggah dokumen."));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const isPdf = meta?.mimeType === "application/pdf";
  const shownError = error ?? fieldError;

  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-ink-secondary">{label}</span>
      {url ? (
        <div className="flex items-center gap-3 border border-line bg-surface-2 p-3">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="grid h-14 w-20 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-base"
          >
            {isPdf ? (
              <FileText className="size-6 text-ink-muted" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={label} className="h-full w-full object-cover" />
            )}
          </a>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-ink">{meta?.fileName ?? t("Dokumen terunggah")}</p>
            <p className="text-[11px] text-ink-muted">
              {meta ? `${isPdf ? "PDF" : t("Gambar")} · ${formatBytes(meta.size)}` : t("Tersimpan")}
            </p>
            <div className="mt-1 flex flex-wrap gap-3 text-[11px]">
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-ink-secondary hover:text-ink"
              >
                <ExternalLink className="size-3" /> {t("Lihat")}
              </a>
              <button
                type="button"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
                className="inline-flex items-center gap-1 text-ink-secondary hover:text-ink"
              >
                {busy ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />} {t("Ganti::berkas")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setUrl("");
                  setMeta(null);
                }}
                className="inline-flex items-center gap-1 text-ink-secondary hover:text-danger"
              >
                <X className="size-3" /> {t("Hapus")}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            handleFile(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl border border-dashed p-3 text-left transition-colors",
            drag ? "border-brand/60 bg-brand/5" : "border-line hover:border-brand/40 hover:bg-surface-2/40",
          )}
        >
          <span className="grid h-14 w-20 shrink-0 place-items-center rounded-md border border-line bg-surface-2 text-ink-muted">
            {busy ? <Loader2 className="size-5 animate-spin text-brand" /> : <DocIcon className="size-6" />}
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-medium text-ink">
              {busy ? t("Mengunggah…") : t("Unggah scan / foto dokumen")}
            </span>
            <span className="block text-[11px] text-ink-muted">
              {hint ?? t("JPG, PNG, WEBP, atau PDF · maks {size}", { size: formatBytes(MAX_UPLOAD_BYTES) })}
            </span>
          </span>
        </button>
      )}
      {shownError && <p className="mt-1 text-[11px] text-danger">{shownError}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={DOCUMENT_TYPES.join(",")}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <input type="hidden" name={name} value={url} />
    </div>
  );
}
