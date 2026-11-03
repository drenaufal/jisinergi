import type { Metadata } from "next";
import { Award, Calculator, Percent, Users } from "lucide-react";
import { can } from "@/lib/auth/rbac";
import { loadUnitPage } from "@/lib/finance/access";
import { ligaDataset, listOwners, schoolDataset } from "@/lib/finance/queries";
import { schoolFigures, unitFigures } from "@/lib/finance/calc";
import { BP_TOTAL, bpToField, splitByShares } from "@/lib/finance/ownership";
import { menuHref } from "@/lib/finance/unit-types";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, Progress } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BlockTitle, ColumnHead, Notice } from "@/components/finance/bits";
import { CHART_COLORS, RankBars, ShareDonut } from "@/components/finance/charts";
import { Formula, type FormulaLine } from "@/components/finance/formula";
import { GuideCard } from "@/components/finance/guide-card";
import { Kpi } from "@/components/finance/kpi";
import { getI18n } from "@/lib/i18n/server";
import { OwnersDialog } from "./owners-dialog";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t("Dividen") };
}
export const dynamic = "force-dynamic";

/**
 * Dividen of one unit, Liga or Sekolah Bola. The unit's dividend comes from its formula; each owner
 * (named when the unit was created) gets a percentage of it. The owner edits the percentages, never the amounts.
 */
