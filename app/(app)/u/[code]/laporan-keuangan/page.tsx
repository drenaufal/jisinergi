import type { Metadata } from "next";
import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { loadUnitPage } from "@/lib/finance/access";
import { listCapital, listExpenses, listStudentPayments } from "@/lib/finance/queries";
import { capitalSummary, financialReport } from "@/lib/finance/calc";
import { menuHref } from "@/lib/finance/unit-types";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Notice } from "@/components/finance/bits";
import { GuideCard } from "@/components/finance/guide-card";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Laporan Keuangan" };
export const dynamic = "force-dynamic";

/**
 * The football school's financial report, laid out like the "LAPORAN KEUANGAN" sheet of the school's workbook:
 * saldo awal, total masuk / total keluar / sisa saldo, then every cash in and cash out by date. It only reads what
 * Pemasukan, Pengeluaran and Modal already hold, so there is nothing to type in here.
 */
export default async function FinancialReportPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { unit } = await loadUnitPage(code, "sekolah_bola");
  const { fmt } = await getI18n();

  const [payments, expenses, capital] = await Promise.all([listStudentPayments(unit.id), listExpenses(unit.id), listCapital(unit.id)]);
  const report = financialReport({ openingBalance: capitalSummary(capital).total, payments, expenses });
  const link = (slug: string) => menuHref(unit.code, slug);
  const day = (iso: string) => fmt.date(iso, { day: "2-digit", month: "short", year: "numeric" });
  const month = (m: string) => fmt.date(`${m}-01`, { month: "short", year: "numeric" });
  const amount = (n: number) => (n ? fmt.number(n) : "");

  return (
    <div>
      <PageHeader
        eyebrow={unit.name}
        title="Laporan Keuangan"
        description="Semua uang masuk dan keluar unit ini dalam satu daftar, dari saldo awal sampai sisa saldo."
      />

      <GuideCard
        id="laporan-keuangan"
        title="Cara membaca Laporan Keuangan"
        intro="Halaman ini sama seperti lembar “Laporan Keuangan” di Excel, tetapi terisi sendiri dari menu lain. Uang masuk datang dari pembayaran siswa di menu Pemasukan, uang keluar dari menu Pengeluaran, dan saldo awal dari menu Modal. Untuk menambah atau mengubah baris, ubah di menu aslinya."
        terms={[
          { term: "Saldo Awal", text: "Total uang yang disetor pemilik di menu Modal." },
          { term: "Total Masuk", text: "Registrasi dan iuran bulanan yang sudah diterima. Uang jersey tidak dihitung." },
          { term: "Total Keluar", text: "Semua pengeluaran sekolah." },
          { term: "Sisa Saldo", text: "Saldo Awal + Total Masuk − Total Keluar." },
          { term: "Absen dan Gaji Satuan", text: "Khusus baris gaji: jumlah hari hadir dan gaji per hari. Nominal Cash Out tetap yang benar-benar dibayarkan." },
        ]}
      />

      <section className="border-2 border-black bg-white">
        <header className="bg-black px-5 py-4 text-center text-white">
          <h2 className="text-base font-semibold uppercase tracking-[0.14em] sm:text-lg">Laporan Keuangan {unit.name}</h2>
        </header>

        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-black px-5 py-3">
          <Link href={link("modal")} className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-secondary underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
            Saldo Awal
          </Link>
          <span className="text-lg font-semibold tabular-nums text-ink" title={fmt.rupiah(report.openingBalance)}>
            {fmt.rupiah(report.openingBalance)}
          </span>
        </div>

        <div className="grid gap-px bg-black sm:grid-cols-3">
          <div className="bg-white p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Total Masuk</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-ink" title={fmt.rupiah(report.totalIn)}>{fmt.rupiah(report.totalIn)}</p>
          </div>
          <div className="bg-white p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Total Keluar</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-ink" title={fmt.rupiah(report.totalOut)}>{fmt.rupiah(report.totalOut)}</p>
          </div>
          <div className="bg-surface-2 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Sisa Saldo</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-ink" title={fmt.rupiah(report.balance)}>{fmt.rupiah(report.balance)}</p>
          </div>
        </div>
      </section>

      <Notice className="mt-4" title="Sisa saldo di sini berbeda dengan menu Dividen">
        Sisa Saldo laporan ini dimulai dari Saldo Awal (modal). Dividen Sekolah Bola di menu Dividen dan Ringkasan Owner hanya menghitung pemasukan − pengeluaran, tanpa modal.
      </Notice>

      <Card className="mt-4">
        <CardContent>
          {report.rows.length === 0 ? (
            <EmptyState
              icon={FileSpreadsheet}
              title="Belum ada uang masuk atau keluar"
              description="Catat pembayaran siswa di menu Pemasukan dan pengeluaran sekolah di menu Pengeluaran; daftarnya muncul di sini."
              action={
                <Link href={link("pemasukan")} className="border border-black bg-black px-4 py-2 text-sm font-semibold text-white">
                  Buka Pemasukan
                </Link>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH className="w-12">No</TH>
                  <TH>Date</TH>
                  <TH>Note</TH>
                  <TH className="text-right">Absen</TH>
                  <TH className="text-right">Gaji Satuan</TH>
                  <TH className="text-right">Cash In</TH>
                  <TH className="text-right">Cash Out</TH>
                </TR>
              </THead>
              <TBody>
                {report.rows.map((r) => (
                  <TR key={r.no}>
                    <TD className="tabular-nums text-ink-muted">{r.no}</TD>
                    <TD className="whitespace-nowrap tabular-nums">{day(r.date)}</TD>
                    <TD>
                      <span className="font-medium text-ink">{r.note}</span>
                      <span className="block text-[11px] text-ink-muted">
                        {r.direction === "in" ? (r.kind === "registration" ? "Registrasi" : "Iuran") + (r.period ? ` ${month(r.period)}` : "") : r.category}
                      </span>
                    </TD>
                    <TD className="text-right tabular-nums">{r.attendanceDays ?? ""}</TD>
                    <TD className="text-right tabular-nums">{r.dailyRate != null ? fmt.number(r.dailyRate) : ""}</TD>
                    <TD className="text-right font-medium tabular-nums text-ink">{amount(r.cashIn)}</TD>
                    <TD className="text-right font-medium tabular-nums text-ink">{amount(r.cashOut)}</TD>
                  </TR>
                ))}
              </TBody>
              <tfoot>
                <tr className="border-t-2 border-ink bg-surface-2 text-sm font-bold tabular-nums text-ink">
                  <td colSpan={5} className="px-3 py-3 text-xs font-semibold uppercase tracking-wider">
                    Total · {fmt.number(report.rows.length)} baris
                  </td>
                  <td className="px-3 py-3 text-right">{fmt.number(report.totalIn)}</td>
                  <td className="px-3 py-3 text-right">{fmt.number(report.totalOut)}</td>
                </tr>
              </tfoot>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
