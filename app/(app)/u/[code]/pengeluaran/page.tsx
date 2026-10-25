import type { Metadata } from "next";
import { ArrowUpFromLine, Receipt, Tags, TrendingUp } from "lucide-react";
import { loadUnitPage } from "@/lib/finance/access";
import { expenseCategories, listExpenses } from "@/lib/finance/queries";
import { expenseByCategory, monthOf, sum } from "@/lib/finance/calc";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BlockTitle, ColumnHead, ProofChip } from "@/components/finance/bits";
import { ColumnChart, RankBars } from "@/components/finance/charts";
import { GuideCard } from "@/components/finance/guide-card";
import { Kpi } from "@/components/finance/kpi";
import { getI18n } from "@/lib/i18n/server";
import { AddRecordButton, DeleteRecordButton, EditRecordButton, type FinanceRecord } from "../forms";

export const metadata: Metadata = { title: "Pengeluaran" };
export const dynamic = "force-dynamic";

export default async function ExpensesPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { unit, form, canInput, canDelete } = await loadUnitPage(code, "sekolah_bola");
  const { fmt } = await getI18n();

  const [rows, categoryNames] = await Promise.all([listExpenses(unit.id), expenseCategories(unit.id)]);
  const formCtx = { ...form, expenseCategories: categoryNames };
  const total = sum(rows, (r) => r.amount);
  const withProof = rows.filter((r) => r.proofUrl).length;
  const categories = expenseByCategory(rows);
  const actions = canInput || canDelete;

  const byMonth = new Map<string, number>();
  for (const r of rows) byMonth.set(monthOf(r.spentOn), (byMonth.get(monthOf(r.spentOn)) ?? 0) + r.amount);
  const timeline = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({ label: fmt.date(`${month}-01`, { month: "short", year: "2-digit" }), value }));
  const biggest = rows.reduce<(typeof rows)[number] | null>((top, r) => (!top || r.amount > top.amount ? r : top), null);

  const record = (r: (typeof rows)[number]): FinanceRecord => ({
    id: r.id,
    businessUnitId: r.businessUnitId,
    spentOn: r.spentOn,
    category: r.category,
    name: r.name,
    amount: r.amount,
    proofUrl: r.proofUrl,
    note: r.note,
  });

  return (
    <div>
      <PageHeader
        eyebrow={unit.name}
        title="Pengeluaran"
        description="Laporan pengeluaran sekolah, lengkap dengan kategori dan bukti struknya."
        actions={canInput && <AddRecordButton kind="expense" ctx={formCtx} />}
      />

      <GuideCard
        id="pengeluaran"
        title="Cara membaca halaman Pengeluaran"
        intro="Setiap uang yang keluar dari sekolah dicatat satu baris: kapan, untuk apa, berapa, dan struknya. Total pengeluaran per bulan dikurangkan dari pemasukan untuk menghitung dividen."
        terms={[
          { term: "Tanggal", text: "Hari uang dikeluarkan. Menentukan bulan tempat pengeluaran dihitung." },
          { term: "Kategori", text: "Kelompok biaya, mis. Sewa lapangan atau Perlengkapan. Dipakai untuk grafik." },
          { term: "Keterangan", text: "Untuk apa uang itu dikeluarkan." },
          { term: "Bukti", text: "Foto atau scan struk. “Belum ada bukti” berarti struknya belum diunggah." },
        ]}
        tip={canInput ? "Ketik kategori baru atau pilih yang sudah ada saat menambah pengeluaran." : undefined}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total pengeluaran" value={fmt.rupiahCompact(total)} full={fmt.rupiah(total)} icon={<ArrowUpFromLine className="size-4" />} block="red" hint={`${fmt.number(rows.length)} catatan`} />
        <Kpi label="Kategori" value={fmt.number(categories.length)} icon={<Tags className="size-4" />} block="blue" hint={categories[0] ? `Terbesar: ${categories[0].category}` : "Belum ada data."} />
        <Kpi
          label="Pengeluaran terbesar"
          value={biggest ? fmt.rupiahCompact(biggest.amount) : "—"}
          full={biggest ? fmt.rupiah(biggest.amount) : undefined}
          icon={<TrendingUp className="size-4" />}
          block="yellow"
          hint={biggest?.name ?? "Belum ada data."}
        />
        <Kpi
          label="Bukti struk"
          value={`${fmt.number(withProof)}/${fmt.number(rows.length)}`}
          icon={<Receipt className="size-4" />}
          block="white"
          tone={rows.length > withProof ? "warn" : "default"}
          hint={rows.length > withProof ? `${rows.length - withProof} catatan belum ada struknya` : "Semua catatan punya bukti"}
        />
      </div>

      {rows.length > 0 && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Pengeluaran per kategori</CardTitle>
            </CardHeader>
            <CardContent>
              <RankBars
                items={categories.slice(0, 8).map((c) => ({
                  label: c.category,
                  value: c.amount,
                  valueLabel: fmt.rupiah(c.amount),
                  sublabel: total ? `${Math.round((c.amount / total) * 100)}%` : undefined,
                }))}
                accent="var(--color-chart-1)"
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Pengeluaran per bulan</CardTitle>
            </CardHeader>
            <CardContent>
              <ColumnChart data={timeline} accent="var(--color-chart-1)" summary={`Pengeluaran per bulan, total ${fmt.rupiah(total)}`} emptyLabel="Belum ada pengeluaran" />
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="mt-4">
        <CardContent className="space-y-4">
          <BlockTitle title="Daftar pengeluaran" hint="Terbaru di atas." />
          {rows.length === 0 ? (
            <EmptyState
              icon={ArrowUpFromLine}
              title="Belum ada pengeluaran tercatat"
              description={canInput ? "Klik “Tambah pengeluaran” untuk mencatat yang pertama." : "Belum ada pengeluaran untuk ditampilkan."}
            />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH className="w-10">No</TH>
                  <TH><ColumnHead label="Tanggal" hint="Hari dikeluarkan" /></TH>
                  <TH><ColumnHead label="Kategori" hint="Kelompok biaya" /></TH>
                  <TH><ColumnHead label="Keterangan" hint="Untuk apa" /></TH>
                  <TH className="text-right"><ColumnHead label="Nominal" hint="Uang keluar" align="right" /></TH>
                  <TH><ColumnHead label="Bukti" hint="Struk" /></TH>
                  {actions && <TH className="w-24"><span className="sr-only">Aksi</span></TH>}
                </TR>
              </THead>
              <TBody>
                {rows.map((r, i) => (
                  <TR key={r.id}>
                    <TD className="tabular-nums text-ink-muted">{i + 1}</TD>
                    <TD className="whitespace-nowrap tabular-nums">{fmt.date(r.spentOn)}</TD>
                    <TD>{r.category}</TD>
                    <TD>
                      <span className="font-medium text-ink">{r.name}</span>
                      {r.note && <span className="block text-[11px] text-ink-muted">{r.note}</span>}
                    </TD>
                    <TD className="text-right font-medium tabular-nums text-ink">{fmt.rupiah(r.amount)}</TD>
                    <TD><ProofChip url={r.proofUrl} viewLabel="Lihat bukti" missingLabel="Belum ada bukti" /></TD>
                    {actions && (
                      <TD>
                        <div className="flex justify-end gap-0.5">
                          {canInput && <EditRecordButton kind="expense" record={record(r)} ctx={formCtx} />}
                          {canDelete && <DeleteRecordButton kind="expense" id={r.id} name={r.name} />}
                        </div>
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
              <tfoot>
                <tr className="border-t-2 border-ink bg-surface-2">
                  <td colSpan={4} className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-ink">
                    Total pengeluaran
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-bold tabular-nums text-ink">{fmt.rupiah(total)}</td>
                  <td colSpan={actions ? 2 : 1} />
                </tr>
              </tfoot>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
