import { Fragment } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Calculator, ClipboardList, Gauge, PiggyBank, Receipt, Wallet } from "lucide-react";
import { loadUnitPage } from "@/lib/finance/access";
import { listActualCosts, listActualItems, listBudgetItems } from "@/lib/finance/queries";
import {
  buildActualGrid,
  weekNumber,
  weekStartDate,
  weeklyVariance,
  type ActualCostInput,
  type ActualLineInput,
  type ActualSection,
} from "@/lib/finance/calc";
import { menuHref } from "@/lib/finance/unit-types";
import { APP_TIME_ZONE } from "@/lib/i18n/format";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, Progress } from "@/components/ui/misc";
import { BlockTitle, Notice } from "@/components/finance/bits";
import { ColumnChart, RankBars } from "@/components/finance/charts";
import { GuideCard } from "@/components/finance/guide-card";
import { Kpi } from "@/components/finance/kpi";
import { getI18n } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";
import { AddRecordButton } from "../forms";
import { CostDetail, type DetailCost, type DetailLine } from "./cost-detail";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t("RAB Actual") };
}
export const dynamic = "force-dynamic";

/** "a.", "b.", … then "27.", "28." once the alphabet runs out. */
const letter = (i: number) => (i < 26 ? `${String.fromCharCode(97 + i)}.` : `${i + 1}.`);
const todayInApp = () => new Date().toLocaleDateString("sv-SE", { timeZone: APP_TIME_ZONE });
const costKey = (c: { budgetItemId: string | null; actualItemId: string | null }) => (c.budgetItemId ? `b:${c.budgetItemId}` : `a:${c.actualItemId}`);

/**
 * RAB Actual, laid out like the Excel sheet it replaces: the RAB's cost lines and budgets as rows, the money really
 * spent as week columns, in two parts (weekly costs, then monthly one-off costs) with a grand total underneath.
 * Every cost is booked on a line with its date and receipt and lands in the week that date falls in; a click on a
 * line shows its costs.
 */
