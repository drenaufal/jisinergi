"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ProofChip } from "@/components/finance/bits";
import { useI18n } from "@/lib/i18n/client";
import { AddRecordButton, DeleteRecordButton, EditRecordButton, type FinanceRecord, type FormContext } from "../forms";

export type DetailStudent = {
  id: string;
  name: string;
  nickname: string | null;
  nik: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  parentPhone: string | null;
  joinedOn: string;
  jerseyNumber: number | null;
  jerseySize: string | null;
  sizeType: string | null;
  note: string | null;
};

export type DetailPayment = {
  id: string;
  kind: "registration" | "monthly";
  kindLabel: string;
  paidOn: string;
  /** The month (YYYY-MM) the payment pays for, if any. */
  month: string | null;
  amount: number;
  discount: number;
  proofUrl: string | null;
  note: string | null;
  record: FinanceRecord;
};

/**
 * The child's name in the student list. The table only shows the essentials; clicking the name opens everything
 * else: identity, contact, jersey, note and the child's payment history, with the buttons to pay or edit.
 */
export function StudentDetail({
  student,
  record,
  payments,
  ctx,
  canInput,
  canDelete,
  hasRegistration,
}: {
  student: DetailStudent;
  record: FinanceRecord;
  payments: DetailPayment[];
  ctx: FormContext;
  canInput: boolean;
  canDelete: boolean;
  hasRegistration: boolean;
}) {
  const { t, fmt } = useI18n();
  const [open, setOpen] = useState(false);
  const total = payments.reduce((a, p) => a + p.amount, 0);
  const monthLabel = (m: string) => fmt.date(`${m}-01`, { month: "short", year: "2-digit" });
  const dash = "—";

  const facts: { label: string; value: React.ReactNode }[] = [
    { label: t("Nama panggilan"), value: student.nickname || dash },
    { label: t("NIK / kode"), value: student.nik || dash },
    {
      label: t("Tempat, tanggal lahir"),
      value: [student.birthPlace, student.birthDate ? fmt.date(student.birthDate) : null].filter(Boolean).join(", ") || dash,
    },
    { label: t("Telepon orang tua"), value: student.parentPhone ? <a className="underline decoration-ink/30 underline-offset-2 hover:decoration-ink" href={`tel:${student.parentPhone}`}>{student.parentPhone}</a> : dash },
    { label: t("Tanggal bergabung"), value: fmt.date(student.joinedOn) },
    { label: t("No punggung"), value: student.jerseyNumber ?? dash },
    { label: t("Ukuran jersey"), value: [student.jerseySize, student.sizeType].filter(Boolean).join(" · ") || dash },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t("Lihat detail siswa")}
        className="text-left font-medium text-ink underline decoration-ink/30 underline-offset-2 transition-colors hover:decoration-ink"
      >
        {student.name}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl" title={student.name} description={t("Detail siswa dan riwayat pembayarannya.")}>
          <div className="space-y-5">
            <dl className="grid gap-px border border-ink bg-ink sm:grid-cols-2">
              {facts.map((f) => (
                <div key={f.label} className="bg-white px-3 py-2.5">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">{f.label}</dt>
                  <dd className="mt-0.5 text-sm tabular-nums text-ink">{f.value}</dd>
                </div>
              ))}
              <div className="bg-black px-3 py-2.5 text-white">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-white/70">{t("Total dibayar")}</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums">{fmt.rupiah(total)}</dd>
              </div>
              {student.note && (
                <div className="bg-surface-2 px-3 py-2.5 sm:col-span-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">{t("Catatan")}</dt>
                  <dd className="mt-0.5 whitespace-pre-line text-sm text-ink">{student.note}</dd>
                </div>
              )}
            </dl>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink">{t("Riwayat pembayaran")}</p>
              {payments.length === 0 ? (
                <p className="border border-dashed border-ink/40 px-4 py-6 text-center text-xs text-ink-muted">{t("Belum ada pembayaran untuk siswa ini.")}</p>
              ) : (
                <div className="overflow-x-auto border border-line">
                  <table className="w-full min-w-[34rem] border-collapse text-sm">
                    <thead className="bg-surface-2 text-[10.5px] font-semibold uppercase tracking-wider text-ink-muted">
                      <tr>
                        <th className="px-3 py-2 text-left">{t("Tanggal")}</th>
                        <th className="px-3 py-2 text-left">{t("Jenis")}</th>
                        <th className="px-3 py-2 text-left">{t("Untuk bulan")}</th>
                        <th className="px-3 py-2 text-right">{t("Uang dibayar")}</th>
                        <th className="px-3 py-2 text-left">{t("Bukti")}</th>
                        {(canInput || canDelete) && <th className="w-20 px-2"><span className="sr-only">{t("Aksi")}</span></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.id} className="border-t border-line-soft align-top">
                          <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                            {fmt.date(p.paidOn)}
                            {p.note && <span className="block max-w-[14rem] whitespace-normal text-[11px] text-ink-muted">{p.note}</span>}
                          </td>
                          <td className="px-3 py-2"><Badge tone={p.kind === "monthly" ? "neutral" : "info"}>{p.kindLabel}</Badge></td>
                          <td className="whitespace-nowrap px-3 py-2">{p.month ? monthLabel(p.month) : dash}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            <span className="font-medium text-ink">{fmt.rupiah(p.amount)}</span>
                            {p.discount > 0 && <span className="block text-[11px] text-ink-muted">{t("Diskon")} {fmt.rupiah(p.discount)}</span>}
                          </td>
                          <td className="px-3 py-2"><ProofChip url={p.proofUrl} viewLabel={t("Lihat bukti")} missingLabel={t("Belum ada bukti")} compact /></td>
                          {(canInput || canDelete) && (
                            <td className="px-2 py-1">
                              <div className="flex justify-end gap-0.5">
                                {canInput && <EditRecordButton kind="payment" record={p.record} ctx={ctx} />}
                                {canDelete && <DeleteRecordButton kind="payment" id={p.id} name={`${student.name} · ${p.kindLabel}`} />}
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {canInput && (
              <div className="flex flex-wrap items-center gap-2">
                <AddRecordButton kind="payment" ctx={ctx} preset={{ studentId: student.id, kind: hasRegistration ? "monthly" : "registration" }}>
                  {t("Bayar")}
                </AddRecordButton>
                <EditRecordButton
                  kind="student"
                  record={record}
                  ctx={ctx}
                  label={t("Ubah data siswa")}
                  className="inline-flex h-8 items-center gap-1.5 border border-ink px-3 text-xs font-semibold text-ink transition-colors hover:bg-ink hover:text-white"
                >
                  {t("Ubah data siswa")}
                </EditRecordButton>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
