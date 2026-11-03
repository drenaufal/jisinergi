import { Fragment } from "react";
import type { Metadata } from "next";
import { CalendarDays, Coins, Receipt, Ticket, Trophy } from "lucide-react";
import { loadUnitPage } from "@/lib/finance/access";
import { listMatchFees, listOtherIncome } from "@/lib/finance/queries";
import { compareAgeGroups, matchFeeAmount, matchFeeByWeek, playedWeeks, sum, teamLabel } from "@/lib/finance/calc";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BlockTitle, ColumnHead, ProofChip } from "@/components/finance/bits";
import { ColumnChart, RankBars } from "@/components/finance/charts";
import { GuideCard } from "@/components/finance/guide-card";
import { Kpi } from "@/components/finance/kpi";
import { cn } from "@/lib/utils";
import { getI18n } from "@/lib/i18n/server";
import { AddRecordButton, DeleteRecordButton, EditRecordButton, type FinanceRecord } from "../forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t("Match Fee") };
}
export const dynamic = "force-dynamic";

export default async function MatchFeePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { unit, form, canInput, canDelete } = await loadUnitPage(code, "liga");
  const { t, fmt } = await getI18n();

  const [rows, otherRows] = await Promise.all([listMatchFees(unit.id), listOtherIncome(unit.id)]);
  const total = sum(rows, matchFeeAmount);
  const matches = sum(rows, (r) => r.matches);
  const played = playedWeeks(rows);
  const programWeeks = unit.programWeeks;
  const otherTotal = sum(otherRows, (o) => o.amount);

  // A team is a club in an age group: the same club may play in U8 and in U9, each with its own rows.
  const teams = [...new Map(rows.map((r) => [`${r.ageGroup}|${r.clubName}`, { ageGroup: r.ageGroup, clubName: r.clubName }])).values()].sort(
    (a, b) => compareAgeGroups(a.ageGroup, b.ageGroup) || a.clubName.localeCompare(b.clubName),
  );
  const ageGroups = [...new Set(rows.map((r) => r.ageGroup).filter(Boolean))].sort(compareAgeGroups);
  const hasGroups = ageGroups.length > 0;
  const clubs = [...new Set(rows.map((r) => r.clubName))];
  const formCtx = { ...form, clubs, ageGroups };

  const weeks = Math.max(programWeeks, ...rows.map((r) => r.week), ...otherRows.map((o) => o.week));
  const cell = new Map(rows.map((r) => [`${r.ageGroup}|${r.clubName}|${r.week}`, r]));
  const byWeek = matchFeeByWeek(rows, weeks);
  const otherByWeek = new Map<number, number>();
  for (const o of otherRows) otherByWeek.set(o.week, (otherByWeek.get(o.week) ?? 0) + o.amount);
  const lastRate = [...rows].sort((a, b) => b.week - a.week)[0]?.feePerMatch ?? null;
  const groupTotal = (group: string) => sum(rows.filter((r) => r.ageGroup === group), matchFeeAmount);

  const record = (r: (typeof rows)[number]): FinanceRecord => ({
    id: r.id,
    businessUnitId: r.businessUnitId,
    clubName: r.clubName,
    ageGroup: r.ageGroup,
    week: r.week,
    matches: r.matches,
    feePerMatch: r.feePerMatch,
    proofUrl: r.proofUrl,
    note: r.note,
  });
  const otherRecord = (o: (typeof otherRows)[number]): FinanceRecord => ({
    id: o.id,
    businessUnitId: o.businessUnitId,
    name: o.name,
    week: o.week,
    amount: o.amount,
    proofUrl: o.proofUrl,
    note: o.note,
  });

  const perTeam = new Map<string, { label: string; value: number; matches: number }>();
  for (const r of rows) {
    const key = `${r.ageGroup}|${r.clubName}`;
    const cur = perTeam.get(key) ?? { label: teamLabel(r), value: 0, matches: 0 };
    cur.value += matchFeeAmount(r);
    cur.matches += r.matches;
    perTeam.set(key, cur);
  }
  const avgRate = matches ? Math.round(total / matches) : 0;
  const proofLabels = { viewLabel: t("Lihat bukti"), missingLabel: t("Belum ada bukti") };
  const otherActions = canInput || canDelete;

  return (
    <div>
      <PageHeader
        eyebrow={unit.name}
        title={t("Uang Masuk Match Fee")}
        description={t("Biaya per pertandingan yang dibayar setiap klub, dirangkum per minggu, beserta pemasukan lain seperti sewa stand.")}
        actions={
          canInput && (
            <>
              <AddRecordButton kind="otherincome" ctx={formCtx} variant="outline" />
              <AddRecordButton kind="matchfee" ctx={formCtx} preset={{ feePerMatch: lastRate }} />
            </>
          )
        }
      />

      <GuideCard
        id="match-fee"
        title={t("Cara membaca tabel Match Fee")}
        intro={t("Setiap klub membayar match fee untuk tiap pertandingan yang dimainkan. Tabel ini adalah kisi klub × minggu: baca ke kanan untuk melihat satu klub sepanjang musim, baca ke bawah untuk melihat satu minggu dari semua klub. Bila liga punya kelompok umur (U8, U9, …), klub yang sama di kelompok berbeda punya baris sendiri.")}
        terms={[
          { term: t("Sel angka"), text: t("Angka besar = nominal yang dibayar (jumlah laga × tarif per laga). Angka kecil di bawahnya = jumlah laga.") },
          { term: t("Tanda “—”"), text: t("Belum ada pertandingan yang dicatat untuk klub itu di minggu tersebut.") },
          { term: t("Judul minggu yang pudar"), text: t("Minggu itu belum berjalan — belum ada satu pun match fee yang masuk.") },
          { term: t("Total"), text: t("Kolom kanan menjumlah semua minggu untuk satu klub; baris bawah menjumlah semua klub untuk satu minggu.") },
          { term: t("Pemasukan lain"), text: t("Uang masuk di luar match fee dan registrasi (sewa stand, tiket parkir), dicatat per minggu dengan bukti transfer. Tidak ikut rumus dividen.") },
        ]}
        tip={canInput ? t("Klik sebuah sel untuk memperbaikinya, atau tanda “+” pada sel kosong untuk mencatat match fee klub itu di minggu tersebut.") : undefined}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label={t("Total match fee")} value={fmt.rupiahCompact(total)} full={fmt.rupiah(total)} icon={<Ticket className="size-4" />} block="red" hint={t("{n} klub membayar", { n: fmt.number(teams.length) })} />
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
        <Kpi label={t("Pemasukan lain")} value={fmt.rupiahCompact(otherTotal)} full={fmt.rupiah(otherTotal)} icon={<Coins className="size-4" />} block="white" hint={t("{n} catatan, di luar rumus dividen", { n: fmt.number(otherRows.length) })} />
      </div>

      {rows.length > 0 && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("Match fee per minggu")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ColumnChart
                data={byWeek.map((w) => ({ label: `${w.week}`, value: w.amount, detail: t("{n} laga", { n: w.matches }) }))}
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
                items={[...perTeam.values()]
                  .sort((a, b) => b.value - a.value)
                  .slice(0, 10)
                  .map((c) => ({ label: c.label, value: c.value, valueLabel: fmt.rupiah(c.value), sublabel: t("{n} laga", { n: c.matches }) }))}
                accent="var(--color-chart-2)"
              />
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="mt-4">
        <CardContent className="space-y-4">
          <BlockTitle
            title={t("Kisi match fee: klub × minggu")}
            hint={t("{clubs} klub · {weeks} minggu program · tarif terakhir {rate} per laga", {
              clubs: teams.length,
              weeks,
              rate: lastRate ? fmt.rupiah(lastRate) : "—",
            })}
          />
          {teams.length === 0 ? (
            <EmptyState
              icon={Ticket}
              title={t("Belum ada match fee tercatat")}
              description={canInput ? t("Klik “Catat match fee” untuk mencatat pembayaran pertama.") : undefined}
            />
          ) : (
            <div className="w-full overflow-x-auto border border-line">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-surface-2 text-[10.5px] font-semibold uppercase tracking-wider text-ink-muted">
                  <tr>
                    <th rowSpan={2} className="sticky left-0 z-10 min-w-40 border-b border-r border-line bg-surface-2 px-3 py-2 text-left">
                      {t("Klub")}
                    </th>
                    <th colSpan={weeks} className="border-b border-line px-3 py-1.5 text-center">
                      {t("Minggu ke-")}
                    </th>
                    <th colSpan={2} className="border-b border-l border-line px-3 py-1.5 text-center">
                      {t("Total")}
                    </th>
                  </tr>
                  <tr>
                    {byWeek.map((w) => (
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
                  {teams.map((team, ti) => {
                    const teamRows = rows.filter((r) => r.ageGroup === team.ageGroup && r.clubName === team.clubName);
                    const newGroup = hasGroups && (ti === 0 || teams[ti - 1].ageGroup !== team.ageGroup);
                    return (
                      <Fragment key={`${team.ageGroup}|${team.clubName}`}>
                        {newGroup && (
                          <tr className="bg-black text-white">
                            <th scope="rowgroup" className="sticky left-0 z-10 bg-black px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wider">
                              {team.ageGroup || t("Tanpa kelompok")}
                            </th>
                            <td colSpan={weeks + 1} className="px-3 py-1.5 text-right text-[11px] text-white/70">
                              {t("{n} klub", { n: teams.filter((x) => x.ageGroup === team.ageGroup).length })}
                            </td>
                            <td className="px-3 py-1.5 text-right text-xs font-bold tabular-nums">{fmt.number(groupTotal(team.ageGroup))}</td>
                          </tr>
                        )}
                        <tr className="group/row transition-colors hover:bg-surface-2/60">
                          <th scope="row" className="sticky left-0 z-10 border-r border-line bg-surface px-3 py-2 text-left text-[13px] font-semibold text-ink group-hover/row:bg-surface-2">
                            {team.clubName}
                          </th>
                          {byWeek.map((w) => {
                            const r = cell.get(`${team.ageGroup}|${team.clubName}|${w.week}`);
                            if (!r) {
                              return (
                                <td key={w.week} className="px-1 py-1 text-center">
                                  {canInput ? (
                                    <AddRecordButton
                                      kind="matchfee"
                                      variant="cell"
                                      ctx={formCtx}
                                      preset={{ businessUnitId: unit.id, clubName: team.clubName, ageGroup: team.ageGroup, week: w.week, feePerMatch: lastRate }}
                                      className="group/add grid h-11 w-full place-items-center text-ink-muted/50 transition-colors hover:bg-ink hover:text-white"
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
                                  {r.proofUrl && <Receipt className="size-2.5 text-ink" aria-label={t("Ada bukti")} />}
                                </span>
                              </span>
                            );
                            return (
                              <td key={w.week} className="px-1 py-1">
                                {canInput ? (
                                  <EditRecordButton kind="matchfee" record={record(r)} ctx={formCtx} className="block h-11 w-full px-1 transition-colors hover:bg-surface-2">
                                    {cellBody}
                                  </EditRecordButton>
                                ) : (
                                  <div className="grid h-11 place-items-center">{cellBody}</div>
                                )}
                              </td>
                            );
                          })}
                          <td className="border-l border-line px-2 py-2 text-right tabular-nums text-ink-secondary">{fmt.number(sum(teamRows, (r) => r.matches))}</td>
                          <td className="px-3 py-2 text-right text-[13px] font-bold tabular-nums text-ink">{fmt.number(sum(teamRows, matchFeeAmount))}</td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-line bg-surface-2">
                    <th className="sticky left-0 z-10 border-r border-line bg-surface-2 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                      {t("Total")}
                    </th>
                    {byWeek.map((w) => (
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
                    <td className="border-l border-line px-2 py-2.5 text-right text-[13px] font-bold tabular-nums text-ink">{fmt.number(matches)}</td>
                    <td className="px-3 py-2.5 text-right text-[13px] font-bold tabular-nums text-ink">{fmt.number(total)}</td>
                  </tr>
                  {otherRows.length > 0 && (
                    <tr className="border-t border-line text-xs text-ink-secondary">
                      <th className="sticky left-0 z-10 border-r border-line bg-white px-3 py-2 text-left font-semibold uppercase tracking-wider">{t("Pemasukan lain")}</th>
                      {byWeek.map((w) => (
                        <td key={w.week} className="px-2 py-2 text-center tabular-nums">{otherByWeek.get(w.week) ? fmt.number(otherByWeek.get(w.week)!) : ""}</td>
                      ))}
                      <td className="border-l border-line" />
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink">{fmt.number(otherTotal)}</td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          )}
          <p className="text-[11px] text-ink-muted">{t("Semua angka dalam Rupiah. Angka besar = nominal, angka kecil = jumlah laga.")}</p>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="space-y-4">
          <BlockTitle title={t("Pemasukan lain")} hint={t("Sewa stand, tiket parkir, dan uang masuk lain per minggu. Tidak ikut rumus dividen.")} />
          {otherRows.length === 0 ? (
            <EmptyState
              icon={Coins}
              title={t("Belum ada pemasukan lain")}
              description={canInput ? t("Klik “Tambah pemasukan lain” untuk mencatat yang pertama.") : t("Belum ada pemasukan lain untuk ditampilkan.")}
            />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH className="w-10">{t("No")}</TH>
                  <TH><ColumnHead label={t("Keterangan")} hint={t("Dari mana uang masuk")} /></TH>
                  <TH><ColumnHead label={t("Minggu")} hint={t("Minggu pertandingan")} /></TH>
                  <TH className="text-right"><ColumnHead label={t("Nominal")} hint={t("Uang masuk")} align="right" /></TH>
                  <TH><ColumnHead label={t("Bukti")} hint={t("Bukti transfer")} /></TH>
                  {otherActions && <TH className="w-24"><span className="sr-only">{t("Aksi")}</span></TH>}
                </TR>
              </THead>
              <TBody>
                {otherRows.map((o, i) => (
                  <TR key={o.id}>
                    <TD className="tabular-nums text-ink-muted">{i + 1}</TD>
                    <TD>
                      <span className="font-medium text-ink">{o.name}</span>
                      {o.note && <span className="block text-[11px] text-ink-muted">{o.note}</span>}
                    </TD>
                    <TD className="tabular-nums">{t("Week {n}", { n: o.week })}</TD>
                    <TD className="text-right font-medium tabular-nums text-ink">{fmt.rupiah(o.amount)}</TD>
                    <TD><ProofChip url={o.proofUrl} {...proofLabels} /></TD>
                    {otherActions && (
                      <TD>
                        <div className="flex justify-end gap-0.5">
                          {canInput && <EditRecordButton kind="otherincome" record={otherRecord(o)} ctx={formCtx} />}
                          {canDelete && <DeleteRecordButton kind="otherincome" id={o.id} name={o.name} />}
                        </div>
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
              <tfoot>
                <tr className="border-t-2 border-ink bg-surface-2">
                  <td colSpan={3} className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-ink">{t("Total pemasukan lain")}</td>
                  <td className="px-3 py-3 text-right text-sm font-bold tabular-nums text-ink">{fmt.rupiah(otherTotal)}</td>
                  <td colSpan={otherActions ? 2 : 1} />
                </tr>
              </tfoot>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