export default async function ActualBudgetPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { unit, form, canInput, canDelete } = await loadUnitPage(code, "liga");
  const { t, fmt } = await getI18n();

  const [budget, extras, costs] = await Promise.all([listBudgetItems(unit.id), listActualItems(unit.id), listActualCosts(unit.id)]);

  const lines: ActualLineInput[] = [
    ...budget.map((b) => ({
      key: `b:${b.id}`,
      source: "budget" as const,
      id: b.id,
      category: b.category,
      groupOrder: b.categoryOrder,
      name: b.name,
      itemOrder: b.itemOrder,
      period: b.period,
      budget: b.quantity * b.unitPrice,
      isAsset: b.isAsset,
    })),
    ...extras.map((e, i) => ({
      key: `a:${e.id}`,
      source: "extra" as const,
      id: e.id,
      category: e.category,
      groupOrder: 1_000_000,
      name: e.name,
      itemOrder: i,
      period: e.period,
      budget: 0,
      isAsset: false,
    })),
  ];
  const costInputs: ActualCostInput[] = costs.map((c) => ({ lineKey: costKey(c), amount: c.amount, spentOn: c.spentOn }));
  const grid = buildActualGrid(lines, costInputs, unit.programWeeks, unit.programStartsOn);
  const sections = [grid.weekly, grid.monthly];
  const allGroups = sections.flatMap((s) => s.groups);

  const actions = canInput;
  const periodLabel = (p: "weekly" | "monthly") => (p === "weekly" ? t("Per minggu") : t("Sekali"));
  const weekHead = (w: number) => (w >= 1 ? t("Week {n}", { n: w }) : t("Sebelum"));
  const weekDate = (w: number) => (grid.start && w >= 1 ? fmt.date(weekStartDate(grid.start, w), { day: "numeric", month: "short" }) : null);

  const formCtx = {
    ...form,
    actualLines: sections.flatMap((s) => s.groups.flatMap((g) => g.lines.map((l) => ({ key: l.key, label: l.name, category: g.category, period: s.period })))),
    actualCategories: [...new Set(allGroups.map((g) => g.category))],
    programStart: grid.start,
  };
  const costsOf = (key: string): DetailCost[] =>
    costs
      .filter((c) => costKey(c) === key)
      .map((c) => ({
        id: c.id,
        businessUnitId: c.businessUnitId,
        itemRef: key,
        amount: c.amount,
        spentOn: c.spentOn,
        week: grid.start ? Math.max(0, weekNumber(grid.start, c.spentOn)) : null,
        proofUrl: c.proofUrl,
        note: c.note,
      }));
  const extraById = new Map(extras.map((e) => [e.id, e]));

  // Weekly costs against the weekly budget, for the weeks that have started (and have costs): the "selisih" rows of the sheet.
  const lastWeeklyWeek = Math.max(0, ...Object.keys(grid.weekly.totals.byWeek).map(Number));
  const currentWeek = grid.start ? Math.max(0, weekNumber(grid.start, todayInApp())) : lastWeeklyWeek;
  const variance = weeklyVariance(grid.weekly, Math.min(currentWeek, lastWeeklyWeek));

  const absorbed = grid.totals.programBudget > 0 ? grid.totals.total / grid.totals.programBudget : 0;
  const over = grid.totals.remaining < 0;
  const weekTotals = grid.weeks.map((w) => ({ label: w >= 1 ? `${w}` : t("Sebelum"), value: grid.totals.byWeek[w] ?? 0 }));
  const ranked = allGroups
    .reduce<Map<string, { category: string; total: number; budget: number }>>((map, g) => {
      const cur = map.get(g.category.toLowerCase()) ?? { category: g.category, total: 0, budget: 0 };
      cur.total += g.total;
      cur.budget += g.programBudget;
      return map.set(g.category.toLowerCase(), cur);
    }, new Map())
    .values();
  const rankedList = [...ranked].filter((g) => g.total > 0).sort((a, b) => b.total - a.total);
  const empty = allGroups.length === 0;
  const diffLabel = (n: number) => (n === 0 ? "0" : `${n > 0 ? "▲" : "▼"} ${fmt.number(Math.abs(n))}`);

  const renderSection = (section: ActualSection, title: string, hint: string) => {
    if (section.groups.length === 0) return null;
    const weekly = section.period === "weekly";
    const cols = grid.weeks.length + (weekly ? 5 : 4) + (actions ? 1 : 0);
    const sectionOver = section.totals.remaining < 0;
    return (
      <Card key={section.period} className="mt-4">
        <CardContent className="space-y-4">
          <BlockTitle title={title} hint={hint} />
          <div className="w-full overflow-x-auto border border-ink">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead className="bg-surface-2 text-[10.5px] font-semibold uppercase tracking-wider text-ink">
                <tr className="border-b border-ink">
                  <th className="sticky left-0 z-20 w-12 bg-surface-2 px-3 py-2.5 text-left">{t("No")}</th>
                  <th className="sticky left-12 z-20 min-w-56 bg-surface-2 px-3 py-2.5 text-left">{t("Keterangan biaya")}</th>
                  <th className="px-3 py-2.5 text-right">{t("Budget")}</th>
                  {weekly && <th className="px-3 py-2.5 text-right">{t("Budget program")}</th>}
                  {grid.weeks.map((w) => (
                    <th key={w} className="min-w-24 px-3 py-2.5 text-right">
                      {weekHead(w)}
                      {weekDate(w) && <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-ink-muted">{weekDate(w)}</span>}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-right">{t("Total")}</th>
                  <th className="px-3 py-2.5 text-right">{t("Sisa")}</th>
                  {actions && <th className="w-12 px-2"><span className="sr-only">{t("Aksi")}</span></th>}
                </tr>
              </thead>
              <tbody>
                {section.groups.map((g, gi) => (
                  <Fragment key={g.category}>
                    <tr className="bg-black text-white">
                      <td className="sticky left-0 z-10 bg-black px-3 py-2 text-xs font-bold tabular-nums">{gi + 1}</td>
                      <td className="sticky left-12 z-10 bg-black px-3 py-2 text-[13px] font-semibold">{g.category}</td>
                      <td className="px-3 py-2 text-right text-[13px] font-semibold tabular-nums">{g.budget > 0 ? fmt.number(g.budget) : "—"}</td>
                      {weekly && <td className="px-3 py-2 text-right text-[13px] tabular-nums text-white/80">{g.programBudget > 0 ? fmt.number(g.programBudget) : "—"}</td>}
                      {grid.weeks.map((w) => (
                        <td key={w} className="px-3 py-2 text-right text-[13px] tabular-nums text-white/90">{g.byWeek[w] ? fmt.number(g.byWeek[w]) : ""}</td>
                      ))}
                      <td className="px-3 py-2 text-right text-[13px] font-bold tabular-nums">{fmt.number(g.total)}</td>
                      <td className="px-3 py-2 text-right text-[13px] font-semibold tabular-nums">{g.programBudget > 0 || g.total > 0 ? fmt.number(g.remaining) : "—"}</td>
                      {actions && <td />}
                    </tr>
                    {g.lines.map((l, li) => {
                      const extra = l.source === "extra" ? extraById.get(l.id) : undefined;
                      const detail: DetailLine = {
                        key: l.key,
                        extraId: extra?.id ?? null,
                        note: extra?.note ?? null,
                        name: l.name,
                        category: g.category,
                        period: l.period,
                        businessUnitId: unit.id,
                        periodLabel: periodLabel(l.period),
                        isAsset: l.isAsset,
                        budget: l.budget,
                        programBudget: l.programBudget,
                        total: l.total,
                        remaining: l.remaining,
                      };
                      const hasBudget = l.programBudget > 0;
                      return (
                        <tr key={l.key} className="border-t border-line-soft hover:bg-surface-2/60">
                          <td className="sticky left-0 z-10 bg-white px-3 py-2 text-xs tabular-nums text-ink-muted">{letter(li)}</td>
                          <td className="sticky left-12 z-10 min-w-56 bg-white px-3 py-2">
                            <CostDetail line={detail} costs={costsOf(l.key)} ctx={formCtx} canInput={canInput} canDelete={canDelete} />
                            {l.source === "extra" && <span className="ml-2 align-middle text-[10px] uppercase tracking-wider text-ink-muted">{t("Di luar RAB")}</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">
                            {hasBudget ? fmt.number(l.budget) : "—"}
                            {weekly && hasBudget && <span className="block text-[10px] text-ink-muted">{periodLabel(l.period)}</span>}
                          </td>
                          {weekly && <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{hasBudget ? fmt.number(l.programBudget) : "—"}</td>}
                          {grid.weeks.map((w) => (
                            <td key={w} className={cn("px-3 py-2 text-right tabular-nums", l.byWeek[w] ? "bg-elevated font-medium text-ink" : "text-ink-muted")}>
                              {l.byWeek[w] ? fmt.number(l.byWeek[w]) : ""}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink">{l.total > 0 ? fmt.number(l.total) : "—"}</td>
                          <td className={cn("px-3 py-2 text-right tabular-nums", l.remaining < 0 ? "font-bold text-ink" : "text-ink-secondary")}>
                            {hasBudget || l.total > 0 ? `${l.remaining < 0 ? "▲ " : ""}${fmt.number(Math.abs(l.remaining))}` : "—"}
                          </td>
                          {actions && (
                            <td className="px-1 py-1">
                              <AddRecordButton
                                kind="actualcost"
                                ctx={formCtx}
                                variant="cell"
                                preset={{ itemRef: l.key }}
                                label={t("Tambah biaya actual")}
                                className="grid size-8 place-items-center text-ink-muted transition-colors hover:bg-ink hover:text-white"
                              >
                                <Receipt className="size-3.5" />
                              </AddRecordButton>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink bg-surface-2 text-sm font-bold tabular-nums text-ink">
                  <td className="sticky left-0 z-10 bg-surface-2" />
                  <td className="sticky left-12 z-10 bg-surface-2 px-3 py-3 text-xs uppercase tracking-wider">{weekly ? t("Total mingguan") : t("Total bulanan")}</td>
                  <td className="px-3 py-3 text-right">{section.totals.budget > 0 ? fmt.number(section.totals.budget) : "—"}</td>
                  {weekly && <td className="px-3 py-3 text-right">{section.totals.programBudget > 0 ? fmt.number(section.totals.programBudget) : "—"}</td>}
                  {grid.weeks.map((w) => (
                    <td key={w} className="px-3 py-3 text-right">{section.totals.byWeek[w] ? fmt.number(section.totals.byWeek[w]) : ""}</td>
                  ))}
                  <td className="px-3 py-3 text-right">{fmt.number(section.totals.total)}</td>
                  <td className="px-3 py-3 text-right">{`${sectionOver ? "▲ " : ""}${fmt.number(Math.abs(section.totals.remaining))}`}</td>
                  {actions && <td />}
                </tr>
                {weekly && variance.weeks > 0 && (
                  <>
                    <tr className="border-t border-line text-xs tabular-nums text-ink-secondary">
                      <td className="sticky left-0 z-10 bg-white" />
                      <td className="sticky left-12 z-10 bg-white px-3 py-2 uppercase tracking-wider">{t("Budget per minggu")}</td>
                      <td />
                      <td />
                      {grid.weeks.map((w) => (
                        <td key={w} className="px-3 py-2 text-right">{w >= 1 && w <= variance.weeks ? fmt.number(variance.budgetPerWeek) : ""}</td>
                      ))}
                      <td className="px-3 py-2 text-right">{fmt.number(variance.budget)}</td>
                      <td />
                      {actions && <td />}
                    </tr>
                    <tr className="border-t border-line text-xs font-semibold tabular-nums text-ink">
                      <td className="sticky left-0 z-10 bg-white" />
                      <td className="sticky left-12 z-10 bg-white px-3 py-2 uppercase tracking-wider">{t("Selisih (actual − budget)")}</td>
                      <td />
                      <td />
                      {grid.weeks.map((w) => (
                        <td key={w} className="px-3 py-2 text-right">{w >= 1 && w <= variance.weeks ? diffLabel(variance.perWeek[w]) : ""}</td>
                      ))}
                      <td className="px-3 py-2 text-right">{diffLabel(variance.difference)}</td>
                      <td />
                      {actions && <td />}
                    </tr>
                  </>
                )}
                <tr>
                  <td colSpan={cols} className="px-3 py-2 text-[11px] text-ink-muted">
                    {weekly
                      ? variance.weeks > 0
                        ? t("▲ = lebih besar dari budget, ▼ = lebih hemat. Selisih dihitung sampai minggu ke-{n}, minggu terakhir yang sudah berjalan dan punya biaya mingguan.", { n: variance.weeks })
                        : t("Selisih per minggu muncul begitu ada biaya mingguan di minggu yang sudah berjalan.")
                      : t("Biaya bulanan dihitung sekali; angkanya tetap dicatat di minggu tempat biaya itu dibayar.")}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div>
      <PageHeader
        eyebrow={unit.name}
        title={t("RAB Actual")}
        description={t("Biaya yang benar-benar keluar dibandingkan dengan anggaran RAB, dikelompokkan per minggu.")}
        actions={
          canInput && (
            <>
              <AddRecordButton kind="actualitem" ctx={formCtx} variant="outline" />
              <AddRecordButton kind="actualcost" ctx={formCtx} />
            </>
          )
        }
      />

      <GuideCard
        id="rab-actual"
        title={t("Cara membaca halaman RAB Actual")}
        intro={t("Keterangan biaya dan budgetnya diambil dari menu RAB. Setiap kali uang benar-benar keluar, catat biaya actualnya dengan tanggal dan bukti pembayaran; angkanya otomatis masuk ke kolom minggu sesuai tanggalnya dan dijumlahkan per minggu. Biaya mingguan dan biaya bulanan ada di dua bagian terpisah, lalu dijumlahkan di bawahnya.")}
        terms={[
          { term: t("Budget"), text: t("Nilai baris di RAB: untuk biaya mingguan itu per minggu, untuk biaya bulanan itu totalnya. Budget program = budget mingguan × jumlah minggu.") },
          { term: t("Week"), text: t("Minggu program. Minggu 1 dimulai pada tanggal mulai program; biaya masuk ke minggu tempat tanggal bayarnya jatuh.") },
          { term: t("Total"), text: t("Jumlah seluruh biaya actual pada baris itu.") },
          { term: t("Sisa"), text: t("Budget seluruh program dikurangi total actual. Bertanda ▲ bila sudah melebihi budget.") },
          { term: t("Selisih"), text: t("Actual satu minggu dikurangi budget mingguan. ▲ = lebih besar dari budget, ▼ = lebih hemat.") },
          { term: t("Klik keterangan"), text: t("Membuka rincian: tanggal bayar, jumlah, bukti, dan catatan setiap biaya.") },
        ]}
        tip={canInput ? t("Biaya yang tidak ada di RAB? Klik “Tambah keterangan biaya”, pilih mingguan atau bulanan, lalu catat biaya actualnya.") : undefined}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label={t("Budget program")} value={fmt.rupiahCompact(grid.totals.programBudget)} full={fmt.rupiah(grid.totals.programBudget)} icon={<Calculator className="size-4" />} block="blue" hint={t("Mingguan × minggu + bulanan")} />
        <Kpi label={t("Total actual")} value={fmt.rupiahCompact(grid.totals.total)} full={fmt.rupiah(grid.totals.total)} icon={<Wallet className="size-4" />} block="red" hint={t("{n} catatan biaya", { n: fmt.number(costs.length) })} />
        <Kpi
          label={over ? t("Melebihi budget") : t("Sisa budget")}
          value={fmt.rupiahCompact(Math.abs(grid.totals.remaining))}
          full={fmt.rupiah(Math.abs(grid.totals.remaining))}
          icon={<PiggyBank className="size-4" />}
          block="yellow"
          tone={over ? "warn" : "default"}
          hint={over ? t("Actual sudah di atas budget") : t("Budget dikurangi actual")}
        />
        <Kpi label={t("Terserap")} value={`${(absorbed * 100).toLocaleString(fmt.tag, { maximumFractionDigits: 1 })}%`} icon={<Gauge className="size-4" />} block="white" hint={t("Actual ÷ budget program")} />
        <Kpi
          label={t("Rata-rata per minggu")}
          value={variance.weeks > 0 ? fmt.rupiahCompact(variance.average) : "—"}
          full={variance.weeks > 0 ? fmt.rupiah(variance.average) : undefined}
          icon={<Calculator className="size-4" />}
          block="white"
          hint={variance.weeks > 0 ? t("Biaya mingguan s.d. minggu {n} · budget {budget}", { n: variance.weeks, budget: fmt.rupiahCompact(variance.budgetPerWeek) }) : t("Belum ada biaya mingguan")}
        />
      </div>

      {!empty && costs.length > 0 && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("Biaya actual per minggu")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ColumnChart data={weekTotals} accent="var(--color-chart-1)" summary={t("Biaya actual per minggu, total {total}", { total: fmt.rupiah(grid.totals.total) })} emptyLabel={t("Belum ada biaya actual")} />
              <p className="text-center text-[10px] uppercase tracking-wider text-ink-muted">{t("Minggu ke-")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("Actual per kategori")}</CardTitle>
            </CardHeader>
            <CardContent>
              <RankBars
                items={rankedList.slice(0, 8).map((g) => ({
                  label: g.category,
                  value: g.total,
                  valueLabel: fmt.rupiah(g.total),
                  sublabel: g.budget > 0 ? t("{pct}% dari budget", { pct: Math.round((g.total / g.budget) * 100) }) : t("Tanpa budget"),
                }))}
                accent="var(--color-chart-1)"
              />
            </CardContent>
          </Card>
        </div>
      )}

      {unit.programStartsOn === null && grid.start && (
        <Notice title={t("Tanggal mulai program belum diatur")} className="mt-4">
          {t("Minggu 1 dihitung dari biaya actual pertama ({date}). Owner dapat mengisi tanggal mulai program di Kelola Unit Bisnis agar kolom minggunya tetap.", { date: fmt.date(grid.start, { day: "numeric", month: "long", year: "numeric" }) })}
        </Notice>
      )}

      {empty ? (
        <Card className="mt-4">
          <CardContent>
            <EmptyState
              icon={ClipboardList}
              title={t("Belum ada RAB")}
              description={t("Keterangan biaya dan budget diambil dari RAB. Isi RAB lebih dulu, atau tambahkan keterangan biaya di sini.")}
              action={
                <Link href={menuHref(unit.code, "rab")} className="border border-black bg-black px-4 py-2 text-sm font-semibold text-white">
                  {t("Buka RAB")}
                </Link>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {renderSection(
            grid.weekly,
            t("Biaya mingguan"),
            grid.start
              ? t("Minggu 1 dimulai {date}. Biaya masuk ke minggu tempat tanggal bayarnya jatuh.", { date: fmt.date(grid.start, { day: "numeric", month: "long", year: "numeric" }) })
              : t("Belum ada biaya actual, jadi tanggal mulai minggu 1 belum diketahui."),
          )}
          {renderSection(grid.monthly, t("Biaya bulanan"), t("Biaya yang dikeluarkan sekali (peralatan, hadiah, seragam, perizinan). Tetap dicatat di minggu tempat dibayar."))}

          <section className="mt-4 border-2 border-black bg-white" aria-label={t("Total estimasi OPEX")}>
            <div className="grid gap-px bg-black sm:grid-cols-[1.4fr_1fr_1fr]">
              <div className="bg-black p-4 text-white">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">{t("Total estimasi OPEX")}</p>
                <p className="mt-1 text-xs text-white/70">{t("Mingguan + bulanan")}</p>
              </div>
              <div className="bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{t("Budget program")}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{fmt.rupiah(grid.totals.programBudget)}</p>
                <p className="mt-0.5 text-[11px] text-ink-muted">
                  {fmt.rupiahCompact(grid.weekly.totals.programBudget)} {t("mingguan")} + {fmt.rupiahCompact(grid.monthly.totals.programBudget)} {t("bulanan")}
                </p>
              </div>
              <div className="bg-surface-2 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{t("Total actual")}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{fmt.rupiah(grid.totals.total)}</p>
                <p className="mt-0.5 text-[11px] text-ink-muted">
                  {fmt.rupiahCompact(grid.weekly.totals.total)} {t("mingguan")} + {fmt.rupiahCompact(grid.monthly.totals.total)} {t("bulanan")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              <Progress value={Math.min(100, absorbed * 100)} className="max-w-xs" />
              <span className="text-[11px] text-ink-muted">
                {over
                  ? t("Melebihi budget {amount}", { amount: fmt.rupiah(Math.abs(grid.totals.remaining)) })
                  : t("Sisa budget {amount}", { amount: fmt.rupiah(grid.totals.remaining) })}
              </span>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
