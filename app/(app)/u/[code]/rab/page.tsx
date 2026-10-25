import { Fragment } from "react";
import type { Metadata } from "next";
import { Calculator, CalendarClock, CalendarRange, Repeat } from "lucide-react";
import { loadUnitPage } from "@/lib/finance/access";
import { listBudgetItems } from "@/lib/finance/queries";
import { budgetByCategory, budgetLineTotal, budgetTotals, groupBudget, sum, type BudgetGroup } from "@/lib/finance/calc";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { BlockTitle } from "@/components/finance/bits";
import { RankBars, ShareDonut } from "@/components/finance/charts";
import { GuideCard } from "@/components/finance/guide-card";
import { Kpi } from "@/components/finance/kpi";
import { getI18n } from "@/lib/i18n/server";
import { AddRecordButton, DeleteRecordButton, EditRecordButton, type FinanceRecord } from "../forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t("RAB") };
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
  const actions = canInput || canDelete;

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

  const record = (r: (typeof rows)[number]): FinanceRecord => ({
    id: r.id,
    businessUnitId: r.businessUnitId,
    period: r.period,
    category: r.category,
    name: r.name,
    quantity: r.quantity,
    unitPrice: r.unitPrice,
    note: r.note,
  });

  const budgetTable = ({ groups, title, hint, footer }: {
    groups: BudgetGroup<(typeof rows)[number]>[];
    title: string;
    hint: string;
    footer: { label: string; value: number; strong?: boolean }[];
  }) => {
    return (
      <div className="space-y-3">
        <BlockTitle title={title} hint={hint} />
        <div className="w-full overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead className="bg-surface-2 text-[10.5px] font-semibold uppercase tracking-wider text-ink-muted">
              <tr>
                <th className="w-14 px-3 py-2.5 text-left">{t("No")}</th>
                <th className="px-3 py-2.5 text-left">
                  {t("Keterangan biaya")}
                  <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal">{t("Apa yang dibayar")}</span>
                </th>
                <th className="w-20 px-3 py-2.5 text-right">
                  {t("Jumlah")}
                  <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal">{t("Berapa banyak")}</span>
                </th>
                <th className="w-32 px-3 py-2.5 text-right">
                  {t("Harga satuan")}
                  <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal">{t("Per 1 jumlah")}</span>
                </th>
                <th className="w-36 px-3 py-2.5 text-right">
                  {t("Total")}
                  <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal">{t("Jumlah × harga")}</span>
                </th>
                {actions && <th className="w-24 px-2"><span className="sr-only">{t("Aksi")}</span></th>}
              </tr>
            </thead>
            <tbody>
              {groups.map((g, gi) => groupRows(g, gi + 1))}
            </tbody>
            <tfoot>
              {footer.map((f, i) => (
                <tr key={i} className={`border-t ${f.strong ? "border-t-2 border-line bg-surface-2" : "border-line-soft"}`}>
                  <td colSpan={4} className={`px-3 py-2.5 text-right text-xs uppercase tracking-wider ${f.strong ? "font-bold text-ink" : "font-semibold text-ink-secondary"}`}>
                    {f.label}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${f.strong ? "text-sm font-bold text-ink" : "font-semibold text-ink-secondary"}`}>{fmt.rupiah(f.value)}</td>
                  {actions && <td />}
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      </div>
    );
  };

  const groupRows = (group: BudgetGroup<(typeof rows)[number]>, index: number) => {
    return (
      <Fragment key={group.category}>
        <tr className="border-t border-line bg-surface-2/70">
          <td className="px-3 py-2 text-xs font-bold tabular-nums text-ink-secondary">{index}</td>
          <td colSpan={3} className="px-3 py-2 text-[13px] font-semibold text-ink">{group.category}</td>
          <td className="px-3 py-2 text-right text-[13px] font-bold tabular-nums text-ink">{fmt.rupiah(group.subtotal)}</td>
          {actions && <td />}
        </tr>
        {group.items.map((item, ii) => {
          const lineTotal = budgetLineTotal(item);
          return (
            <tr key={item.id} className="border-t border-line-soft transition-colors hover:bg-surface-2/50">
              <td className="px-3 py-2 text-xs tabular-nums text-ink-muted">{index}.{ii + 1}</td>
              <td className="px-3 py-2 text-ink-secondary">
                {item.name}
                {lineTotal === 0 && <Badge className="ml-2 align-middle" tone="neutral">{t("Belum dianggarkan")}</Badge>}
                {item.note && <span className="block text-[11px] text-ink-muted">{item.note}</span>}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">{fmt.number(item.quantity)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">{fmt.rupiah(item.unitPrice)}</td>
              <td className="px-3 py-2 text-right font-medium tabular-nums text-ink">{lineTotal === 0 ? "—" : fmt.rupiah(lineTotal)}</td>
              {actions && (
                <td className="px-2 py-1">
                  <div className="flex justify-end gap-0.5">
                    {canInput && <EditRecordButton kind="budget" record={record(item)} ctx={formCtx} />}
                    {canDelete && <DeleteRecordButton kind="budget" id={item.id} name={item.name} />}
                  </div>
                </td>
              )}
            </tr>
          );
        })}
      </Fragment>
    );
  };

  return (
    <div>
      <PageHeader
        eyebrow={unit.name}
        title={t("RAB")}
        description={t("Rencana Anggaran Biaya: perkiraan seluruh pengeluaran, dari biaya yang berulang tiap minggu sampai biaya yang dikeluarkan sekali.")}
        actions={canInput && <AddRecordButton kind="budget" ctx={formCtx}  />}
      />

      <GuideCard
        id="rab"
        title={t("Cara membaca halaman RAB")}
        intro={t("RAB (Rencana Anggaran Biaya) adalah perkiraan uang yang akan keluar. Biayanya dibagi dua kelompok: yang berulang setiap minggu pertandingan, dan yang dikeluarkan satu kali saja. Setiap kelompok dibagi lagi menjadi kategori dan baris biaya.")}
        terms={[
          { term: t("Mingguan"), text: t("Biaya yang keluar setiap minggu pertandingan (sewa lapangan, honor wasit, konsumsi). Dikalikan jumlah minggu program.") },
          { term: t("Bulanan"), text: t("Biaya yang dikeluarkan satu kali (peralatan, hadiah, seragam, publikasi). Dihitung sekali dalam total.") },
          { term: t("Jumlah × Harga satuan"), text: t("Setiap baris = berapa banyak × harga per satu. Kolom Total sudah menghitungnya.") },
          { term: t("Estimasi OPEX"), text: t("OPEX = biaya operasional. Estimasi = total mingguan seluruh program ditambah total bulanan.") },
        ]}
        tip={t("Baris bertanda “Belum dianggarkan” ada di daftar tetapi nilainya masih 0.")}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t("Estimasi OPEX")} value={fmt.rupiahCompact(grand.total)} full={fmt.rupiah(grand.total)} icon={<Calculator className="size-4" />} block="red" hint={t("Mingguan seluruh program + bulanan")} />
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
                centerLabel={t("Estimasi OPEX")}
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
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-night-muted">{t("Total estimasi OPEX")}</p>
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
