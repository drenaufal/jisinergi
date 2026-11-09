import type { Metadata } from "next";
import { Calculator, CalendarClock, CalendarRange, Repeat } from "lucide-react";
import { loadUnitPage } from "@/lib/finance/access";
import { listBudgetItems } from "@/lib/finance/queries";
import { budgetByCategory, budgetLineTotal, budgetTotals, groupBudget, sum, type BudgetGroup } from "@/lib/finance/calc";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { BlockTitle } from "@/components/finance/bits";
import { RankBars, ShareDonut } from "@/components/finance/charts";
import { GuideCard } from "@/components/finance/guide-card";
import { Kpi } from "@/components/finance/kpi";
import { getI18n } from "@/lib/i18n/server";
import { AddRecordButton } from "../forms";
import { BudgetTable, type BudgetFooterRow } from "./budget-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t("RAB Budget") };
}
export const dynamic = "force-dynamic";

export default async function BudgetPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { unit, form, canInput, canDelete } = await loadUnitPage(code, "liga");
  const { t, fmt } = await getI18n();

  const rows = await listBudgetItems(unit.id);
  const categories = [...new Map(rows.map((r) => [`${r.period}|${r.category}`, { category: r.category, period: r.period, order: r.categoryOrder }])).values()]
    .sort((a, b) => a.order - b.order)
    .map(({ category, period }) => ({ category, period }));
  const formCtx = { ...form, categories };
  // a saved RAB line is final: there is no edit button, only the owner may still delete one
  const actions = canDelete;

  const blocks = [unit].map((unit) => {
      const mine = rows.filter((r) => r.businessUnitId === unit.id);
      return { unit, mine, groups: groupBudget(mine), totals: budgetTotals(mine, unit.programWeeks) };
    });

  const grand = {
    weeklyPerWeek: sum(blocks, (b) => b.totals.weeklyPerWeek),
    weeklyProgram: sum(blocks, (b) => b.totals.weeklyProgram),
    monthly: sum(blocks, (b) => b.totals.monthly),
    total: sum(blocks, (b) => b.totals.total),
  };
  const weeksLabel = new Set(blocks.map((b) => b.unit.programWeeks)).size === 1 ? blocks[0]?.unit.programWeeks : null;

  // what each category costs over the whole program, merged across the units in view
  const byCategory = new Map<string, number>();
  for (const b of blocks) for (const c of budgetByCategory(b.mine, b.unit.programWeeks)) byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + c.amount);
  const ranked = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, 8);
  const rest = sum(ranked.slice(8), ([, v]) => v);

  /** One part of the RAB (weekly or monthly): the categories fold, the lines are cost rows. */
  const budgetTable = ({ groups, title, hint, footer }: {
    groups: BudgetGroup<(typeof rows)[number]>[];
    title: string;
    hint: string;
    footer: BudgetFooterRow[];
  }) => (
    <div className="space-y-3">
      <BlockTitle title={title} hint={hint} />
      <BudgetTable
        part={title}
        groups={groups.map((g) => ({
          category: g.category,
          subtotal: g.subtotal,
          items: g.items.map((item) => ({ id: item.id, name: item.name, isAsset: item.isAsset, note: item.note, quantity: item.quantity, unitPrice: item.unitPrice, total: budgetLineTotal(item) })),
        }))}
        footer={footer}
        canDelete={actions}
      />
    </div>
  );

  return (
    <div>
      <PageHeader
        eyebrow={unit.name}
        title={t("RAB Budget")}
        description={t("Rencana Anggaran Biaya: perkiraan seluruh pengeluaran, dari biaya yang berulang tiap minggu sampai biaya yang dikeluarkan sekali.")}
        actions={canInput && <AddRecordButton kind="budget" ctx={formCtx}  />}
      />

      <GuideCard
        id="rab"
        title={t("Cara membaca halaman RAB Budget")}
        intro={t("RAB Budget (Rencana Anggaran Biaya) adalah perkiraan uang yang akan keluar. Biayanya dibagi dua kelompok: yang berulang setiap minggu pertandingan, dan yang dikeluarkan satu kali saja. Setiap kelompok dibagi lagi menjadi kategori dan baris biaya.")}
        terms={[
          { term: t("Mingguan"), text: t("Biaya yang keluar setiap minggu pertandingan (sewa lapangan, honor wasit, konsumsi). Dikalikan jumlah minggu program.") },
          { term: t("Bulanan"), text: t("Biaya yang dikeluarkan satu kali (peralatan, hadiah, seragam, publikasi). Dihitung sekali dalam total.") },
          { term: t("Jumlah Satuan × Harga satuan"), text: t("Setiap baris = jumlah satuan (berapa banyak) × harga per satuan. Kolom Total sudah menghitungnya.") },
          // { term: t("Estimasi OPEX"), text: t("OPEX = biaya operasional. Estimasi = total mingguan seluruh program ditambah total bulanan.") },
          { term: t("Aset / Non aset"), text: t("Baris Aset adalah barang yang akan dimiliki unit; pembelian sebenarnya (biaya actual di RAB Actual) otomatis tercatat di menu Aset. Non aset hanya menjadi anggaran.") },
        ]}
        tip={t("Baris RAB Budget yang sudah disimpan tidak dapat diubah lagi, jadi periksa dulu sebelum menyimpan. Baris bertanda “Aset” masuk ke menu Aset begitu barangnya benar-benar dibeli, yaitu saat biaya actualnya dicatat di menu RAB Actual. Klik nama kategori untuk melipat atau membukanya.")}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t("Total RAB Budget")} value={fmt.rupiahCompact(grand.total)} full={fmt.rupiah(grand.total)} icon={<Calculator className="size-4" />} block="red" hint={t("Mingguan seluruh program + bulanan")} />
        <Kpi label={t("Biaya per minggu")} value={fmt.rupiahCompact(grand.weeklyPerWeek)} full={fmt.rupiah(grand.weeklyPerWeek)} icon={<Repeat className="size-4" />} block="blue" hint={t("Untuk satu minggu pertandingan")} />
        <Kpi
          label={t("Total mingguan")}
          value={fmt.rupiahCompact(grand.weeklyProgram)}
          full={fmt.rupiah(grand.weeklyProgram)}
          icon={<CalendarRange className="size-4" />}
          block="yellow"
          hint={weeksLabel ? t("Per minggu × {n} minggu", { n: weeksLabel }) : t("Per minggu × minggu program")}
        />
        <Kpi label={t("Total bulanan")} value={fmt.rupiahCompact(grand.monthly)} full={fmt.rupiah(grand.monthly)} icon={<CalendarClock className="size-4" />} block="night" hint={t("Dikeluarkan satu kali")} />
      </div>

      {rows.length > 0 && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("Porsi biaya per kategori")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-[11px] text-ink-muted">{t("Biaya mingguan sudah dikalikan jumlah minggu program.")}</p>
              <RankBars
                items={[...top, ...(rest > 0 ? [[t("Lainnya"), rest] as [string, number]] : [])].map(([label, value]) => ({
                  label,
                  value,
                  valueLabel: fmt.rupiahCompact(value),
                  sublabel: grand.total ? `${Math.round((value / grand.total) * 100)}%` : undefined,
                }))}
                accent="var(--color-chart-1)"
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("Mingguan vs bulanan")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ShareDonut
                centerLabel={t("Total RAB Budget")}
                slices={[
                  { label: t("Mingguan (seluruh program)"), value: grand.weeklyProgram, color: "var(--color-chart-1)" },
                  { label: t("Bulanan (sekali)"), value: grand.monthly, color: "var(--color-chart-2)" },
                ]}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {blocks.length === 0 ? (
        <Card className="mt-4">
          <CardContent>
            <EmptyState
              icon={Calculator}
              title={t("Belum ada anggaran tercatat")}
              description={canInput ? t("Klik “Tambah baris RAB” untuk mulai menyusun anggaran.") : t("Belum ada anggaran untuk ditampilkan.")}
            />
          </CardContent>
        </Card>
      ) : (
        blocks.map((b) => (
          <Card key={b.unit.id} className="mt-4">
            <CardContent className="space-y-8">
              {b.mine.length === 0 && (
                <EmptyState
                  icon={Calculator}
                  title={t("Belum ada anggaran tercatat")}
                  description={canInput ? t("Klik “Tambah baris RAB” untuk mulai menyusun anggaran.") : t("Belum ada anggaran untuk ditampilkan.")}
                />
              )}
              {b.mine.length > 0 && budgetTable({
                title: t("Biaya mingguan"),
                hint: t("Berulang setiap minggu pertandingan. Dikalikan {n} minggu program.", { n: b.unit.programWeeks }),
                groups: b.groups.weekly,
                footer: [
                  { label: t("Total per minggu"), value: b.totals.weeklyPerWeek },
                  { label: t("× {n} minggu = total mingguan", { n: b.unit.programWeeks }), value: b.totals.weeklyProgram, strong: true },
                ],
              })}
              {b.mine.length > 0 && budgetTable({
                title: t("Biaya bulanan"),
                hint: t("Dikeluarkan satu kali. Dihitung sekali dalam total."),
                groups: b.groups.monthly,
                footer: [{ label: t("Total bulanan"), value: b.totals.monthly, strong: true }],
              })}
              {b.mine.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-night px-5 py-4 text-white">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-night-muted">{t("Total RAB Budget")}</p>
                    <p className="text-xs text-night-muted">{t("Total mingguan + total bulanan")}</p>
                  </div>
                  <p className="font-display text-3xl tracking-wide tabular-nums">{fmt.rupiah(b.totals.total)}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
