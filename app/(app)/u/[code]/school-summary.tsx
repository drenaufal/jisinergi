import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine, CalendarCheck, HandCoins, Percent, Users } from "lucide-react";
import type { UnitInfo } from "@/lib/finance/access";
import { schoolDataset } from "@/lib/finance/queries";
import { expenseByCategory, schoolFigures, studentStatus } from "@/lib/finance/calc";
import { menuHref } from "@/lib/finance/unit-types";
import { currentMonth } from "@/lib/finance/period";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BlockTitle, Notice } from "@/components/finance/bits";
import { RankBars, ShareDonut } from "@/components/finance/charts";
import { Formula } from "@/components/finance/formula";
import { GroupedColumns } from "@/components/finance/grouped-chart";
import { GuideCard } from "@/components/finance/guide-card";
import { Kpi } from "@/components/finance/kpi";
import { getI18n } from "@/lib/i18n/server";

/** Summary of one Sekolah Bola unit: income, expenses and the monthly dividend. */
export async function SchoolSummary({ unit }: { unit: UnitInfo }) {
  const { fmt } = await getI18n();
  const { students, payments, expenses } = await schoolDataset(unit.id);
  const f = schoolFigures({ students: students.length, payments, expenses });
  const link = (slug: string) => menuHref(unit.code, slug);
  const month = currentMonth();
  const paidThisMonth = students.filter((s) => studentStatus(payments, s.id, month).paidThisMonth).length;
  const monthLabel = (m: string) => fmt.date(`${m}-01`, { month: "short", year: "2-digit" });
  const empty = students.length + expenses.length === 0;
  const categories = expenseByCategory(expenses);

  return (
    <div>
      <PageHeader eyebrow={unit.name} title="Ringkasan unit" description="Pemasukan dari siswa, pengeluaran sekolah, dan dividen per bulan." />

      <GuideCard
        id="ringkasan-sekolah"
        title="Cara membaca ringkasan ini"
        intro="Sekolah Bola mencatat dua hal: uang yang masuk dari siswa (menu Pemasukan) dan uang yang dikeluarkan sekolah (menu Pengeluaran). Dividen adalah selisih keduanya, dihitung setiap bulan dan dijumlahkan."
        terms={[
          { term: "Pemasukan", text: "Registrasi, pembelian jersey, dan iuran bulanan yang sudah diterima." },
          { term: "Pengeluaran", text: "Semua biaya yang dikeluarkan sekolah, menurut tanggal pengeluarannya." },
          { term: "Dividen per bulan", text: "Pemasukan bulan itu dikurangi pengeluaran bulan itu. Bisa negatif jika pengeluaran lebih besar." },
          { term: "Diskon diberikan", text: "Potongan registrasi dan iuran. Hanya informasi — bukan bagian dari uang yang diterima." },
        ]}
      />

      {empty && (
        <Notice tone="info" title="Belum ada data" className="mb-4">
          Mulai dari menu Pemasukan: tambahkan siswa, lalu catat pembayarannya. Pengeluaran dicatat di menu Pengeluaran.
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Link href={link("pemasukan")} className="block transition-transform hover:-translate-y-0.5">
          <Kpi label="Pemasukan" value={fmt.rupiahCompact(f.income.total)} full={fmt.rupiah(f.income.total)} icon={<ArrowDownToLine className="size-4" />} block="red" hint={`Registrasi ${fmt.rupiahCompact(f.income.registration)} · jersey ${fmt.rupiahCompact(f.income.jersey)} · bulanan ${fmt.rupiahCompact(f.income.monthly)}`} />
        </Link>
        <Link href={link("pengeluaran")} className="block transition-transform hover:-translate-y-0.5">
          <Kpi label="Pengeluaran" value={fmt.rupiahCompact(f.expense)} full={fmt.rupiah(f.expense)} icon={<ArrowUpFromLine className="size-4" />} block="blue" hint={`${fmt.number(expenses.length)} catatan pengeluaran`} />
        </Link>
        <Kpi label="Dividen (akumulasi)" value={fmt.rupiahCompact(f.dividend)} full={fmt.rupiah(f.dividend)} icon={<HandCoins className="size-4" />} block="night" hint="Pemasukan − pengeluaran, semua bulan" />
        <Link href={link("pemasukan")} className="block transition-transform hover:-translate-y-0.5">
          <Kpi label="Siswa terdaftar" value={fmt.number(students.length)} icon={<Users className="size-4" />} block="white" hint="Klik untuk melihat daftar siswa" />
        </Link>
        <Kpi
          label="Iuran bulan ini"
          value={`${fmt.number(paidThisMonth)}/${fmt.number(students.length)}`}
          icon={<CalendarCheck className="size-4" />}
          block="white"
          tone={students.length > paidThisMonth ? "warn" : "default"}
          hint={students.length > paidThisMonth ? `${fmt.number(students.length - paidThisMonth)} siswa belum membayar ${monthLabel(month)}` : `Semua siswa sudah membayar ${monthLabel(month)}`}
        />
        <Kpi label="Diskon diberikan" value={fmt.rupiahCompact(f.income.discounts)} full={fmt.rupiah(f.income.discounts)} icon={<Percent className="size-4" />} block="yellow" hint="Registrasi dan iuran bulanan" />
      </div>

      <Formula
        className="mt-4"
        title="Perhitungan dividen — Sekolah Bola"
        formula="Dividen per bulan = Pemasukan − Pengeluaran"
        lines={[
          { label: "Total pemasukan", value: fmt.rupiah(f.income.total), href: link("pemasukan"), hint: "Registrasi + jersey + iuran bulanan" },
          { op: "−", label: "Total pengeluaran", value: fmt.rupiah(f.expense), href: link("pengeluaran") },
        ]}
        resultLabel="Dividen (akumulasi)"
        result={fmt.rupiah(f.dividend)}
        note="Tabel di bawah memecah angka ini per bulan. Hasil akumulasi ikut dijumlahkan ke dividen Owner."
      />

      {f.months.length > 0 && (
        <div className="mt-4 grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Pemasukan dan pengeluaran per bulan</CardTitle>
            </CardHeader>
            <CardContent>
              <GroupedColumns
                data={f.months.map((m) => ({ label: monthLabel(m.month), values: [m.income, m.expense] }))}
                series={[
                  { label: "Pemasukan", style: "solid" },
                  { label: "Pengeluaran", style: "hatch" },
                ]}
                summary={`Pemasukan dan pengeluaran per bulan, dividen ${fmt.rupiah(f.dividend)}`}
              />
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Sumber pemasukan</CardTitle>
            </CardHeader>
            <CardContent>
              {f.income.total > 0 ? (
                <ShareDonut
                  size={116}
                  centerLabel="Pemasukan"
                  slices={[
                    { label: "Iuran bulanan", value: f.income.monthly, color: "var(--color-chart-1)" },
                    { label: "Registrasi", value: f.income.registration, color: "var(--color-chart-3)" },
                    { label: "Jersey", value: f.income.jersey, color: "var(--color-chart-4)" },
                  ]}
                />
              ) : (
                <p className="py-10 text-center text-xs text-ink-muted">Belum ada pemasukan tercatat</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="mt-4">
        <CardContent className="space-y-4">
          <BlockTitle title="Dividen per bulan" hint="Pemasukan − pengeluaran. Bulan tanpa catatan tidak ditampilkan." />
          {f.months.length === 0 ? (
            <p className="py-6 text-center text-xs text-ink-muted">Belum ada pemasukan atau pengeluaran tercatat.</p>
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Bulan</TH>
                  <TH className="text-right">Pemasukan</TH>
                  <TH className="text-right">Pengeluaran</TH>
                  <TH className="text-right">Dividen</TH>
                </TR>
              </THead>
              <TBody>
                {[...f.months].reverse().map((m) => (
                  <TR key={m.month}>
                    <TD className="font-medium text-ink">{fmt.date(`${m.month}-01`, { month: "long", year: "numeric" })}</TD>
                    <TD className="text-right tabular-nums">{fmt.rupiah(m.income)}</TD>
                    <TD className="text-right tabular-nums">{fmt.rupiah(m.expense)}</TD>
                    <TD className="text-right font-semibold tabular-nums text-ink">{fmt.rupiah(m.dividend)}</TD>
                  </TR>
                ))}
              </TBody>
              <tfoot>
                <tr className="border-t-2 border-ink bg-surface-2 text-sm font-bold tabular-nums text-ink">
                  <td className="px-3 py-3 text-xs font-semibold uppercase tracking-wider">Total</td>
                  <td className="px-3 py-3 text-right">{fmt.rupiah(f.income.total)}</td>
                  <td className="px-3 py-3 text-right">{fmt.rupiah(f.expense)}</td>
                  <td className="px-3 py-3 text-right">{fmt.rupiah(f.dividend)}</td>
                </tr>
              </tfoot>
            </Table>
          )}
        </CardContent>
      </Card>

      {categories.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Pengeluaran terbesar per kategori</CardTitle>
            <Link href={link("pengeluaran")} className="text-[11px] text-ink-muted hover:text-ink">
              Rincian →
            </Link>
          </CardHeader>
          <CardContent>
            <RankBars
              items={categories.slice(0, 8).map((c) => ({
                label: c.category,
                value: c.amount,
                valueLabel: fmt.rupiah(c.amount),
                sublabel: f.expense ? `${Math.round((c.amount / f.expense) * 100)}%` : undefined,
              }))}
              accent="var(--color-chart-1)"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
