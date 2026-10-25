import type { Metadata } from "next";
import { CalendarDays, Receipt, Ticket, Trophy } from "lucide-react";
import { loadUnitPage } from "@/lib/finance/access";
import { listMatchFees } from "@/lib/finance/queries";
import { matchFeeAmount, matchFeeByWeek, playedWeeks, sum } from "@/lib/finance/calc";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { BlockTitle } from "@/components/finance/bits";
import { ColumnChart, RankBars } from "@/components/finance/charts";
import { GuideCard } from "@/components/finance/guide-card";
import { Kpi } from "@/components/finance/kpi";
import { cn } from "@/lib/utils";
import { getI18n } from "@/lib/i18n/server";
import { AddRecordButton, EditRecordButton, type FinanceRecord } from "../forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t("Match Fee") };
}
export const dynamic = "force-dynamic";

export default async function MatchFeePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { unit, form, canInput } = await loadUnitPage(code, "liga");
  const { t, fmt } = await getI18n();

  const rows = await listMatchFees(unit.id);
  const total = sum(rows, matchFeeAmount);
  const matches = sum(rows, (r) => r.matches);
  const played = playedWeeks(rows);
  const programWeeks = unit.programWeeks;
  const clubs = [...new Set(rows.map((r) => r.clubName))];
  const formCtx = { ...form, clubs };

  const blocks = [unit].map((unit) => {
      const mine = rows.filter((r) => r.businessUnitId === unit.id);
      const weeks = Math.max(unit.programWeeks, ...mine.map((r) => r.week));
      const clubNames = [...new Set(mine.map((r) => r.clubName))].sort((a, b) => a.localeCompare(b));
      const cell = new Map(mine.map((r) => [`${r.clubName}|${r.week}`, r]));
      const byWeek = matchFeeByWeek(mine, weeks);
      const lastRate = [...mine].sort((a, b) => b.week - a.week)[0]?.feePerMatch ?? null;
      return { unit, mine, weeks, clubNames, cell, byWeek, lastRate };
    });

  const record = (r: (typeof rows)[number]): FinanceRecord => ({
    id: r.id,
    businessUnitId: r.businessUnitId,
    clubName: r.clubName,
    week: r.week,
    matches: r.matches,
    feePerMatch: r.feePerMatch,
    proofUrl: r.proofUrl,
    note: r.note,
  });

  // chart data: weeks across the units in view
  const chartWeeks = matchFeeByWeek(rows, programWeeks);
  const perClub = new Map<string, { label: string; value: number; matches: number }>();
  for (const r of rows) {
    const key = `${r.businessUnitId}|${r.clubName}`;
    const cur = perClub.get(key) ?? { label: r.clubName, value: 0, matches: 0 };
    cur.value += matchFeeAmount(r);
    cur.matches += r.matches;
    perClub.set(key, cur);
  }
  const avgRate = matches ? Math.round(total / matches) : 0;

  return (
    <div>
      <PageHeader
        eyebrow={unit.name}
        title={t("Uang Masuk Match Fee")}
        description={t("Biaya per pertandingan yang dibayar setiap klub, dirangkum per minggu.")}
        actions={canInput && <AddRecordButton kind="matchfee" ctx={formCtx} preset={{ feePerMatch: blocks[0]?.lastRate ?? null }} />}
      />

      <GuideCard
        id="match-fee"
        title={t("Cara membaca tabel Match Fee")}
        intro={t("Setiap klub membayar match fee untuk tiap pertandingan yang dimainkan. Tabel ini adalah kisi klub × minggu: baca ke kanan untuk melihat satu klub sepanjang musim, baca ke bawah untuk melihat satu minggu dari semua klub.")}
        terms={[
          { term: t("Sel angka"), text: t("Angka besar = nominal yang dibayar (jumlah laga × tarif per laga). Angka kecil di bawahnya = jumlah laga.") },
          { term: t("Tanda “—”"), text: t("Belum ada pertandingan yang dicatat untuk klub itu di minggu tersebut.") },
          { term: t("Judul minggu yang pudar"), text: t("Minggu itu belum berjalan — belum ada satu pun match fee yang masuk.") },
          { term: t("Total"), text: t("Kolom kanan menjumlah semua minggu untuk satu klub; baris bawah menjumlah semua klub untuk satu minggu.") },
        ]}
        tip={canInput ? t("Klik sebuah sel untuk memperbaikinya, atau tanda “+” pada sel kosong untuk mencatat match fee klub itu di minggu tersebut.") : undefined}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t("Total match fee")} value={fmt.rupiahCompact(total)} full={fmt.rupiah(total)} icon={<Ticket className="size-4" />} block="red" hint={t("{n} klub membayar", { n: fmt.number(clubs.length) })} />
        <Kpi label={t("Total laga")} value={fmt.number(matches)} icon={<Trophy className="size-4" />} block="blue" hint={t("Laga yang dikenai match fee")} />
        <Kpi
          label={t("Rata-rata per laga")}
          value={matches ? fmt.rupiahCompact(avgRate) : "—"}
          full={matches ? fmt.rupiah(avgRate) : undefined}
          icon={<Receipt className="size-4" />}
          block="yellow"
          hint={t("Total dibagi total laga")}
        />
        <Kpi
          label={t("Minggu berjalan")}
          value={programWeeks ? `${fmt.number(played)}/${fmt.number(programWeeks)}` : fmt.number(played)}
          icon={<CalendarDays className="size-4" />}
          block="night"
          hint={t("Minggu yang sudah ada match fee-nya")}
        />
      </div>

      {rows.length > 0 && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("Match fee per minggu")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ColumnChart
                data={chartWeeks.map((w) => ({ label: `${w.week}`, value: w.amount, detail: t("{n} laga", { n: w.matches }) }))}
                summary={t("Match fee per minggu, total {total}", { total: fmt.rupiah(total) })}
                emptyLabel={t("Belum berjalan")}
                accent="var(--color-chart-1)"
              />
              <p className="mt-1 text-center text-[10px] uppercase tracking-wider text-ink-muted">{t("Minggu ke-")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("Total match fee per klub")}</CardTitle>
            </CardHeader>
            <CardContent>
              <RankBars
                items={[...perClub.values()]
                  .sort((a, b) => b.value - a.value)
                  .slice(0, 10)
                  .map((c) => ({ label: c.label, value: c.value, valueLabel: fmt.rupiah(c.value), sublabel: t("{n} laga", { n: c.matches }) }))}
                accent="var(--color-chart-2)"
              />
            </CardContent>
          </Card>
        </div>
      )}

      {blocks.length === 0 ? (
        <Card className="mt-4">
          <CardContent>
            <EmptyState
              icon={Ticket}
              title={t("Belum ada match fee tercatat")}
              description={canInput ? t("Klik “Catat match fee” untuk mencatat pembayaran pertama.") : t("Belum ada match fee untuk ditampilkan.")}
            />
          </CardContent>
        </Card>
      ) : (
        blocks.map((b) => (
          <Card key={b.unit.id} className="mt-4">
            <CardContent className="space-y-4">
              <BlockTitle
                title={t("Kisi match fee: klub × minggu")}
                hint={t("{clubs} klub · {weeks} minggu program · tarif terakhir {rate} per laga", {
                  clubs: b.clubNames.length,
                  weeks: b.weeks,
                  rate: b.lastRate ? fmt.rupiah(b.lastRate) : "—",
                })}
              />
              {b.clubNames.length === 0 ? (
                <EmptyState
                  icon={Ticket}
                  title={t("Belum ada match fee tercatat")}
                  description={canInput ? t("Klik “Catat match fee” untuk mencatat pembayaran pertama.") : undefined}
                />
              ) : (
                <div className="w-full overflow-x-auto rounded-xl border border-line">
                  <table className="w-full border-collapse text-sm">
                    <thead className="bg-surface-2 text-[10.5px] font-semibold uppercase tracking-wider text-ink-muted">
                      <tr>
                        <th rowSpan={2} className="sticky left-0 z-10 min-w-36 border-b border-r border-line bg-surface-2 px-3 py-2 text-left">
                          {t("Klub")}
                        </th>
                        <th colSpan={b.weeks} className="border-b border-line px-3 py-1.5 text-center">
                          {t("Minggu ke-")}
                        </th>
                        <th colSpan={2} className="border-b border-l border-line px-3 py-1.5 text-center">
                          {t("Total")}
                        </th>
                      </tr>
                      <tr>
                        {b.byWeek.map((w) => (
                          <th
                            key={w.week}
                            title={w.matches ? undefined : t("Belum berjalan")}
                            className={cn("min-w-[5.5rem] border-b border-line px-2 py-1.5 text-center tabular-nums", w.matches ? "text-ink" : "text-ink-muted/60")}
                          >
                            {w.week}
                          </th>
                        ))}
                        <th className="min-w-16 border-b border-l border-line px-2 py-1.5 text-right">{t("Laga")}</th>
                        <th className="min-w-28 border-b border-line px-3 py-1.5 text-right">{t("Nominal")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-soft">
                      {b.clubNames.map((club) => {
                        const clubRows = b.mine.filter((r) => r.clubName === club);
                        return (
                          <tr key={club} className="group/row transition-colors hover:bg-surface-2/60">
                            <th scope="row" className="sticky left-0 z-10 border-r border-line bg-surface px-3 py-2 text-left text-[13px] font-semibold text-ink group-hover/row:bg-surface-2">
                              {club}
                            </th>
                            {b.byWeek.map((w) => {
                              const r = b.cell.get(`${club}|${w.week}`);
                              if (!r) {
                                return (
                                  <td key={w.week} className="px-1 py-1 text-center">
                                    {canInput ? (
                                      <AddRecordButton
                                        kind="matchfee"
                                        variant="cell"
                                        ctx={formCtx}
                                        preset={{ businessUnitId: b.unit.id, clubName: club, week: w.week, feePerMatch: b.lastRate }}
                                        className="group/add grid h-11 w-full place-items-center rounded-lg text-ink-muted/50 transition-colors hover:bg-brand/10 hover:text-brand"
                                      >
                                        <span className="group-hover/add:hidden">—</span>
                                        <span className="hidden text-base font-semibold leading-none group-hover/add:inline">+</span>
                                      </AddRecordButton>
                                    ) : (
                                      <span className="text-ink-muted/50">—</span>
                                    )}
                                  </td>
                                );
                              }
                              const cellBody = (
                                <span className="block text-center">
                                  <span className="block text-[13px] font-semibold tabular-nums text-ink">{fmt.number(matchFeeAmount(r))}</span>
                                  <span className="flex items-center justify-center gap-1 text-[10px] text-ink-muted">
                                    {t("{n} laga", { n: r.matches })}
                                    {r.proofUrl && <Receipt className="size-2.5 text-success" aria-label={t("Ada bukti")} />}
                                  </span>
                                </span>
                              );
                              return (
                                <td key={w.week} className="px-1 py-1">
                                  {canInput ? (
                                    <EditRecordButton
                                      kind="matchfee"
                                      record={record(r)}
                                      ctx={formCtx}
                                      className="block h-11 w-full rounded-lg px-1 transition-colors hover:bg-brand/10"
                                    >
                                      {cellBody}
                                    </EditRecordButton>
                                  ) : (
                                    <div className="grid h-11 place-items-center">{cellBody}</div>
                                  )}
                                </td>
                              );
                            })}
                            <td className="border-l border-line px-2 py-2 text-right tabular-nums text-ink-secondary">{fmt.number(sum(clubRows, (r) => r.matches))}</td>
                            <td className="px-3 py-2 text-right text-[13px] font-bold tabular-nums text-ink">{fmt.number(sum(clubRows, matchFeeAmount))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-line bg-surface-2">
                        <th className="sticky left-0 z-10 border-r border-line bg-surface-2 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                          {t("Total")}
                        </th>
                        {b.byWeek.map((w) => (
                          <td key={w.week} className="px-2 py-2 text-center">
                            {w.matches ? (
                              <>
                                <span className="block text-[13px] font-bold tabular-nums text-ink">{fmt.number(w.amount)}</span>
                                <span className="block text-[10px] text-ink-muted">{t("{n} laga", { n: w.matches })}</span>
                              </>
                            ) : (
                              <span className="text-ink-muted/50">—</span>
                            )}
                          </td>
                        ))}
                        <td className="border-l border-line px-2 py-2.5 text-right text-[13px] font-bold tabular-nums text-ink">{fmt.number(sum(b.mine, (r) => r.matches))}</td>
                        <td className="px-3 py-2.5 text-right text-[13px] font-bold tabular-nums text-ink">{fmt.number(sum(b.mine, matchFeeAmount))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              <p className="text-[11px] text-ink-muted">{t("Semua angka dalam Rupiah. Angka besar = nominal, angka kecil = jumlah laga.")}</p>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
