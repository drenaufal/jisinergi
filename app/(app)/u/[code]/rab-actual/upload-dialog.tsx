"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, XCircle } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import type { UploadPreview, UploadTarget } from "@/lib/finance/rab-actual-import";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

type Response = { preview?: UploadPreview; imported?: unknown; error?: string };

/**
 * "Import Excel" for RAB Budget and RAB Actual: download the template made for this unit, fill it in, upload it. The
 * file is read and checked first (preview, nothing saved); only "Simpan" writes it. Loading the same file twice does
 * not double anything. RAB Actual also still takes the old "file RAB Actual.xlsx" workbook (Week columns).
 */
export function RabExcelUpload({ unitId, unitStartsOn, target }: { unitId: string; unitStartsOn: string | null; target: UploadTarget }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [startsOn, setStartsOn] = useState("");
  const [askStart, setAskStart] = useState(false);
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const isBudget = target === "budget";
  const menu = isBudget ? t("RAB Budget") : t("RAB Actual");
  const templateHref = `/api/finance/rab-template?unitId=${encodeURIComponent(unitId)}&kind=${target}`;

  const reset = () => {
    setFile(null);
    setStartsOn("");
    setAskStart(false);
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
      body.set("target", target);
      body.set("mode", mode);
      body.set("file", file);
      if (startsOn) body.set("startsOn", startsOn);
      const res = await fetch("/api/finance/rab-actual-upload", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as Response;
      if (!res.ok || data.error) throw new Error(data.error ?? t("Gagal memproses berkas."));
      if (mode === "preview") {
        setPreview(data.preview ?? null);
        if (data.preview?.needsStartsOn) setAskStart(true);
      } else {
        toast.success(isBudget ? t("RAB Budget dari Excel disimpan") : t("RAB Actual dari Excel disimpan"));
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
  const legacy = preview?.format === "legacy";
  const row = (label: string, value: string, hint?: string) => (
    <div className="flex items-baseline justify-between gap-3 px-3 py-2">
      <dt className="text-ink-secondary">
        {label}
        {hint && <span className="block text-[11px] text-ink-muted">{hint}</span>}
      </dt>
      <dd className="shrink-0 text-right font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
  const step = (n: number, title: string) => (
    <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink">
      <span className="grid size-5 place-items-center bg-black text-[11px] text-white">{n}</span>
      {title}
    </p>
  );

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <FileSpreadsheet className="size-3.5" /> {t("Import Excel")}
      </Button>
      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
        <DialogContent
          className="max-w-xl"
          title={t("Import {menu} dari Excel", { menu })}
          description={
            isBudget
              ? t("Unduh template, isi satu baris per baris RAB, lalu unggah. File diperiksa dulu sebelum disimpan. Baris yang sudah ada dilewati.")
              : t("Unduh template, isi satu baris per biaya (dengan tanggalnya), lalu unggah. File diperiksa dulu sebelum disimpan.")
          }
        >
          <div className="space-y-5">
            <div>
              {step(1, t("Unduh template"))}
              <div className="flex flex-wrap items-center gap-3 border border-line p-3">
                <a href={templateHref} download className={buttonClass({ variant: "outline", size: "sm" })}>
                  <Download className="size-3.5" /> {isBudget ? t("Template RAB Budget (.xlsx)") : t("Template RAB Actual (.xlsx)")}
                </a>
                <p className="min-w-0 flex-1 text-[11px] text-ink-muted">
                  {isBudget
                    ? t("Kolom: Jenis Biaya, Kategori, Nama Biaya, Jumlah Satuan, Harga Satuan, Aset, Catatan. Petunjuk dan contoh ada di sheet “Petunjuk”.")
                    : t("Kolom: Tanggal, Jenis Biaya, Kategori, Keterangan Biaya, Nominal, Catatan. Sheet “Daftar RAB” berisi nama baris RAB unit ini.")}
                </p>
              </div>
            </div>

            <div>
              {step(2, t("Unggah file yang sudah diisi"))}
              <Field label={t("File Excel (.xlsx)")} hint={isBudget ? t("Maksimal 8 MB.") : t("Maksimal 8 MB. File RAB Actual format lama (kolom Week 1, Week 2, …) juga diterima.")}>
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
                      setAskStart(false);
                      setError(null);
                    }}
                  />
                </label>
              </Field>
            </div>

            {!isBudget && askStart && !unitStartsOn && (
              <Field label={t("Tanggal mulai minggu 1")} hint={t("File ini format lama: hanya menyebut “Week n”, tanpa tanggal. Tanggal ini disimpan sebagai tanggal mulai program unit dan dipakai menaruh biaya di minggu yang benar.")}>
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
                  {isBudget ? (
                    <>
                      {row(t("Baris RAB di file"), fmt.number(s.lines.total), t("{weekly} mingguan · {monthly} bulanan · {asset} ditandai Aset", { weekly: s.lines.weekly, monthly: s.lines.monthly, asset: s.lines.asset }))}
                      {row(t("Akan ditambahkan"), fmt.number(s.lines.created))}
                      {s.lines.existing > 0 && row(t("Sudah ada (dilewati)"), fmt.number(s.lines.existing), t("Jenis, kategori, dan nama yang sama"))}
                    </>
                  ) : (
                    <>
                      {legacy && row(t("Baris RAB di file"), fmt.number(s.lines.total), t("{weekly} mingguan · {monthly} bulanan · {asset} ditandai Aset", { weekly: s.lines.weekly, monthly: s.lines.monthly, asset: s.lines.asset }))}
                      {legacy && row(t("Baris RAB baru"), fmt.number(s.lines.created), t("{n} sudah ada di unit ini", { n: s.lines.existing }))}
                      {s.extras.created > 0 && row(t("Baris baru di luar RAB"), fmt.number(s.extras.created), t("Nama yang tidak ada di RAB Budget"))}
                      {row(t("Biaya actual di file"), fmt.number(s.costs.total), fmt.rupiah(s.costs.amount))}
                      {row(t("Akan disimpan"), fmt.number(s.costs.imported), fmt.rupiah(s.costs.importedAmount))}
                      {s.costs.duplicates > 0 && row(t("Sudah tercatat (dilewati)"), fmt.number(s.costs.duplicates), t("Baris, tanggal, dan nominal yang sama"))}
                    </>
                  )}
                </dl>

                {preview.assetCosts > 0 && (
                  <p className="border border-line bg-surface-2 px-3 py-2 text-xs text-ink-secondary">
                    {t("{n} biaya ada di baris bertanda Aset, jadi otomatis tercatat juga di menu Aset.", { n: preview.assetCosts })}
                  </p>
                )}
                {isBudget && s.lines.created > 0 && (
                  <p className="border border-line bg-surface-2 px-3 py-2 text-xs text-ink-secondary">
                    {t("Baris RAB Budget yang sudah disimpan tidak dapat diubah lagi. Periksa dulu angka di file sebelum menyimpan.")}
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

            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
              {!preview ? (
                <Button type="button" disabled={!file || busy !== null || (askStart && !unitStartsOn && !startsOn)} onClick={() => send("preview")}>
                  {busy === "preview" ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
                  {busy === "preview" ? t("Memeriksa…") : t("Periksa file")}
                </Button>
              ) : (
                <Button type="button" disabled={busy !== null || preview.problems.length > 0} onClick={() => send("import")}>
                  {busy === "import" ? <Loader2 className="animate-spin" /> : <Upload />}
                  {busy === "import" ? t("Menyimpan…") : t("Simpan ke {menu}", { menu })}
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
