import type { Metadata } from "next";
import { Award, Calculator, HandCoins, Percent, Users, Wallet } from "lucide-react";
import { can } from "@/lib/auth/rbac";
import { loadUnitPage } from "@/lib/finance/access";
import { ligaDataset, listOwners, schoolDataset } from "@/lib/finance/queries";
import { schoolFigures, unitFigures } from "@/lib/finance/calc";
import { BP_TOTAL, bpToField, overviewTaken, ownerPayouts } from "@/lib/finance/ownership";
import { menuHref } from "@/lib/finance/unit-types";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BlockTitle, Notice } from "@/components/finance/bits";
import { CHART_COLORS, RankBars, ShareDonut } from "@/components/finance/charts";
import { Formula, type FormulaLine } from "@/components/finance/formula";
import { GuideCard } from "@/components/finance/guide-card";
import { Kpi } from "@/components/finance/kpi";
import { getI18n } from "@/lib/i18n/server";
import { DividendTable } from "./dividend-table";
import { LeagueFinishedButton } from "./league-button";
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
  // A Liga only has a dividend once its event is over; until then the figures are an estimate (not takeable, not counted for the Owner).
  const generated = !isLiga || !!unit.leagueFinishedOn;
  const payouts = ownerPayouts(dividend, owners);
  const rows = owners.map((o, i) => ({ owner: o, amount: payouts[i].share }));
  const totalBp = owners.reduce((sum, o) => sum + o.shareBp, 0);
  const balanced = totalBp === BP_TOTAL;
  const biggest = rows.reduce<(typeof rows)[number] | null>((top, r) => (!top || r.owner.shareBp > top.owner.shareBp ? r : top), null);
  const editorRows = owners.map((o) => ({ name: o.name, percent: bpToField(o.shareBp), overview: o.inOverview }));
  const takenTotal = owners.reduce((sum, o) => sum + o.takenAmount, 0);
  const finalTotal = dividend - takenTotal;
  const overviewTotal = overviewTaken(owners);
  const flagged = owners.filter((o) => o.inOverview);
  const tableRows = owners.map((o, i) => ({ id: o.id, name: o.name, shareBp: o.shareBp, share: payouts[i].share, taken: o.takenAmount, overview: o.inOverview }));

  const lines: FormulaLine[] = ligaFigures
    ? [
        { label: t("Uang modal"), value: fmt.rupiah(ligaFigures.dividend.capital), href: link("modal") },
        { op: "+", label: t("Uang masuk registrasi"), value: fmt.rupiah(ligaFigures.dividend.registration), href: link("registrasi"), hint: t("DP + pelunasan yang sudah diterima") },
        { op: "+", label: t("Uang masuk match fee"), value: fmt.rupiah(ligaFigures.dividend.matchFee), href: link("match-fee") },
        { op: "−", label: t("RAB Actual"), value: fmt.rupiah(ligaFigures.dividend.actual), href: link("rab-actual"), hint: t("Semua biaya yang benar-benar keluar, di dalam maupun di luar RAB Budget") },
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
            ? t("Bagian atas menghitung dividen unit ini: uang modal ditambah uang masuk registrasi dan match fee, dikurangi RAB Actual (biaya yang benar-benar keluar). Angkanya diambil otomatis dari menu lain. Di bawahnya, dividen itu dibagi ke para pemilik unit sesuai persentase masing-masing.")
            : t("Bagian atas menghitung dividen unit ini: pemasukan dikurangi pengeluaran (sisa saldo). Angkanya diambil otomatis dari menu Pemasukan dan Pengeluaran. Di bawahnya, dividen itu dibagi ke para pemilik unit sesuai persentase masing-masing.")
        }
        terms={[
          { term: t("Dividen (rumus)"), text: t("Hasil perhitungan otomatis. Berubah sendiri saat data di menu lain berubah.") },
          { term: t("Pemilik"), text: t("Orang yang memiliki unit ini. Diisi saat unit dibuat.") },
          { term: t("Persentase"), text: t("Bagian setiap pemilik dari dividen. Totalnya harus 100%. Hanya Owner yang dapat mengubahnya.") },
          { term: t("Bagian dividen"), text: t("Dividen dikali persentase pemilik itu. Dibulatkan ke rupiah penuh dan selalu berjumlah sama dengan dividen.") },
          { term: t("Ambil"), text: isLiga ? t("Uang bagian dividen yang sudah diambil pemilik. Dividen Liga hanya bisa diambil seluruhnya, dan baru setelah event liga selesai.") : t("Uang bagian dividen yang sudah diambil pemilik. Bisa diisi berapa saja, atau centang “Ambil semua”. Hanya Owner yang dapat mengisinya.") },
          { term: t("Sisa dividen"), text: t("Bagian dividen dikurangi yang sudah diambil, yaitu dividen yang belum diambil.") },
          { term: t("Tanda Ringkasan Owner"), text: t("Pemilik bertanda “Ringkasan Owner”: dividen yang sudah diambilnya dijumlahkan ke akumulasi dan target di Ringkasan Owner. Tanda diatur Owner lewat “Ubah pembagian”.") },
        ]}
      />

      {isLiga && (
        <section className="mb-4 flex flex-wrap items-center justify-between gap-3 border-2 border-black bg-white px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{t("Event liga")}</p>
            <p className="mt-0.5 text-sm font-semibold text-ink">
              {unit.leagueFinishedOn
                ? t("Selesai pada {date} — dividen sudah terbentuk", { date: fmt.date(unit.leagueFinishedOn, { day: "numeric", month: "long", year: "numeric" }) })
                : t("Belum selesai — dividen belum terbentuk")}
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">
              {unit.leagueFinishedOn
                ? t("Pemilik bisa mengambil bagiannya. Yang diambil pemilik bertanda “Ringkasan Owner” dijumlahkan di Ringkasan Owner.")
                : canEdit
                  ? t("Angka di bawah masih perkiraan: belum bisa diambil dan belum dihitung di Ringkasan Owner. Tandai selesai bila event liga sudah berakhir.")
                  : t("Angka di bawah masih perkiraan. Owner menandai event selesai setelah liga berakhir; sejak itu dividen bisa diambil.")}
            </p>
          </div>
          {canEdit && <LeagueFinishedButton unitId={unit.id} finished={!!unit.leagueFinishedOn} />}
        </section>
      )}

      <Formula
        className="mb-4"
        title={isLiga ? t("Perhitungan dividen — Liga") : t("Perhitungan dividen — Sekolah Bola")}
        formula={isLiga ? t("Dividen = (Uang modal + Uang masuk registrasi + Uang masuk match fee) − RAB Actual") : t("Dividen = Pemasukan − Pengeluaran (sisa saldo)")}
        lines={lines}
        resultLabel={generated ? t("Dividen (rumus)") : t("Dividen (perkiraan)")}
        result={fmt.rupiah(dividend)}
        note={
          dividend < 0
            ? isLiga
              ? t("Hasil negatif: RAB Actual sudah melebihi uang modal, registrasi, dan match fee bersama-sama. Bagian tiap pemilik juga negatif.")
              : t("Hasil negatif: pengeluaran lebih besar dari pemasukan. Bagian tiap pemilik juga negatif.")
            : generated
              ? t("Dari hasil ini, yang sudah diambil pemilik bertanda “Ringkasan Owner” ikut dijumlahkan ke akumulasi dividen Owner.")
              : t("Belum dijumlahkan ke akumulasi dividen Owner sampai event liga ditandai selesai.")
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label={generated ? t("Dividen (rumus)") : t("Dividen (perkiraan)")} value={fmt.rupiahCompact(dividend)} full={fmt.rupiah(dividend)} icon={<Calculator className="size-4" />} block="red" hint={isLiga ? t("(modal + registrasi + match fee) − RAB Actual") : t("Pemasukan − pengeluaran")} />
        <Kpi
          label={t("Sudah diambil")}
          value={fmt.rupiahCompact(takenTotal)}
          full={fmt.rupiah(takenTotal)}
          icon={<Wallet className="size-4" />}
          block="blue"
          hint={flagged.length ? t("{amount} ke Ringkasan Owner ({names})", { amount: fmt.rupiahCompact(overviewTotal), names: flagged.map((o) => o.name).join(", ") }) : t("Belum ada pemilik bertanda Ringkasan Owner")}
        />
        <Kpi
          label={t("Sisa dividen")}
          value={generated ? fmt.rupiahCompact(finalTotal) : "—"}
          full={generated ? fmt.rupiah(finalTotal) : undefined}
          icon={<HandCoins className="size-4" />}
          block="night"
          hint={generated ? t("Belum diambil oleh pemilik") : t("Terbentuk setelah event liga selesai")}
        />
        <Kpi label={t("Jumlah pemilik")} value={fmt.number(owners.length)} icon={<Users className="size-4" />} block="white" hint={owners.length ? owners.map((o) => o.name).join(", ") : t("Belum diatur")} />
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
            <DividendTable
              key={tableRows.map((r) => `${r.id}:${r.share}:${r.taken}`).join("|")}
              unitId={unit.id}
              rows={tableRows}
              editable={canEdit && generated}
              allOrNothing={isLiga}
              generated={generated}
            />
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
