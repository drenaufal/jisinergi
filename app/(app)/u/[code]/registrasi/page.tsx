import type { Metadata } from "next";
import { ClipboardCheck, Clock, Receipt, Wallet } from "lucide-react";
import { loadUnitPage } from "@/lib/finance/access";
import { listRegistrations } from "@/lib/finance/queries";
import {
  compareAgeGroups,
  registrationPaid,
  registrationRemaining,
  registrationStatus,
  share,
  sum,
  teamLabel,
  type RegistrationStatus,
} from "@/lib/finance/calc";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BlockTitle, ColumnHead, ProofChip } from "@/components/finance/bits";
import { RankBars, StackedBar } from "@/components/finance/charts";
import { GuideCard } from "@/components/finance/guide-card";
import { Kpi } from "@/components/finance/kpi";
import { getI18n } from "@/lib/i18n/server";
import { AddRecordButton, DeleteRecordButton, EditRecordButton, type FinanceRecord } from "../forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t("Registrasi") };
}
export const dynamic = "force-dynamic";

const TONE: Record<RegistrationStatus, "success" | "warn" | "danger"> = { paid: "success", partial: "warn", unpaid: "danger" };

export default async function RegistrationsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { unit, form, canInput, canDelete } = await loadUnitPage(code, "liga");
  const { t, fmt } = await getI18n();

  const rows = [...(await listRegistrations(unit.id))].sort((a, b) => compareAgeGroups(a.ageGroup, b.ageGroup) || a.clubName.localeCompare(b.clubName));
  const ageGroups = [...new Set(rows.map((r) => r.ageGroup).filter(Boolean))].sort(compareAgeGroups);
  const hasGroups = ageGroups.length > 0;
  const billed = sum(rows, (r) => r.fee);
  const received = sum(rows, registrationPaid);
  const remaining = sum(rows, registrationRemaining);
  const dpTotal = sum(rows, (r) => r.dpAmount);
  const finalTotal = sum(rows, (r) => r.finalAmount);
  const counts: Record<RegistrationStatus, number> = { paid: 0, partial: 0, unpaid: 0 };
  for (const r of rows) counts[registrationStatus(r)] += 1;
  const noProof = rows.reduce((n, r) => n + (r.dpAmount > 0 && !r.dpProofUrl ? 1 : 0) + (r.finalAmount > 0 && !r.finalProofUrl ? 1 : 0), 0);

  const label: Record<RegistrationStatus, string> = { paid: t("Lunas"), partial: t("Belum lunas"), unpaid: t("Belum bayar") };
  const pct = (fraction: number) => `${Math.round(fraction * 100)}%`;
  const proofLabels = { viewLabel: t("Lihat bukti"), missingLabel: t("Belum ada bukti") };
  const clubs = [...new Set(rows.map((r) => r.clubName))];
  const formCtx = { ...form, clubs, ageGroups };
  const groupRows = (group: string) => rows.filter((r) => r.ageGroup === group);

  const record = (r: (typeof rows)[number]): FinanceRecord => ({
    id: r.id,
    businessUnitId: r.businessUnitId,
    clubName: r.clubName,
    ageGroup: r.ageGroup,
    fee: r.fee,
    dpAmount: r.dpAmount,
    dpPaidOn: r.dpPaidOn,
    dpProofUrl: r.dpProofUrl,
    finalAmount: r.finalAmount,
    finalPaidOn: r.finalPaidOn,
    finalProofUrl: r.finalProofUrl,
    note: r.note,
  });
  const actions = canInput || canDelete;

  const payment = (amount: number, paidOn: string | null, proofUrl: string | null) =>
    amount > 0 ? (
      <div className="space-y-1">
        <div className="font-medium tabular-nums text-ink">{fmt.rupiah(amount)}</div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {paidOn && <span className="text-[11px] tabular-nums text-ink-muted">{fmt.date(paidOn)}</span>}
          <ProofChip url={proofUrl} {...proofLabels} />
        </div>
      </div>
    ) : (
      <span className="text-ink-muted">—</span>
    );

  return (
    <div>
      <PageHeader
        eyebrow={unit.name}
        title={t("Uang Masuk Registrasi")}
        description={t("Biaya pendaftaran yang dibayar setiap klub (per kelompok umur bila ada): berapa yang ditagih, berapa sudah dibayar (DP dan pelunasan), dan berapa sisanya.")}
        actions={canInput && <AddRecordButton kind="registration" ctx={formCtx} />}
      />

      <GuideCard
        id="registrasi"
        title={t("Cara membaca halaman Registrasi")}
        intro={t("Setiap klub membayar biaya registrasi dalam dua tahap: DP lebih dulu, lalu pelunasan. Tabel ini menunjukkan tagihan tiap klub, apa yang sudah masuk, dan berapa yang masih kurang.")}
        terms={[
          { term: t("Kelompok umur"), text: t("Divisi tempat klub mendaftar (U8, U9, …). Klub yang sama di dua kelompok punya dua baris dan dua tagihan.") },
          { term: t("Biaya registrasi"), text: t("Total yang harus dibayar klub.") },
          { term: t("DP"), text: t("Pembayaran awal. Kolom ini berisi nominal, tanggal, dan bukti pembayarannya.") },
          { term: t("Pelunasan"), text: t("Pembayaran sisanya. Kosong (—) berarti belum dibayar.") },
          { term: t("Terbayar / Sisa"), text: t("Terbayar = DP + pelunasan. Sisa = biaya registrasi dikurangi terbayar.") },
          { term: t("Status"), text: t("Lunas: sudah bayar penuh. Belum lunas: baru sebagian. Belum bayar: belum ada pembayaran.") },
        ]}
        tip={canInput ? t("Saat klub melunasi, klik ikon pensil di barisnya lalu isi bagian “Pelunasan”.") : undefined}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t("Total tagihan")} value={fmt.rupiahCompact(billed)} full={fmt.rupiah(billed)} icon={<ClipboardCheck className="size-4" />} block="red" hint={t("{n} klub terdaftar", { n: fmt.number(rows.length) })} />
        <Kpi
          label={t("Sudah diterima")}
          value={fmt.rupiahCompact(received)}
          full={fmt.rupiah(received)}
          icon={<Wallet className="size-4" />}
          block="blue"
          hint={t("{pct} dari total tagihan", { pct: pct(share(received, billed)) })}
        />
        <Kpi
          label={t("Sisa tagihan")}
          value={fmt.rupiahCompact(remaining)}
          full={fmt.rupiah(remaining)}
          icon={<Clock className="size-4" />}
          block="yellow"
          hint={t("{n} klub belum lunas", { n: fmt.number(counts.partial + counts.unpaid) })}
        />
        <Kpi
          label={t("Klub lunas")}
          value={`${fmt.number(counts.paid)}/${fmt.number(rows.length)}`}
          icon={<Receipt className="size-4" />}
          block="night"
          tone={noProof ? "danger" : "default"}
          hint={noProof ? t("{n} pembayaran belum ada buktinya", { n: noProof }) : t("Semua pembayaran punya bukti")}
        />
      </div>

      {rows.length > 0 && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("Tagihan: sudah masuk vs sisa")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <StackedBar
                parts={[
                  { label: t("DP"), value: dpTotal, color: "var(--color-chart-1)" },
                  { label: t("Pelunasan"), value: finalTotal, color: "var(--color-chart-3)" },
                  { label: t("Sisa tagihan"), value: remaining, color: "var(--color-axis)" },
                ]}
              />
              <div className="flex flex-wrap gap-2">
                {(["paid", "partial", "unpaid"] as const).map((s) => (
                  <Badge key={s} tone={TONE[s]} dot>
                    {label[s]} · {t("{n} klub", { n: counts[s] })}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("Yang sudah dibayar per klub")}</CardTitle>
            </CardHeader>
            <CardContent>
              <RankBars
                items={[...rows]
                  .sort((a, b) => registrationPaid(b) - registrationPaid(a))
                  .slice(0, 10)
                  .map((r) => ({
                    label: teamLabel(r),
                    value: registrationPaid(r),
                    valueLabel: fmt.rupiah(registrationPaid(r)),
                    sublabel: t("{pct} dari {fee}", { pct: pct(share(registrationPaid(r), r.fee)), fee: fmt.rupiahCompact(r.fee) }),
                  }))}
                accent="var(--color-chart-1)"
              />
            </CardContent>
          </Card>
        </div>
      )}

      {ageGroups.length > 1 && (
        <Card className="mt-4">
          <CardContent className="space-y-4">
            <BlockTitle title={t("Per kelompok umur")} hint={t("Tagihan dan uang masuk setiap kelompok.")} />
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>{t("Kelompok")}</TH>
                  <TH className="text-right">{t("Klub")}</TH>
                  <TH className="text-right">{t("Tagihan")}</TH>
                  <TH className="text-right">{t("Diterima")}</TH>
                  <TH className="text-right">{t("Sisa")}</TH>
                  <TH className="text-right">{t("Lunas")}</TH>
                </TR>
              </THead>
              <TBody>
                {[...ageGroups, ...(rows.some((r) => !r.ageGroup) ? [""] : [])].map((group) => {
                  const list = groupRows(group);
                  return (
                    <TR key={group || "none"}>
                      <TD className="font-semibold text-ink">{group || t("Tanpa kelompok")}</TD>
                      <TD className="text-right tabular-nums">{fmt.number(list.length)}</TD>
                      <TD className="text-right tabular-nums">{fmt.rupiah(sum(list, (r) => r.fee))}</TD>
                      <TD className="text-right tabular-nums">{fmt.rupiah(sum(list, registrationPaid))}</TD>
                      <TD className="text-right tabular-nums">{fmt.rupiah(sum(list, registrationRemaining))}</TD>
                      <TD className="text-right tabular-nums">{fmt.number(list.filter((r) => registrationStatus(r) === "paid").length)}/{fmt.number(list.length)}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardContent className="space-y-4">
          <BlockTitle title={t("Daftar registrasi klub")} hint={hasGroups ? t("Satu baris untuk setiap klub di setiap kelompok umur.") : t("Satu baris untuk setiap klub.")} />
          {rows.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title={t("Belum ada klub terdaftar")}
              description={canInput ? t("Klik “Tambah registrasi klub” untuk mencatat klub pertama.") : t("Belum ada data registrasi untuk ditampilkan.")}
            />
          ) : (
            <>
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH className="w-10">No</TH>
                    {hasGroups && <TH><ColumnHead label={t("Kelompok")} hint={t("Umur / divisi")} /></TH>}
                    <TH><ColumnHead label={t("Klub")} hint={t("Nama klub")} /></TH>
                    <TH className="text-right"><ColumnHead label={t("Biaya registrasi")} hint={t("Yang harus dibayar")} align="right" /></TH>
                    <TH><ColumnHead label={t("DP")} hint={t("Nominal · tanggal · bukti")} /></TH>
                    <TH><ColumnHead label={t("Pelunasan")} hint={t("Nominal · tanggal · bukti")} /></TH>
                    <TH className="text-right"><ColumnHead label={t("Terbayar")} hint={t("DP + pelunasan")} align="right" /></TH>
                    <TH className="text-right"><ColumnHead label={t("Sisa")} hint={t("Biaya − terbayar")} align="right" /></TH>
                    <TH><ColumnHead label={t("Status")} hint={t("Lunas / belum")} /></TH>
                    {actions && <TH><span className="sr-only">{t("Aksi")}</span></TH>}
                  </TR>
                </THead>
                <TBody>
                  {rows.map((r, i) => {
                    const status = registrationStatus(r);
                    return (
                      <TR key={r.id}>
                        <TD className="tabular-nums text-ink-muted">{i + 1}</TD>
                        {hasGroups && <TD className="whitespace-nowrap font-semibold text-ink">{r.ageGroup || "—"}</TD>}
                        <TD>
                          <span className="font-medium text-ink">{r.clubName}</span>
                          {r.note && <span className="block text-[11px] text-ink-muted">{r.note}</span>}
                        </TD>
                        <TD className="text-right tabular-nums text-ink">{fmt.rupiah(r.fee)}</TD>
                        <TD>{payment(r.dpAmount, r.dpPaidOn, r.dpProofUrl)}</TD>
                        <TD>{payment(r.finalAmount, r.finalPaidOn, r.finalProofUrl)}</TD>
                        <TD className="text-right font-medium tabular-nums text-ink">{fmt.rupiah(registrationPaid(r))}</TD>
                        <TD className={`text-right font-medium tabular-nums ${registrationRemaining(r) > 0 ? "text-warn" : "text-ink-muted"}`}>
                          {fmt.rupiah(registrationRemaining(r))}
                        </TD>
                        <TD><Badge tone={TONE[status]} dot>{label[status]}</Badge></TD>
                        {actions && (
                          <TD>
                            <div className="flex justify-end gap-0.5">
                              {canInput && <EditRecordButton kind="registration" record={record(r)} ctx={formCtx} />}
                              {canDelete && <DeleteRecordButton kind="registration" id={r.id} name={teamLabel(r)} />}
                            </div>
                          </TD>
                        )}
                      </TR>
                    );
                  })}
                </TBody>
                <tfoot>
                  <tr className="border-t-2 border-line bg-surface-2 text-sm font-bold tabular-nums text-ink">
                    <td colSpan={hasGroups ? 3 : 2} className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                      {t("Total")}
                    </td>
                    <td className="px-3 py-3 text-right">{fmt.rupiah(billed)}</td>
                    <td className="px-3 py-3">{fmt.rupiah(dpTotal)}</td>
                    <td className="px-3 py-3">{fmt.rupiah(finalTotal)}</td>
                    <td className="px-3 py-3 text-right">{fmt.rupiah(received)}</td>
                    <td className="px-3 py-3 text-right text-warn">{fmt.rupiah(remaining)}</td>
                    <td colSpan={actions ? 2 : 1} />
                  </tr>
                </tfoot>
              </Table>
              <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-ink-muted">
                <li><Badge tone="success" dot>{t("Lunas")}</Badge> {t("sudah membayar penuh")}</li>
                <li><Badge tone="warn" dot>{t("Belum lunas")}</Badge> {t("baru membayar sebagian")}</li>
                <li><Badge tone="danger" dot>{t("Belum bayar")}</Badge> {t("belum ada pembayaran")}</li>
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
