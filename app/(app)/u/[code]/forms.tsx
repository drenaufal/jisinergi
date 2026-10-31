"use client";

import * as React from "react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2, Loader2, Pencil, Plus, Receipt, Save, Trash2 } from "lucide-react";
import { deleteRecord, markReturned, saveRecord } from "./actions";
import type { FinanceKind } from "@/lib/finance/entities";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { DocumentUpload } from "@/components/app/document-upload";
import { MoneyInput } from "@/components/finance/money-input";
import { weekNumber } from "@/lib/finance/calc";
import { useI18n } from "@/lib/i18n/client";
import { APP_TIME_ZONE } from "@/lib/i18n/format";
import { msg } from "@/lib/i18n/translate";
import { cn } from "@/lib/utils";

/** A row as the pages hand it to the forms: plain strings, numbers and nulls only. */
export type FinanceRecord = { id: string; businessUnitId: string } & Record<string, string | number | null>;

/** Starting values for the add dialog (e.g. the club and week of the grid cell that was clicked). */
export type Preset = Record<string, string | number | null>;

export type FormContext = {
  /** The unit every row added from this page belongs to. */
  unitId: string;
  /** Club names already in use, to suggest while typing. */
  clubs?: string[];
  /** Budget categories already in use. */
  categories?: { category: string; period: "weekly" | "monthly" }[];
  /** Match weeks in the program, for the week hint. */
  programWeeks?: number;
  /** May delete rows — offered inside the edit dialog of grid cells, which have no trash icon of their own. */
  canDelete?: boolean;
  /** Sekolah Bola: the unit's students, for the payment form. */
  students?: { id: string; name: string; jerseyNumber: number | null }[];
  /** Sekolah Bola: expense categories already in use. */
  expenseCategories?: string[];
  /** Registration / match fee: age groups already in use ("U8", "U9"…), to suggest while typing. */
  ageGroups?: string[];
  /** RAB Actual: every cost line a real cost can be booked on (RAB lines and extra lines), for the picker. */
  actualLines?: { key: string; label: string; category: string; period: "weekly" | "monthly" }[];
  /** RAB Actual: categories already used, to suggest while adding an extra cost line. */
  actualCategories?: string[];
  /** RAB Actual: the day week 1 starts, so the cost form can say which week a date falls in. Null = not known yet. */
  programStart?: string | null;
};

const COPY = {
  asset: {
    add: msg("Tambah aset"),
    edit: msg("Ubah aset"),
    hint: msg("Catat peralatan atau sarana pertandingan yang dibeli unit bisnis, lengkap dengan bukti struknya."),
  },
  capital: {
    add: msg("Tambah modal"),
    edit: msg("Ubah modal"),
    hint: msg("Catat uang yang disetor pemodal ke unit bisnis dan apakah sudah dikembalikan."),
  },
  registration: {
    add: msg("Tambah registrasi klub"),
    edit: msg("Ubah registrasi klub"),
    hint: msg("Satu baris per klub: biaya registrasi yang ditagih, pembayaran DP, dan pelunasannya."),
  },
  matchfee: {
    add: msg("Catat match fee"),
    edit: msg("Ubah match fee"),
    hint: msg("Isi jumlah laga yang dimainkan sebuah klub pada satu minggu. Nominal dihitung otomatis dari tarif per laga."),
  },
  otherincome: {
    add: msg("Tambah pemasukan lain"),
    edit: msg("Ubah pemasukan lain"),
    hint: msg("Uang masuk di luar registrasi dan match fee, mis. sewa stand atau tiket parkir, dicatat per minggu pertandingan."),
  },
  student: {
    add: msg("Tambah siswa"),
    edit: msg("Ubah data siswa"),
    hint: msg("Data anak: nama, tanggal bergabung, nomor punggung, nama panggilan, dan tanggal lahir."),
  },
  payment: {
    add: msg("Catat pembayaran"),
    edit: msg("Ubah pembayaran"),
    hint: msg("Registrasi atau iuran bulanan seorang siswa — lengkap dengan bukti pembayaran dan diskon. Uang registrasi sudah termasuk iuran bulan saat dibayar."),
  },
  expense: {
    add: msg("Tambah pengeluaran"),
    edit: msg("Ubah pengeluaran"),
    hint: msg("Catat uang yang dikeluarkan sekolah, lengkap dengan bukti struknya."),
  },
  budget: {
    add: msg("Tambah baris RAB"),
    edit: msg("Ubah baris RAB"),
    hint: msg("Satu baris anggaran: nama biaya, jumlah, dan harga satuan. Totalnya dihitung otomatis. Baris yang sudah disimpan tidak dapat diubah lagi."),
  },
  actualitem: {
    add: msg("Tambah keterangan biaya"),
    edit: msg("Ubah keterangan biaya"),
    hint: msg("Biaya yang tidak ada di RAB. Keterangan ini tidak punya budget; setelah dibuat, catat biaya actualnya."),
  },
  actualcost: {
    add: msg("Tambah biaya actual"),
    edit: msg("Ubah biaya actual"),
    hint: msg("Uang yang benar-benar keluar untuk satu keterangan biaya: berapa, kapan, dan bukti pembayarannya."),
  },
} as const;

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: APP_TIME_ZONE });

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-3 border-b border-line pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