export default async function DividendsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { user, unit } = await loadUnitPage(code);
  const { t, fmt } = await getI18n();
  const canEdit = can(user.role, "units:manage");
  const isLiga = unit.type === "liga";
  const link = (slug: string) => menuHref(unit.code, slug);
  const pct = (bp: number) => `${bpToField(bp)}%`;

  const owners = await listOwners(unit.id);
  const ligaFigures = isLiga ? unitFigures(await ligaDataset(unit.id, unit.programWeeks)) : null;
  const school = isLiga ? null : await schoolDataset(unit.id);
  const schoolTotals = school ? schoolFigures({ students: school.students.length, payments: school.payments, expenses: school.expenses }) : null;

  const dividend = ligaFigures ? ligaFigures.dividend.value : (schoolTotals?.dividend ?? 0);
  const amounts = splitByShares(dividend, owners.map((o) => o.shareBp));
  const rows = owners.map((o, i) => ({ owner: o, amount: amounts[i] }));
  const totalBp = owners.reduce((sum, o) => sum + o.shareBp, 0);
  const balanced = totalBp === BP_TOTAL;
  const biggest = rows.reduce<(typeof rows)[number] | null>((top, r) => (!top || r.owner.shareBp > top.owner.shareBp ? r : top), null);
  const editorRows = owners.map((o) => ({ name: o.name, percent: bpToField(o.shareBp) }));

  const lines: FormulaLine[] = ligaFigures
    ? [
        { label: t("RAB (estimasi OPEX)"), value: fmt.rupiah(ligaFigures.dividend.budget), href: link("rab"), hint: t("Biaya mingguan × lama program + biaya bulanan") },
        { op: "−", label: t("Uang modal"), value: fmt.rupiah(ligaFigures.dividend.capital), href: link("modal") },
        { op: "−", label: t("Uang masuk registrasi"), value: fmt.rupiah(ligaFigures.dividend.registration), href: link("registrasi"), hint: t("DP + pelunasan yang sudah diterima") },
        { op: "−", label: t("Uang masuk match fee"), value: fmt.rupiah(ligaFigures.dividend.matchFee), href: link("match-fee") },
      ]
    : [
        { label: t("Total pemasukan"), value: fmt.rupiah(schoolTotals?.income.total ?? 0), href: link("pemasukan"), hint: t("Registrasi + iuran bulanan") },
        { op: "−", label: t("Total pengeluaran"), value: fmt.rupiah(schoolTotals?.expense ?? 0), href: link("pengeluaran") },
      ];

  return (
    <div>
      <PageHeader
        eyebrow={unit.name}
        title={t("Dividen")}
        description={t("Dividen unit ini dihitung dari rumus, lalu dibagi ke para pemilik menurut persentasenya.")}
        actions={canEdit && <OwnersDialog unitId={unit.id} owners={editorRows} />}
      />

      <GuideCard
        id="dividen"
        title={t("Cara membaca halaman Dividen")}
        intro={
          isLiga
            ? t("Bagian atas menghitung dividen unit ini: RAB dikurangi uang modal, uang masuk registrasi, dan uang masuk match fee. Angkanya diambil otomatis dari menu lain. Di bawahnya, dividen itu dibagi ke para pemilik unit sesuai persentase masing-masing.")
            : t("Bagian atas menghitung dividen unit ini: pemasukan dikurangi pengeluaran (sisa saldo). Angkanya diambil otomatis dari menu Pemasukan dan Pengeluaran. Di bawahnya, dividen itu dibagi ke para pemilik unit sesuai persentase masing-masing.")
        }
        terms={[
          { term: t("Dividen (rumus)"), text: t("Hasil perhitungan otomatis. Berubah sendiri saat data di menu lain berubah.") },
          { term: t("Pemilik"), text: t("Orang yang memiliki unit ini. Diisi saat unit dibuat.") },
          { term: t("Persentase"), text: t("Bagian setiap pemilik dari dividen. Totalnya harus 100%. Hanya Owner yang dapat mengubahnya.") },
          { term: t("Bagian dividen"), text: t("Dividen dikali persentase pemilik itu. Dibulatkan ke rupiah penuh dan selalu berjumlah sama dengan dividen.") },
        ]}
      />

      <Formula
        className="mb-4"
        title={isLiga ? t("Perhitungan dividen — Liga") : t("Perhitungan dividen — Sekolah Bola")}
        formula={isLiga ? t("Dividen = RAB − (Uang modal + Uang masuk registrasi + Uang masuk match fee)") : t("Dividen = Pemasukan − Pengeluaran (sisa saldo)")}
        lines={lines}
        resultLabel={t("Dividen (rumus)")}
        result={fmt.rupiah(dividend)}
        note={
          dividend < 0
            ? isLiga
              ? t("Hasil negatif: uang modal, registrasi, dan match fee bersama-sama sudah melebihi RAB. Bagian tiap pemilik juga negatif.")
              : t("Hasil negatif: pengeluaran lebih besar dari pemasukan. Bagian tiap pemilik juga negatif.")
            : t("Hasil ini ikut dijumlahkan ke akumulasi dividen Owner.")
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t("Dividen (rumus)")} value={fmt.rupiahCompact(dividend)} full={fmt.rupiah(dividend)} icon={<Calculator className="size-4" />} block="red" hint={isLiga ? t("RAB − (modal + registrasi + match fee)") : t("Pemasukan − pengeluaran")} />
        <Kpi label={t("Jumlah pemilik")} value={fmt.number(owners.length)} icon={<Users className="size-4" />} block="blue" hint={owners.length ? owners.map((o) => o.name).join(", ") : t("Belum diatur")} />
        <Kpi
          label={t("Pemilik terbesar")}
          value={biggest ? pct(biggest.owner.shareBp) : "—"}
          full={biggest ? fmt.rupiah(biggest.amount) : undefined}
          icon={<Award className="size-4" />}
          block="yellow"
          hint={biggest ? `${biggest.owner.name} · ${fmt.rupiahCompact(biggest.amount)}` : t("Belum ada data.")}
        />
        <Kpi
          label={t("Total persentase")}
          value={pct(totalBp)}
          icon={<Percent className="size-4" />}
          block="white"
          tone={balanced || owners.length === 0 ? "default" : "warn"}
          hint={balanced ? t("Sudah tepat 100%") : owners.length ? t("Harus tepat 100% — ubah pembagian") : t("Belum ada pemilik")}
        />
      </div>

      {owners.length > 0 && !balanced && (
        <Notice tone="warn" title={t("Persentase belum 100%")} className="mt-4">
          {t("Total persentase pemilik saat ini {total}%. Bagian dividen tetap dibagi menurut perbandingannya, tetapi sebaiknya diperbaiki.", { total: bpToField(totalBp) })}
          {canEdit ? "" : ` ${t("Hubungi Owner untuk memperbaikinya.")}`}
        </Notice>
      )}

      {owners.length > 0 && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("Porsi per pemilik")}</CardTitle>
            </CardHeader>
            <CardContent>
              <RankBars
                items={owners.map((o) => ({ label: o.name, value: o.shareBp, valueLabel: pct(o.shareBp) }))}
                accent="var(--color-chart-1)"
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("Bagian dividen per pemilik")}</CardTitle>
            </CardHeader>
            <CardContent>
              {dividend > 0 ? (
                <ShareDonut
                  centerLabel={t("Dividen")}
                  slices={rows.map((r, i) => ({ label: r.owner.name, value: r.amount, color: CHART_COLORS[i % CHART_COLORS.length] }))}
                />
              ) : (
                <p className="py-10 text-center text-xs text-ink-muted">{t("Belum ada dividen positif untuk dibagikan.")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="mt-4">
        <CardContent className="space-y-4">
          <BlockTitle title={t("Pembagian dividen")} hint={t("Satu baris untuk setiap pemilik unit.")} />
          {owners.length === 0 ? (
            <EmptyState
              icon={Users}
              title={t("Belum ada pemilik")}
              description={canEdit ? t("Klik “Ubah pembagian” untuk mengisi pemilik dan persentase dividennya.") : t("Owner belum mengisi kepemilikan unit ini.")}
            />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH className="w-10">{t("No")}</TH>
                  <TH><ColumnHead label={t("Pemilik")} hint={t("Nama")} /></TH>
                  <TH className="min-w-48"><ColumnHead label={t("Persentase")} hint={t("Bagian dari dividen")} /></TH>
                  <TH className="text-right"><ColumnHead label={t("Bagian dividen")} hint={t("Dividen × persentase")} align="right" /></TH>
                </TR>
              </THead>
              <TBody>
                {rows.map(({ owner, amount }, i) => (
                  <TR key={owner.id}>
                    <TD className="tabular-nums text-ink-muted">{i + 1}</TD>
                    <TD className="font-medium text-ink">{owner.name}</TD>
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <Progress value={(owner.shareBp / BP_TOTAL) * 100} className="w-28" />
                        <span className="w-14 text-right text-xs font-semibold tabular-nums text-ink">{pct(owner.shareBp)}</span>
                      </div>
                    </TD>
                    <TD className="text-right font-medium tabular-nums text-ink">{fmt.rupiah(amount)}</TD>
                  </TR>
                ))}
              </TBody>
              <tfoot>
                <tr className="border-t-2 border-ink bg-surface-2">
                  <td colSpan={2} className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-ink">{t("Total")}</td>
                  <td className="px-3 py-3 text-xs font-bold tabular-nums text-ink">{pct(totalBp)}</td>
                  <td className="px-3 py-3 text-right text-sm font-bold tabular-nums text-ink">{fmt.rupiah(amounts.reduce((a, b) => a + b, 0))}</td>
                </tr>
              </tfoot>
            </Table>
          )}
        </CardContent>
      </Card>

      {schoolTotals && schoolTotals.months.length > 0 && (
        <Card className="mt-4">
          <CardContent className="space-y-4">
            <BlockTitle title={t("Sisa saldo per bulan")} hint={t("Pemasukan − pengeluaran. Jumlah semua bulan adalah dividen di atas.")} />
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>{t("Bulan")}</TH>
                  <TH className="text-right">{t("Pemasukan")}</TH>
                  <TH className="text-right">{t("Pengeluaran")}</TH>
                  <TH className="text-right">{t("Sisa saldo")}</TH>
                </TR>
              </THead>
              <TBody>
                {[...schoolTotals.months].reverse().map((m) => (
                  <TR key={m.month}>
                    <TD className="font-medium text-ink">{fmt.date(`${m.month}-01`, { month: "long", year: "numeric" })}</TD>
                    <TD className="text-right tabular-nums">{fmt.rupiah(m.income)}</TD>
                    <TD className="text-right tabular-nums">{fmt.rupiah(m.expense)}</TD>
                    <TD className="text-right font-semibold tabular-nums text-ink">{fmt.rupiah(m.dividend)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
