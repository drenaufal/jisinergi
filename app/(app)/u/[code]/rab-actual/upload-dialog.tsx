"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import type { UploadPreview } from "@/lib/finance/rab-actual-import";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

type Response = { preview?: UploadPreview; imported?: unknown; error?: string };

/**
 * "Unggah Excel": load a RAB Actual workbook ("file RAB Actual.xlsx") into this unit. The file is read and checked first
 * (preview, nothing saved); only "Simpan ke RAB Actual" writes it. Loading the same file twice does not double the costs.
 */
export function RabActualUpload({ unitId, unitStartsOn }: { unitId: string; unitStartsOn: string | null }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [startsOn, setStartsOn] = useState("");
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setStartsOn("");
    setPreview(null);
    setError(null);
    setBusy(null);
    if (input.current) input.current.value = "";
  };
  const close = () => {
    setOpen(false);
    reset();
  };

  async function send(mode: "preview" | "import") {
    if (!file) return;
    setBusy(mode);
    setError(null);
    try {
      const body = new FormData();
      body.set("unitId", unitId);
      body.set("mode", mode);
      body.set("file", file);
      if (startsOn) body.set("startsOn", startsOn);
      const res = await fetch("/api/finance/rab-actual-upload", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as Response;
      if (!res.ok || data.error) throw new Error(data.error ?? t("Gagal memproses berkas."));
      if (mode === "preview") setPreview(data.preview ?? null);
      else {
        toast.success(t("RAB Actual dari Excel disimpan"));
        close();
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Gagal memproses berkas."));
      if (mode === "preview") setPreview(null);
    } finally {
      setBusy(null);
    }
  }

  const s = preview?.summary;
  const row = (label: string, value: string, hint?: string) => (
    <div className="flex items-baseline justify-between gap-3 px-3 py-2">
      <dt className="text-ink-secondary">
        {label}
        {hint && <span className="block text-[11px] text-ink-muted">{hint}</span>}
      </dt>
      <dd className="shrink-0 text-right font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Upload className="size-3.5" /> {t("Unggah Excel")}
      </Button>
      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
        <DialogContent
          className="max-w-xl"
          title={t("Unggah RAB Actual dari Excel")}
          description={t("Pakai file Excel RAB Actual seperti contohnya: RAB di sebelah kiri, biaya Week 1 dan seterusnya di kanan. File diperiksa dulu sebelum disimpan.")}
        >
          <div className="space-y-5">
            <Field label={t("File Excel (.xlsx)")} hint={t("Maksimal 8 MB. Kolom Week hanya menyebut nomor minggu, bukan tanggal.")}>
              <label className="flex cursor-pointer items-center gap-3 border border-dashed border-ink/50 p-3 transition-colors hover:border-ink hover:bg-surface-2/50">
                <span className="grid size-10 shrink-0 place-items-center border border-line bg-surface-2 text-ink-muted">
                  <FileSpreadsheet className="size-5" />
                </span>
                <span className="min-w-0 text-xs">
                  <span className="block truncate font-semibold text-ink">{file ? file.name : t("Pilih file Excel")}</span>
                  <span className="text-ink-muted">{file ? `${(file.size / 1024).toFixed(0)} KB` : t("Klik untuk memilih berkas")}</span>
                </span>
                <input
                  ref={input}
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="sr-only"
                  disabled={busy !== null}
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setPreview(null);
                    setError(null);
                  }}
                />
              </label>
            </Field>

            {unitStartsOn ? (
              <p className="text-xs text-ink-muted">
                {t("Minggu 1 dimulai {date} (tanggal mulai program unit ini).", { date: fmt.date(unitStartsOn, { day: "numeric", month: "long", year: "numeric" }) })}
              </p>
            ) : (
              <Field label={t("Tanggal mulai minggu 1")} hint={t("Unit ini belum punya tanggal mulai program. Tanggal ini disimpan sebagai tanggal mulai program dan dipakai menaruh biaya di minggu yang benar.")}>
                <Input
                  type="date"
                  value={startsOn}
                  disabled={busy !== null}
                  onChange={(e) => {
                    setStartsOn(e.target.value);
                    setPreview(null);
                  }}
                />
              </Field>
            )}

            {error && (
              <p role="alert" className="flex gap-2 border border-ink bg-surface-2 px-3 py-2 text-xs font-semibold text-ink">
                <XCircle className="mt-px size-4 shrink-0" /> {error}
              </p>
            )}

            {preview && s && (
              <div className="space-y-3">
                <dl className="divide-y divide-line border border-line text-sm">
                  {row(t("Baris RAB di file"), fmt.number(s.lines.total), t("{weekly} mingguan · {monthly} bulanan · {asset} ditandai Aset", { weekly: s.lines.weekly, monthly: s.lines.monthly, asset: s.lines.asset }))}
                  {row(t("Baris RAB baru"), fmt.number(s.lines.created), t("{n} sudah ada di unit ini", { n: s.lines.existing }))}
                  {s.extras.total > 0 && row(t("Baris di luar RAB"), fmt.number(s.extras.total), t("{created} baru · {existing} sudah ada", { created: s.extras.created, existing: s.extras.existing }))}
                  {row(t("Biaya actual di file"), fmt.number(s.costs.total), fmt.rupiah(s.costs.amount))}
                  {row(t("Akan disimpan"), fmt.number(s.costs.imported), fmt.rupiah(s.costs.importedAmount))}
                  {s.costs.duplicates > 0 && row(t("Sudah tercatat (dilewati)"), fmt.number(s.costs.duplicates), t("Baris, tanggal, dan nominal yang sama"))}
                </dl>

                {preview.assetCosts > 0 && (
                  <p className="border border-line bg-surface-2 px-3 py-2 text-xs text-ink-secondary">
                    {t("{n} biaya ada di baris bertanda Aset, jadi otomatis tercatat juga di menu Aset.", { n: preview.assetCosts })}
                  </p>
                )}

                {preview.checks.length > 0 && (
                  <ul className="space-y-1 text-xs">
                    {preview.checks.map((c) => (
                      <li key={c.label} className="flex items-start gap-2">
                        {c.ok ? <CheckCircle2 className="mt-px size-3.5 shrink-0 text-ink" /> : <XCircle className="mt-px size-3.5 shrink-0 text-ink" />}
                        <span className={cn(c.ok ? "text-ink-secondary" : "font-semibold text-ink")}>
                          {c.label}: {fmt.rupiah(c.actual)}
                          {!c.ok && ` (${t("di file")} ${fmt.rupiah(c.expected)})`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {preview.warnings.length > 0 && (
                  <ul className="space-y-1 border border-line px-3 py-2 text-[11px] text-ink-secondary">
                    {preview.warnings.map((w, i) => (
                      <li key={i} className="flex gap-2">
                        <AlertTriangle className="mt-px size-3 shrink-0" /> {w}
                      </li>
                    ))}
                  </ul>
                )}

                {preview.problems.length > 0 && (
                  <ul role="alert" className="space-y-1 border border-ink bg-surface-2 px-3 py-2 text-xs font-semibold text-ink">
                    {preview.problems.map((p, i) => (
                      <li key={i} className="flex gap-2">
                        <XCircle className="mt-px size-4 shrink-0" /> {p}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-wrap items-center gap-2 border-t border-line bg-surface px-6 py-3">
              {!preview ? (
                <Button type="button" disabled={!file || busy !== null || (!unitStartsOn && !startsOn)} onClick={() => send("preview")}>
                  {busy === "preview" ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
                  {busy === "preview" ? t("Memeriksa…") : t("Periksa file")}
                </Button>
              ) : (
                <Button type="button" disabled={busy !== null || preview.problems.length > 0} onClick={() => send("import")}>
                  {busy === "import" ? <Loader2 className="animate-spin" /> : <Upload />}
                  {busy === "import" ? t("Menyimpan…") : t("Simpan ke RAB Actual")}
                </Button>
              )}
              <Button type="button" variant="ghost" onClick={close} disabled={busy !== null}>
                {t("Batal")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