/** Aset / Non aset radio shared by the RAB and the expense form. Asset rows are copied into the Aset menu automatically. */
function AssetRadio({ value, onChange, error, hint }: { value: string; onChange: (v: string) => void; error?: string; hint: string }) {
  const { t } = useI18n();
  const options = [
    { value: "non_asset", label: t("Non aset"), text: t("Biaya habis pakai atau jasa") },
    { value: "asset", label: t("Aset"), text: t("Barang yang dimiliki unit") },
  ];
  return (
    <Field label={t("Aset atau non aset")} error={error} hint={hint} className="sm:col-span-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "flex cursor-pointer flex-col gap-0.5 border p-3 transition-colors",
              value === o.value ? "border-2 border-black bg-surface-2" : "border-line hover:border-ink",
            )}
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-ink">
              <input type="radio" name="assetType" value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="accent-black" />
              {o.label}
            </span>
            <span className="pl-6 text-[11px] text-ink-muted">{o.text}</span>
          </label>
        ))}
      </div>
    </Field>
  );
}

function RecordForm({
  kind,
  record,
  preset,
  ctx,
  onDone,
}: {
  kind: FinanceKind;
  record?: FinanceRecord;
  /** Starting values for a new row. */
  preset?: Preset;
  ctx: FormContext;
  onDone: () => void;
}) {
  const { t, fmt } = useI18n();
  const [state, action, pending] = useActionState(saveRecord.bind(null, kind, record?.id ?? null), undefined);
  const fe = state?.fieldErrors ?? {};
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state) {
      toast.success(record ? t("Perubahan disimpan") : t("Data ditambahkan"));
      onDone();
    }
    wasPending.current = pending;
  }, [pending, state, record, onDone, t]);

  /** What a field starts with: what was typed before a failed submit, else the saved value. */
  const val = (key: string, fallback = "") => {
    const typed = state?.values?.[key];
    if (typed !== undefined) return typed;
    const saved = record?.[key] ?? preset?.[key];
    return saved != null ? String(saved) : fallback;
  };

  // live previews
  const [matches, setMatches] = useState(Number(val("matches", "0")) || 0);
  const [rate, setRate] = useState(Number(val("feePerMatch", "0")) || 0);
  const [qty, setQty] = useState(Number(val("quantity", "1")) || 0);
  const [price, setPrice] = useState(Number(val("unitPrice", "0")) || 0);
  const [period, setPeriod] = useState(val("period", "weekly"));
  const [payKind, setPayKind] = useState(val("kind", "monthly"));
  const [assetKind, setAssetKind] = useState(val("assetType", "non_asset"));
  const [paidOn, setPaidOn] = useState(val("paidOn", today()));
  const [spentOn, setSpentOn] = useState(val("spentOn", today()));

  return (
    <form action={action} className="space-y-6">
      <fieldset disabled={pending} className="space-y-6">
        <input type="hidden" name="businessUnitId" value={record?.businessUnitId ?? ctx.unitId} />

        {kind === "asset" && (
          <Section title={t("Pembelian")}>
            <Field label={t("Tanggal pembelian")} error={fe.purchasedOn}>
              <Input type="date" name="purchasedOn" required defaultValue={val("purchasedOn", today())} />
            </Field>
            <Field label={t("Nominal")} error={fe.amount}>
              <MoneyInput name="amount" required defaultValue={val("amount")} invalid={!!fe.amount} />
            </Field>
            <Field label={t("Sarana pertandingan")} error={fe.name} className="sm:col-span-2" hint={t("mis. Dispenser minum, sound system, HT")}>
              <Input name="name" required maxLength={160} defaultValue={val("name")} />
            </Field>
            <div className="sm:col-span-2">
              <DocumentUpload name="proofUrl" label={t("Bukti pembelian (struk)")} defaultValue={val("proofUrl")} error={fe.proofUrl} icon={Receipt} />
            </div>
          </Section>
        )}

        {kind === "capital" && (
          <Section title={t("Modal")}>
            <Field label={t("Nama pemodal")} error={fe.ownerName}>
              <Input name="ownerName" required maxLength={120} defaultValue={val("ownerName")} />
            </Field>
            <Field label={t("Jumlah modal")} error={fe.amount}>
              <MoneyInput name="amount" required defaultValue={val("amount")} invalid={!!fe.amount} />
            </Field>
            <Field label={t("Status")} error={fe.status} className="sm:col-span-2" hint={t("“Sudah kembali” berarti modal sudah dikembalikan kepada pemodal.")}>
              <Select name="status" defaultValue={val("status", "outstanding")}>
                <option value="outstanding">{t("Modal belum kembali")}</option>
                <option value="returned">{t("Modal sudah kembali")}</option>
              </Select>
            </Field>
            <Field label={t("Tanggal disetor")} error={fe.investedOn} hint={t("Opsional")}>
              <Input type="date" name="investedOn" defaultValue={val("investedOn")} />
            </Field>
            <Field label={t("Tanggal dikembalikan")} error={fe.returnedOn} hint={t("Opsional")}>
              <Input type="date" name="returnedOn" defaultValue={val("returnedOn")} />
            </Field>
          </Section>
        )}

        {kind === "registration" && (
          <>
            <Section title={t("Klub & biaya")}>
              <Field label={t("Nama klub")} error={fe.clubName}>
                <Input name="clubName" required maxLength={160} list="finance-clubs" defaultValue={val("clubName")} />
              </Field>
              <Field label={t("Kelompok umur")} error={fe.ageGroup} hint={t("mis. U8, U9. Kosongkan bila liga tidak punya kelompok.")}>
                <Input name="ageGroup" maxLength={40} list="finance-age-groups" defaultValue={val("ageGroup")} />
              </Field>
              <Field label={t("Biaya registrasi")} error={fe.fee} hint={t("Total yang harus dibayar klub.")}>
                <MoneyInput name="fee" required defaultValue={val("fee")} invalid={!!fe.fee} />
              </Field>
            </Section>
            <Section title={t("DP (pembayaran awal)")}>
              <Field label={t("Nominal DP")} error={fe.dpAmount}>
                <MoneyInput name="dpAmount" defaultValue={val("dpAmount")} invalid={!!fe.dpAmount} />
              </Field>
              <Field label={t("Tanggal DP")} error={fe.dpPaidOn} hint={t("Opsional")}>
                <Input type="date" name="dpPaidOn" defaultValue={val("dpPaidOn")} />
              </Field>
              <div className="sm:col-span-2">
                <DocumentUpload name="dpProofUrl" label={t("Bukti pembayaran DP")} defaultValue={val("dpProofUrl")} error={fe.dpProofUrl} icon={Receipt} />
              </div>
            </Section>
            <Section title={t("Pelunasan")}>
              <Field label={t("Nominal pelunasan")} error={fe.finalAmount} hint={t("Kosongkan jika belum melunasi.")}>
                <MoneyInput name="finalAmount" defaultValue={val("finalAmount")} invalid={!!fe.finalAmount} />
              </Field>
              <Field label={t("Tanggal pelunasan")} error={fe.finalPaidOn} hint={t("Opsional")}>
                <Input type="date" name="finalPaidOn" defaultValue={val("finalPaidOn")} />
              </Field>
              <div className="sm:col-span-2">
                <DocumentUpload name="finalProofUrl" label={t("Bukti pembayaran pelunasan")} defaultValue={val("finalProofUrl")} error={fe.finalProofUrl} icon={Receipt} />
              </div>
            </Section>
          </>
        )}

        {kind === "matchfee" && (
          <Section title={t("Match fee")}>
            <Field label={t("Nama klub")} error={fe.clubName}>
              <Input name="clubName" required maxLength={160} list="finance-clubs" defaultValue={val("clubName")} />
            </Field>
            <Field label={t("Kelompok umur")} error={fe.ageGroup} hint={t("mis. U8, U9. Kosongkan bila liga tidak punya kelompok.")}>
              <Input name="ageGroup" maxLength={40} list="finance-age-groups" defaultValue={val("ageGroup")} />
            </Field>
            <Field
              label={t("Minggu ke-")}
              error={fe.week}
              hint={ctx.programWeeks ? t("Program berjalan {n} minggu.", { n: ctx.programWeeks }) : undefined}
            >
              <Input type="number" name="week" required min={1} max={52} step={1} defaultValue={val("week")} />
            </Field>
            <Field label={t("Jumlah laga")} error={fe.matches} hint={t("Berapa pertandingan klub ini minggu tersebut.")}>
              <Input
                type="number"
                name="matches"
                required
                min={0}
                max={50}
                step={1}
                defaultValue={val("matches")}
                onChange={(e) => setMatches(Number(e.target.value) || 0)}
              />
            </Field>
            <Field label={t("Tarif per laga")} error={fe.feePerMatch}>
              <MoneyInput name="feePerMatch" required defaultValue={val("feePerMatch")} invalid={!!fe.feePerMatch} onValueChange={setRate} />
            </Field>
            <p className="border border-line bg-surface-2 px-3 py-2 text-xs text-ink-secondary sm:col-span-2">
              {t("Nominal match fee")}: <span className="font-semibold tabular-nums text-ink">{fmt.number(matches)} × {fmt.rupiah(rate)} = {fmt.rupiah(matches * rate)}</span>
            </p>
            <div className="sm:col-span-2">
              <DocumentUpload name="proofUrl" label={t("Bukti pembayaran match fee")} defaultValue={val("proofUrl")} error={fe.proofUrl} icon={Receipt} />
            </div>
          </Section>
        )}

        {kind === "otherincome" && (
          <Section title={t("Pemasukan lain")}>
            <Field label={t("Keterangan")} error={fe.name} hint={t("mis. Sewa stand es teh, tiket parkir")} className="sm:col-span-2">
              <Input name="name" required maxLength={160} defaultValue={val("name")} />
            </Field>
            <Field label={t("Minggu ke-")} error={fe.week} hint={ctx.programWeeks ? t("Program berjalan {n} minggu.", { n: ctx.programWeeks }) : undefined}>
              <Input type="number" name="week" required min={1} max={52} step={1} defaultValue={val("week")} />
            </Field>
            <Field label={t("Nominal")} error={fe.amount}>
              <MoneyInput name="amount" required defaultValue={val("amount")} invalid={!!fe.amount} />
            </Field>
            <div className="sm:col-span-2">
              <DocumentUpload name="proofUrl" label={t("Bukti transfer")} defaultValue={val("proofUrl")} error={fe.proofUrl} icon={Receipt} />
            </div>
          </Section>
        )}

        {kind === "student" && (
          <Section title={t("Data siswa")}>
            <Field label={t("Nama anak")} error={fe.name} className="sm:col-span-2">
              <Input name="name" required maxLength={160} defaultValue={val("name")} />
            </Field>
            <Field label={t("Nama panggilan")} error={fe.nickname} hint={t("Opsional")}>
              <Input name="nickname" maxLength={80} defaultValue={val("nickname")} />
            </Field>
            <Field label={t("No punggung")} error={fe.jerseyNumber} hint={t("Opsional")}>
              <Input type="number" name="jerseyNumber" min={0} max={999} step={1} defaultValue={val("jerseyNumber")} />
            </Field>
            <Field label={t("Tanggal bergabung")} error={fe.joinedOn}>
              <Input type="date" name="joinedOn" required defaultValue={val("joinedOn", today())} />
            </Field>
            <Field label={t("Tanggal lahir")} error={fe.birthDate} hint={t("Opsional")}>
              <Input type="date" name="birthDate" defaultValue={val("birthDate")} />
            </Field>
          </Section>
        )}

        {kind === "payment" && (
          <>
            <Section title={t("Pembayaran")}>
              <Field label={t("Siswa")} error={fe.studentId} className="sm:col-span-2">
                <Select name="studentId" required defaultValue={val("studentId")} disabled={!!record}>
                  <option value="" disabled>
                    {t("Pilih siswa")}
                  </option>
                  {(ctx.students ?? []).map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name}
                      {st.jerseyNumber != null ? ` (#${st.jerseyNumber})` : ""}
                    </option>
                  ))}
                </Select>
                {record && <input type="hidden" name="studentId" value={String(record.studentId ?? "")} />}
              </Field>
              <Field label={t("Jenis pembayaran")} error={fe.kind} className="sm:col-span-2">
                <Select name="kind" value={payKind} onChange={(e) => setPayKind(e.target.value)} disabled={!!record}>
                  <option value="registration">{t("Registrasi")}</option>
                  <option value="monthly">{t("Iuran bulanan")}</option>
                </Select>
                {record && <input type="hidden" name="kind" value={payKind} />}
              </Field>
              {payKind === "monthly" && (
                <Field label={t("Bulan yang dibayar")} error={fe.period} hint={t("Satu iuran per siswa per bulan.")}>
                  <Input type="month" name="period" required defaultValue={val("period", today().slice(0, 7))} />
                </Field>
              )}
              <Field
                label={t("Tanggal dibayar")}
                error={fe.paidOn}
                className={payKind === "monthly" ? "" : "sm:col-span-2"}
                hint={
                  payKind === "registration" && paidOn.length >= 7
                    ? t("Registrasi sudah termasuk iuran bulan {month}.", { month: fmt.date(`${paidOn.slice(0, 7)}-01`, { month: "long", year: "numeric" }) })
                    : undefined
                }
              >
                <Input type="date" name="paidOn" required value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
              </Field>
              <Field label={t("Uang yang dibayar")} error={fe.amount}>
                <MoneyInput name="amount" required defaultValue={val("amount")} invalid={!!fe.amount} />
              </Field>
              <Field label={t("Diskon")} error={fe.discount} hint={t("Potongan yang diberikan. Opsional.")}>
                <MoneyInput name="discount" defaultValue={val("discount")} invalid={!!fe.discount} />
              </Field>
              <div className="sm:col-span-2">
                <DocumentUpload name="proofUrl" label={t("Bukti pembayaran")} defaultValue={val("proofUrl")} error={fe.proofUrl} icon={Receipt} />
              </div>
            </Section>
          </>
        )}

        {kind === "expense" && (
          <Section title={t("Pengeluaran")}>
            <Field label={t("Tanggal")} error={fe.spentOn}>
              <Input type="date" name="spentOn" required defaultValue={val("spentOn", today())} />
            </Field>
            <Field label={t("Nominal")} error={fe.amount}>
              <MoneyInput name="amount" required defaultValue={val("amount")} invalid={!!fe.amount} />
            </Field>
            <Field label={t("Kategori")} error={fe.category} hint={t("Pilih yang sudah ada atau ketik kategori baru.")}>
              <Input name="category" required maxLength={120} list="finance-expense-categories" defaultValue={val("category")} />
            </Field>
            <Field label={t("Keterangan")} error={fe.name} hint={t("mis. Sewa lapangan, bola latihan")}>
              <Input name="name" required maxLength={200} defaultValue={val("name")} />
            </Field>
            <AssetRadio
              value={assetKind}
              onChange={setAssetKind}
              error={fe.assetType}
              hint={assetKind === "asset" ? t("Pengeluaran ini otomatis tercatat juga di menu Aset.") : t("Hanya tercatat sebagai pengeluaran.")}
            />
            <div className="sm:col-span-2">
              <DocumentUpload name="proofUrl" label={t("Bukti pengeluaran (struk)")} defaultValue={val("proofUrl")} error={fe.proofUrl} icon={Receipt} />
            </div>
          </Section>
        )}

        {kind === "budget" && (
          <Section title={t("Baris anggaran")}>
            <Field
              label={t("Jenis biaya")}
              error={fe.period}
              className="sm:col-span-2"
              hint={period === "weekly" ? t("Mingguan: biaya yang keluar setiap minggu pertandingan, dikalikan jumlah minggu program.") : t("Bulanan: biaya yang dikeluarkan satu kali, dihitung sekali dalam total.")}
            >
              <Select name="period" value={period} onChange={(e) => setPeriod(e.target.value)}>
                <option value="weekly">{t("Mingguan — berulang tiap minggu")}</option>
                <option value="monthly">{t("Bulanan — dihitung sekali")}</option>
              </Select>
            </Field>
            <Field label={t("Kategori")} error={fe.category} hint={t("Pilih yang sudah ada atau ketik kategori baru.")}>
              <Input name="category" required maxLength={160} list="finance-categories" defaultValue={val("category")} />
            </Field>
            <Field label={t("Nama biaya")} error={fe.name}>
              <Input name="name" required maxLength={200} defaultValue={val("name")} />
            </Field>
            <Field label={t("Jumlah")} error={fe.quantity}>
              <Input type="number" name="quantity" required min={0} step={1} defaultValue={val("quantity", "1")} onChange={(e) => setQty(Number(e.target.value) || 0)} />
            </Field>
            <Field label={t("Harga satuan")} error={fe.unitPrice}>
              <MoneyInput name="unitPrice" required defaultValue={val("unitPrice")} invalid={!!fe.unitPrice} onValueChange={setPrice} />
            </Field>
            <p className="border border-line bg-surface-2 px-3 py-2 text-xs text-ink-secondary sm:col-span-2">
              {t("Total baris")}: <span className="font-semibold tabular-nums text-ink">{fmt.number(qty)} × {fmt.rupiah(price)} = {fmt.rupiah(qty * price)}</span>
            </p>
            <AssetRadio
              value={assetKind}
              onChange={setAssetKind}
              error={fe.assetType}
              hint={
                assetKind === "asset"
                  ? t("Baris ini otomatis masuk ke menu Aset senilai {amount}.", { amount: fmt.rupiah(qty * price * (period === "weekly" ? ctx.programWeeks ?? 1 : 1)) })
                  : t("Hanya menjadi anggaran, tidak masuk ke menu Aset.")
              }
            />
            <p role="note" className="border border-ink bg-surface-2 px-3 py-2 text-xs font-semibold text-ink sm:col-span-2">
              {t("Periksa dulu: baris RAB yang sudah disimpan tidak dapat diubah lagi.")}
            </p>
          </Section>
        )}

        {kind === "actualitem" && (
          <Section title={t("Keterangan biaya")}>
            <Field label={t("Jenis biaya")} error={fe.period} className="sm:col-span-2" hint={t("Mingguan atau bulanan: menentukan bagian halaman RAB Actual tempat baris ini muncul.")}>
              <Select name="period" defaultValue={val("period", "weekly")}>
                <option value="weekly">{t("Mingguan — berulang tiap minggu")}</option>
                <option value="monthly">{t("Bulanan — dihitung sekali")}</option>
              </Select>
            </Field>
            <Field label={t("Kategori")} error={fe.category} hint={t("Pilih yang sudah ada atau ketik kategori baru.")}>
              <Input name="category" required maxLength={160} list="finance-actual-categories" defaultValue={val("category")} />
            </Field>
            <Field label={t("Nama biaya")} error={fe.name} hint={t("mis. Sewa HT")}>
              <Input name="name" required maxLength={200} defaultValue={val("name")} />
            </Field>
          </Section>
        )}

        {kind === "actualcost" && (
          <Section title={t("Biaya actual")}>
            <Field label={t("Keterangan biaya")} error={fe.itemRef} className="sm:col-span-2">
              <Select name="itemRef" required defaultValue={val("itemRef")}>
                <option value="" disabled>
                  {t("Pilih keterangan biaya")}
                </option>
                {[...new Set((ctx.actualLines ?? []).map((l) => `${l.period}|${l.category}`))].map((group) => {
                  const [linePeriod, ...rest] = group.split("|");
                  const category = rest.join("|");
                  return (
                    <optgroup key={group} label={`${linePeriod === "weekly" ? t("Mingguan") : t("Bulanan")} · ${category}`}>
                      {(ctx.actualLines ?? []).filter((l) => l.period === linePeriod && l.category === category).map((l) => (
                        <option key={l.key} value={l.key}>
                          {l.label}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </Select>
            </Field>
            <Field label={t("Actual biaya")} error={fe.amount} hint={t("Uang yang benar-benar dikeluarkan.")}>
              <MoneyInput name="amount" required defaultValue={val("amount")} invalid={!!fe.amount} />
            </Field>
            <Field
              label={t("Tanggal biaya")}
              error={fe.spentOn}
              hint={
                ctx.programStart && spentOn
                  ? weekNumber(ctx.programStart, spentOn) >= 1
                    ? t("Masuk ke kolom minggu ke-{n}.", { n: weekNumber(ctx.programStart, spentOn) })
                    : t("Sebelum minggu ke-1 program.")
                  : t("Minggu dihitung dari tanggal ini.")
              }
            >
              <Input type="date" name="spentOn" required value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <DocumentUpload name="proofUrl" label={t("Bukti pembayaran")} defaultValue={val("proofUrl")} error={fe.proofUrl} icon={Receipt} />
            </div>
          </Section>
        )}

        <Field label={t("Catatan")} error={fe.note} hint={t("Opsional")}>
          <Textarea name="note" rows={2} maxLength={500} defaultValue={val("note")} />
        </Field>
      </fieldset>

      {kind === "budget" && (
        <datalist id="finance-categories">
          {(ctx.categories ?? []).filter((c) => c.period === period).map((c) => <option key={c.category} value={c.category} />)}
        </datalist>
      )}
      {kind === "expense" && (
        <datalist id="finance-expense-categories">{(ctx.expenseCategories ?? []).map((c) => <option key={c} value={c} />)}</datalist>
      )}
      {(kind === "registration" || kind === "matchfee") && (
        <datalist id="finance-age-groups">{(ctx.ageGroups ?? []).map((g) => <option key={g} value={g} />)}</datalist>
      )}
      {kind === "actualitem" && (
        <datalist id="finance-actual-categories">{(ctx.actualCategories ?? []).map((c) => <option key={c} value={c} />)}</datalist>
      )}
      {(kind === "registration" || kind === "matchfee") && (
        <datalist id="finance-clubs">{(ctx.clubs ?? []).map((c) => <option key={c} value={c} />)}</datalist>
      )}

      {state?.error && (
        <p role="alert" className="border border-ink bg-surface-2 px-3 py-2 text-xs font-semibold text-ink">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />}
          {pending ? t("Menyimpan…") : record ? t("Simpan perubahan") : t("Simpan")}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          {t("Batal")}
        </Button>
        {record && kind === "matchfee" && ctx.canDelete && (
          <span className="ml-auto">
            <DeleteRecordButton kind={kind} id={record.id} name={`${record.ageGroup ? record.ageGroup + " " : ""}${record.clubName ?? ""}`} />
          </span>
        )}
      </div>
    </form>
  );
}

/** "Tambah …" button with the form in a dialog. */
export function AddRecordButton({
  kind,
  ctx,
  label,
  preset,
  variant = "primary",
  children,
  className,
}: {
  kind: FinanceKind;
  ctx: FormContext;
  label?: string;
  preset?: Preset;
  variant?: "primary" | "outline" | "cell";
  /** Replaces the button content (used by the empty cells of the match-fee grid). */
  children?: React.ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const title = label ?? t(COPY[kind].add);
  return (
    <>
      {variant === "cell" ? (
        <button type="button" onClick={() => setOpen(true)} title={title} aria-label={title} className={className}>
          {children}
        </button>
      ) : (
        <Button size="sm" variant={variant} onClick={() => setOpen(true)} className={className}>
          <Plus className="size-3.5" /> {children ?? title}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl" title={t(COPY[kind].add)} description={t(COPY[kind].hint)}>
          <RecordForm kind={kind} preset={preset} ctx={ctx} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Pencil button on a table row. */
export function EditRecordButton({
  kind,
  record,
  ctx,
  label,
  children,
  className,
}: {
  kind: FinanceKind;
  record: FinanceRecord;
  ctx: FormContext;
  label?: string;
  /** Custom trigger content (a grid cell); without it the trigger is a pencil icon. */
  children?: React.ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={label ?? t(COPY[kind].edit)}
        aria-label={label ?? t(COPY[kind].edit)}
        className={className ?? "grid size-8 place-items-center text-ink-muted transition-colors hover:bg-ink hover:text-white"}
      >
        {children ?? <Pencil className="size-3.5" />}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl" title={t(COPY[kind].edit)} description={t(COPY[kind].hint)}>
          <RecordForm kind={kind} record={record} ctx={ctx} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Trash button with a confirmation dialog. Only rendered for people who hold `finance:delete`. */
export function DeleteRecordButton({ kind, id, name }: { kind: FinanceKind; id: string; name: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => setOpen(true)}
        title={t("Hapus")}
        aria-label={t("Hapus")}
        className="grid size-8 place-items-center text-ink-muted transition-colors hover:bg-ink hover:text-white disabled:opacity-50"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("Hapus data ini?")}
        description={
          kind === "student"
            ? t("“{name}” akan dihapus permanen beserta SELURUH pembayarannya dan bukti yang terlampir. Tindakan ini tidak dapat dibatalkan.", { name })
            : t("“{name}” akan dihapus permanen beserta bukti struk yang terlampir. Tindakan ini tidak dapat dibatalkan.", { name })
        }
        confirmLabel={t("Hapus")}
        onConfirm={() =>
          start(async () => {
            const result = await deleteRecord(kind, id);
            if (result?.error) toast(result.error, { tone: "error" });
            else toast.success(t("Data dihapus"));
          })
        }
      />
    </>
  );
}

/** One click: Modal Belum Kembali → Modal Sudah Kembali. */
export function MarkReturnedButton({ id }: { id: string }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await markReturned(id);
          if (result?.error) toast(result.error, { tone: "error" });
          else toast.success(t("Modal ditandai sudah kembali"));
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
      {t("Tandai sudah kembali")}
    </Button>
  );
}
