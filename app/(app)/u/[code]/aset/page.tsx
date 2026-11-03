import type { Metadata } from "next";
import { Package, Receipt, ShoppingBag, Trophy } from "lucide-react";
import { loadUnitPage } from "@/lib/finance/access";
import { listAssets } from "@/lib/finance/queries";
import { cumulativeByDate, sum } from "@/lib/finance/calc";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BlockTitle, ColumnHead, ProofChip } from "@/components/finance/bits";
import { ColumnChart, RankBars } from "@/components/finance/charts";
import { GuideCard } from "@/components/finance/guide-card";
import { Kpi } from "@/components/finance/kpi";
import { getI18n } from "@/lib/i18n/server";
import { AddRecordButton, DeleteRecordButton, EditRecordButton, type FinanceRecord } from "../forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t("Aset") };
}
export const dynamic = "force-dynamic";

export default async function AssetsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { unit, form, canInput, canDelete } = await loadUnitPage(code);
  const { t, fmt } = await getI18n();

  const rows = await listAssets(unit.id);
  const total = sum(rows, (r) => r.amount);
  const withProof = rows.filter((r) => r.proofUrl).length;
  const biggest = rows.reduce<(typeof rows)[number] | null>((top, r) => (!top || r.amount > top.amount ? r : top), null);

  // one bar per purchase day; once there are too many days, group by month so the chart stays readable
  const days = cumulativeByDate(rows);
  const byMonth = days.length > 12;
  const buckets = new Map<string, number>();
  for (const d of days) {
    const key = byMonth ? d.date.slice(0, 7) + "-01" : d.date;
    buckets.set(key, (buckets.get(key) ?? 0) + d.amount);
  }
  const timeline = [...buckets.entries()].map(([date, value]) => ({
    label: fmt.date(date, byMonth ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" }),
    value,
  }));


  const record = (r: (typeof rows)[number]): FinanceRecord => ({
    id: r.id,
    businessUnitId: r.businessUnitId,
    purchasedOn: r.purchasedOn,
    name: r.name,
    amount: r.amount,
    proofUrl: r.proofUrl,
    note: r.note,
  });
  const proofLabels = { viewLabel: t("Lihat bukti"), missingLabel: t("Belum ada bukti") };

  return (
    <div>
      <PageHeader
        eyebrow={unit.name}
        title={t("Aset")}
        description={t("Peralatan dan sarana pertandingan yang dibeli unit bisnis, lengkap dengan harga dan bukti struknya.")}
        actions={canInput && <AddRecordButton kind="asset" ctx={form} />}
      />

      <GuideCard
        id="aset"
        title={t("Cara membaca halaman Aset")}
        intro={t("Aset adalah barang yang dimiliki unit bisnis, misalnya dispenser, sound system, atau meja lipat. Setiap pembelian dicatat sekali: kapan dibeli, apa, berapa harganya, dan struk buktinya. Baris RAB atau pengeluaran yang ditandai Aset masuk ke sini otomatis.")}
        terms={[
          { term: t("Tanggal"), text: t("Hari barang dibeli.") },
          { term: t("Sarana pertandingan"), text: t("Nama barang yang dibeli.") },
          { term: t("Nominal"), text: t("Harga yang dibayarkan, dalam Rupiah.") },
          { term: t("Bukti"), text: t("Foto atau scan struk. “Belum ada bukti” berarti struknya belum diunggah.") },
          { term: t("Otomatis"), text: t("Baris bertanda “Dari RAB” atau “Dari pengeluaran” dibuat otomatis dan mengikuti sumbernya, jadi tidak dapat diubah di sini.") },
        ]}
        tip={canInput ? t("Klik ikon pensil untuk memperbaiki sebuah baris, atau chip hijau “Lihat bukti” untuk membuka struknya.") : t("Klik chip hijau “Lihat bukti” untuk membuka struk pembelian.")}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t("Total aset")} value={fmt.rupiahCompact(total)} full={fmt.rupiah(total)} icon={<Package className="size-4" />} block="red" hint={t("{n} pembelian", { n: fmt.number(rows.length) })} />
        <Kpi
          label={t("Pembelian terbesar")}
          value={biggest ? fmt.rupiahCompact(biggest.amount) : "—"}
          full={biggest ? fmt.rupiah(biggest.amount) : undefined}
          icon={<Trophy className="size-4" />}
          block="blue"
          hint={biggest?.name ?? t("Belum ada data.")}
        />
        <Kpi
          label={t("Rata-rata per pembelian")}
          value={rows.length ? fmt.rupiahCompact(Math.round(total / rows.length)) : "—"}
          full={rows.length ? fmt.rupiah(Math.round(total / rows.length)) : undefined}
          icon={<ShoppingBag className="size-4" />}
          block="yellow"
          hint={t("Total dibagi jumlah pembelian")}
        />
        <Kpi
          label={t("Bukti struk")}
          value={`${fmt.number(withProof)}/${fmt.number(rows.length)}`}
          icon={<Receipt className="size-4" />}
          block="night"
          tone={rows.length > withProof ? "danger" : "default"}
          hint={rows.length > withProof ? t("{n} pembelian belum ada struknya", { n: rows.length - withProof }) : t("Semua pembelian punya bukti")}
        />
      </div>

      {rows.length > 0 && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("Nilai per sarana")}</CardTitle>
            </CardHeader>
            <CardContent>
              <RankBars
                items={[...rows]
                  .sort((a, b) => b.amount - a.amount)
                  .slice(0, 8)
                  .map((r) => ({ label: r.name, value: r.amount, valueLabel: fmt.rupiah(r.amount) }))}
                accent="var(--color-chart-1)"
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{byMonth ? t("Pembelian aset per bulan") : t("Pembelian aset per tanggal")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ColumnChart
                data={timeline}
                accent="var(--color-chart-2)"
                summary={t("Pembelian aset, total {total}", { total: fmt.rupiah(total) })}
                emptyLabel={t("Belum ada pembelian")}
              />
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="mt-4">
        <CardContent className="space-y-4">
          <BlockTitle title={t("Daftar pembelian aset")} hint={t("Urut dari pembelian paling awal.")} />
          {rows.length === 0 ? (
            <EmptyState
              icon={Package}
              title={t("Belum ada aset tercatat")}
              description={canInput ? t("Klik “Tambah aset” untuk mencatat pembelian pertama.") : t("Belum ada pembelian aset untuk ditampilkan.")}
            />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH className="w-10">No</TH>
                  <TH><ColumnHead label={t("Tanggal")} hint={t("Hari dibeli")} /></TH>
                  <TH><ColumnHead label={t("Sarana pertandingan")} hint={t("Nama barang")} /></TH>
                  <TH className="text-right"><ColumnHead label={t("Nominal")} hint={t("Harga dibayar")} align="right" /></TH>
                  <TH><ColumnHead label={t("Bukti")} hint={t("Struk pembelian")} /></TH>
                  {(canInput || canDelete) && <TH className="w-24"><span className="sr-only">{t("Aksi")}</span></TH>}
                </TR>
              </THead>
              <TBody>
                {rows.map((r, i) => (
                  <TR key={r.id}>
                    <TD className="tabular-nums text-ink-muted">{i + 1}</TD>
                    <TD className="whitespace-nowrap tabular-nums">{fmt.date(r.purchasedOn)}</TD>
                    <TD>
                      <span className="font-medium text-ink">{r.name}</span>
                      {r.budgetItemId && <Badge className="ml-2 align-middle" tone="info">{t("Dari RAB")}</Badge>}
                      {r.expenseId && <Badge className="ml-2 align-middle" tone="info">{t("Dari pengeluaran")}</Badge>}
                      {r.note && <span className="block text-[11px] text-ink-muted">{r.note}</span>}
                    </TD>
                    <TD className="text-right font-medium tabular-nums text-ink">{fmt.rupiah(r.amount)}</TD>
                    <TD><ProofChip url={r.proofUrl} {...proofLabels} /></TD>
                    {(canInput || canDelete) && (
                      <TD>
                        <div className="flex justify-end gap-0.5">
                          {canInput && !r.budgetItemId && !r.expenseId && <EditRecordButton kind="asset" record={record(r)} ctx={form} />}
                          {canDelete && !r.budgetItemId && !r.expenseId && <DeleteRecordButton kind="asset" id={r.id} name={r.name} />}
                        </div>
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
              <tfoot>
                <tr className="border-t-2 border-line bg-surface-2">
                  <td colSpan={3} className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                    {t("Total aset")}
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-bold tabular-nums text-ink">{fmt.rupiah(total)}</td>
                  <td colSpan={canInput || canDelete ? 2 : 1} />
                </tr>
              </tfoot>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
