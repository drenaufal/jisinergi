import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Building2, Package, Target } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { listVisibleUnits } from "@/lib/finance/access";
import { getAllUnitFigures } from "@/lib/finance/queries";
import { DIVIDEND_TARGET } from "@/lib/finance/config";
import { ligaDividend, ownerDividend, sum } from "@/lib/finance/calc";
import { UNIT_TYPE_LABEL, menuHref } from "@/lib/finance/unit-types";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BlockTitle } from "@/components/finance/bits";
import { Formula } from "@/components/finance/formula";
import { GuideCard } from "@/components/finance/guide-card";
import { Kpi } from "@/components/finance/kpi";
import { getI18n } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Ringkasan Owner" };
export const dynamic = "force-dynamic";

export default async function OwnerOverviewPage({ searchParams }: { searchParams: Promise<{ unit?: string }> }) {
  const user = await requireCapability("all-units");
  const { fmt } = await getI18n();
  const sp = await searchParams;
  const units = await listVisibleUnits(user);
  const figures = await getAllUnitFigures(units);

  const selected = units.find((u) => u.code.toLowerCase() === sp.unit?.toLowerCase()) ?? null;
  const pool = selected ? units.filter((u) => u.id === selected.id) : units;

  const ligaUnits = units.filter((u) => u.type === "liga");
  const schoolUnits = units.filter((u) => u.type === "sekolah_bola");
  const liga = (list: typeof units) => list.flatMap((u) => { const f = figures.get(u.id); return f?.type === "liga" ? [{ unit: u, f: f.figures }] : []; });
  const school = (list: typeof units) => list.flatMap((u) => { const f = figures.get(u.id); return f?.type === "sekolah_bola" ? [{ unit: u, f: f.figures }] : []; });

  // The target is always about everything, whatever the filter says.
  const allLiga = liga(ligaUnits);
  const allSchool = school(schoolUnits);
  const owner = ownerDividend({
    liga: sum(allLiga, (x) => x.f.dividend.value),
    sekolahBola: sum(allSchool, (x) => x.f.dividend),
    target: DIVIDEND_TARGET,
  });

  // The explanations follow the filter.
  const shownLiga = liga(pool);
  const shownSchool = school(pool);
  const ligaTotal = ligaDividend({
    budget: sum(shownLiga, (x) => x.f.dividend.budget),
    capital: sum(shownLiga, (x) => x.f.dividend.capital),
    registration: sum(shownLiga, (x) => x.f.dividend.registration),
    matchFee: sum(shownLiga, (x) => x.f.dividend.matchFee),
  });
  // Assets of every unit (both types) add up for the owner; the filter narrows the per-unit table, not the grand total.
  const assetOf = (id: string) => figures.get(id)?.figures.assets ?? { total: 0, count: 0 };
  const assetsLigaAll = sum(ligaUnits, (u) => assetOf(u.id).total);
  const assetsSchoolAll = sum(schoolUnits, (u) => assetOf(u.id).total);
  const assetsAll = assetsLigaAll + assetsSchoolAll;
  const assetCountAll = sum(units, (u) => assetOf(u.id).count);
  const shownAssetUnits = pool.filter((u) => assetOf(u.id).count > 0 || selected);
  const schoolIncome = sum(shownSchool, (x) => x.f.income.total);
  const schoolExpense = sum(shownSchool, (x) => x.f.expense);

  const monthMap = new Map<string, { income: number; expense: number }>();
  for (const { f } of shownSchool) {
    for (const m of f.months) {
      const cur = monthMap.get(m.month) ?? { income: 0, expense: 0 };
      cur.income += m.income;
      cur.expense += m.expense;
      monthMap.set(m.month, cur);
    }
  }
  const schoolMonths = [...monthMap.entries()].sort(([a], [b]) => b.localeCompare(a));

  const pct = (fraction: number) => `${(fraction * 100).toLocaleString(fmt.tag, { maximumFractionDigits: 1 })}%`;
  const barShare = (value: number) => Math.min(100, (Math.max(0, value) / owner.target) * 100);
  const chip = (href: string, label: string, active: boolean) => (
    <Link key={href} href={href} className={cn("border px-3 py-1.5 text-xs font-medium transition-colors", active ? "border-black bg-black text-white" : "border-line hover:border-ink")}>
      {label}
    </Link>
  );

  return (
    <div>
      <PageHeader title="Ringkasan Owner" description="Dividen seluruh unit bisnis, diakumulasikan terhadap target. Liga dan Sekolah Bola dijelaskan terpisah." />

      {units.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Belum ada unit bisnis"
          description="Buat unit Liga atau Sekolah Bola lebih dulu. Dividen dan target akan terhitung otomatis."
          action={<Link href="/unit" className="border border-black bg-black px-4 py-2 text-sm font-semibold text-white">Kelola Unit Bisnis</Link>}
        />
      ) : (
        <>
          {/* ── Target ─────────────────────────────────────────────── */}
          <section className="border-2 border-black bg-white">
            <div className="grid gap-px bg-black lg:grid-cols-[1.4fr_1fr]">
              <div className="bg-white p-6">
                <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
                  <Target className="size-3.5" /> Akumulasi dividen — semua unit
                </p>
                <p className="mt-3 text-[clamp(2rem,4.4vw,3.4rem)] font-semibold leading-none tracking-tight tabular-nums text-ink" title={fmt.rupiah(owner.accumulated)}>
                  {fmt.rupiah(owner.accumulated)}
                </p>
                <p className="mt-2 text-sm text-ink-muted">
                  dari target <span className="font-semibold text-ink">{fmt.rupiah(owner.target)}</span> (3 M)
                </p>

                <div className="mt-6" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(owner.progress * 100)} aria-label="Progres menuju target dividen">
                  <div className="relative h-6 border border-black bg-white">
                    <div className="absolute inset-y-0 left-0 bg-black" style={{ width: `${barShare(owner.liga)}%` }} />
                    <div className="hatch absolute inset-y-0 border-l border-black" style={{ left: `${barShare(owner.liga)}%`, width: `${Math.min(barShare(owner.sekolahBola), 100 - barShare(owner.liga))}%` }} />
                  </div>
                  <div className="mt-2 flex justify-between text-[10px] tabular-nums text-ink-muted">
                    <span>Rp 0</span>
                    <span>Rp 1,5 M</span>
                    <span>Rp 3 M</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
                    <span className="flex items-center gap-2"><span className="size-3 bg-black" /> Liga {fmt.rupiahCompact(owner.liga)}</span>
                    <span className="flex items-center gap-2"><span className="hatch size-3 border border-black" /> Sekolah Bola {fmt.rupiahCompact(owner.sekolahBola)}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-px bg-black lg:grid-cols-1">
                <div className="bg-black p-6 text-white">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">Tercapai</p>
                  <p className="mt-2 text-4xl font-semibold tabular-nums">{pct(owner.progress)}</p>
                </div>
                <div className="bg-surface-2 p-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">{owner.remaining > 0 ? "Sisa menuju target" : "Target tercapai"}</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-ink" title={fmt.rupiah(owner.remaining)}>
                    {owner.remaining > 0 ? fmt.rupiahCompact(owner.remaining) : "✓"}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi label="Dividen Liga" value={fmt.rupiahCompact(owner.liga)} full={fmt.rupiah(owner.liga)} block="red" hint={`${fmt.number(ligaUnits.length)} unit Liga`} />
            <Kpi label="Dividen Sekolah Bola" value={fmt.rupiahCompact(owner.sekolahBola)} full={fmt.rupiah(owner.sekolahBola)} block="blue" hint={`${fmt.number(schoolUnits.length)} unit Sekolah Bola`} />
            <Kpi label="Total aset" value={fmt.rupiahCompact(assetsAll)} full={fmt.rupiah(assetsAll)} icon={<Package className="size-4" />} block="yellow" hint={`Liga ${fmt.rupiahCompact(assetsLigaAll)} · Sekolah Bola ${fmt.rupiahCompact(assetsSchoolAll)}`} />
            <Kpi label="Total unit" value={fmt.number(units.length)} block="white" hint={`${fmt.number(ligaUnits.length)} Liga · ${fmt.number(schoolUnits.length)} Sekolah Bola`} />
            <Kpi label="Target" value="Rp 3 M" full={fmt.rupiah(owner.target)} block="white" hint="Dividen Liga + Sekolah Bola" />
          </div>

          <div className="mt-8">
            <GuideCard
              id="owner"
              title="Cara membaca ringkasan Owner"
              intro="Bagian atas menjumlahkan dividen semua unit dan membandingkannya dengan target. Di bawahnya, dividen Liga dan dividen Sekolah Bola dijelaskan sendiri-sendiri karena rumusnya berbeda. Filter unit hanya mempengaruhi bagian penjelasan, bukan angka target."
              terms={[
                { term: "Dividen Liga", text: "RAB − (uang modal + uang masuk registrasi + uang masuk match fee), dihitung per unit Liga." },
                { term: "Dividen Sekolah Bola", text: "Pemasukan − pengeluaran, dihitung per bulan lalu dijumlahkan, per unit Sekolah Bola." },
                { term: "Akumulasi", text: "Dividen Liga ditambah dividen Sekolah Bola dari semua unit." },
                { term: "Total aset", text: "Nilai seluruh aset dari semua unit, Liga dan Sekolah Bola. Aset berasal dari menu Aset, baris RAB bertanda Aset, dan pengeluaran Sekolah Bola bertanda Aset." },
              ]}
            />

            <div className="mb-6 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Filter unit</span>
              {chip("/ringkasan", "Semua unit", !selected)}
              {units.map((u) => chip(`/ringkasan?unit=${encodeURIComponent(u.code)}`, u.name, selected?.id === u.id))}
            </div>

            {/* ── Liga ─────────────────────────────────────────────── */}
            {(!selected || selected.type === "liga") && (
              <section className="mb-10">
                <h2 className="mb-3 border-b-2 border-black pb-2 text-lg font-semibold tracking-tight">Dividen Liga</h2>
                {shownLiga.length === 0 ? (
                  <p className="border border-dashed border-ink/40 px-4 py-6 text-center text-xs text-ink-muted">Belum ada unit Liga.</p>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
                    <Formula
                      title={selected ? `Perhitungan — ${selected.name}` : "Perhitungan — semua unit Liga"}
                      formula="Dividen = RAB − (Uang modal + Registrasi + Match fee)"
                      lines={[
                        { label: "RAB (estimasi OPEX)", value: fmt.rupiah(ligaTotal.budget) },
                        { op: "−", label: "Uang modal", value: fmt.rupiah(ligaTotal.capital) },
                        { op: "−", label: "Uang masuk registrasi", value: fmt.rupiah(ligaTotal.registration) },
                        { op: "−", label: "Uang masuk match fee", value: fmt.rupiah(ligaTotal.matchFee) },
                      ]}
                      resultLabel="Dividen Liga"
                      result={fmt.rupiah(ligaTotal.value)}
                    />
                    <Card>
                      <CardContent className="space-y-3">
                        <BlockTitle title="Per unit Liga" hint="Angka yang sama dengan menu Dividen masing-masing unit." />
                        <Table>
                          <THead>
                            <TR className="hover:bg-transparent">
                              <TH>Unit</TH>
                              <TH className="text-right">RAB</TH>
                              <TH className="text-right">Modal</TH>
                              <TH className="text-right">Registrasi</TH>
                              <TH className="text-right">Match fee</TH>
                              <TH className="text-right">Dividen</TH>
                            </TR>
                          </THead>
                          <TBody>
                            {shownLiga.map(({ unit, f }) => (
                              <TR key={unit.id}>
                                <TD>
                                  <Link href={menuHref(unit.code, "dividen")} className="inline-flex items-center gap-1 font-semibold text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink">
                                    {unit.name} <ArrowUpRight className="size-3" />
                                  </Link>
                                </TD>
                                <TD className="text-right tabular-nums">{fmt.rupiahCompact(f.dividend.budget)}</TD>
                                <TD className="text-right tabular-nums">{fmt.rupiahCompact(f.dividend.capital)}</TD>
                                <TD className="text-right tabular-nums">{fmt.rupiahCompact(f.dividend.registration)}</TD>
                                <TD className="text-right tabular-nums">{fmt.rupiahCompact(f.dividend.matchFee)}</TD>
                                <TD className="text-right font-semibold tabular-nums text-ink">{fmt.rupiahCompact(f.dividend.value)}</TD>
                              </TR>
                            ))}
                          </TBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </section>
            )}

            {/* ── Sekolah Bola ─────────────────────────────────────── */}
            {(!selected || selected.type === "sekolah_bola") && (
              <section className="mb-4">
                <h2 className="mb-3 border-b-2 border-black pb-2 text-lg font-semibold tracking-tight">Dividen Sekolah Bola</h2>
                {shownSchool.length === 0 ? (
                  <p className="border border-dashed border-ink/40 px-4 py-6 text-center text-xs text-ink-muted">Belum ada unit Sekolah Bola.</p>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
                    <div className="space-y-4">
                      <Formula
                        title={selected ? `Perhitungan — ${selected.name}` : "Perhitungan — semua unit Sekolah Bola"}
                        formula="Dividen per bulan = Pemasukan − Pengeluaran"
                        lines={[
                          { label: "Total pemasukan", value: fmt.rupiah(schoolIncome), hint: "Registrasi + iuran bulanan" },
                          { op: "−", label: "Total pengeluaran", value: fmt.rupiah(schoolExpense) },
                        ]}
                        resultLabel="Dividen Sekolah Bola"
                        result={fmt.rupiah(schoolIncome - schoolExpense)}
                      />
                    </div>
                    <div className="space-y-4">
                      <Card>
                        <CardContent className="space-y-3">
                          <BlockTitle title="Per unit Sekolah Bola" />
                          <Table>
                            <THead>
                              <TR className="hover:bg-transparent">
                                <TH>Unit</TH>
                                <TH className="text-right">Siswa</TH>
                                <TH className="text-right">Pemasukan</TH>
                                <TH className="text-right">Pengeluaran</TH>
                                <TH className="text-right">Dividen</TH>
                              </TR>
                            </THead>
                            <TBody>
                              {shownSchool.map(({ unit, f }) => (
                                <TR key={unit.id}>
                                  <TD>
                                    <Link href={menuHref(unit.code)} className="inline-flex items-center gap-1 font-semibold text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink">
                                      {unit.name} <ArrowUpRight className="size-3" />
                                    </Link>
                                  </TD>
                                  <TD className="text-right tabular-nums">{fmt.number(f.students)}</TD>
                                  <TD className="text-right tabular-nums">{fmt.rupiahCompact(f.income.total)}</TD>
                                  <TD className="text-right tabular-nums">{fmt.rupiahCompact(f.expense)}</TD>
                                  <TD className="text-right font-semibold tabular-nums text-ink">{fmt.rupiahCompact(f.dividend)}</TD>
                                </TR>
                              ))}
                            </TBody>
                          </Table>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="space-y-3">
                          <BlockTitle title="Dividen per bulan" hint="Pemasukan − pengeluaran, semua unit Sekolah Bola di filter." />
                          {schoolMonths.length === 0 ? (
                            <p className="py-4 text-center text-xs text-ink-muted">Belum ada pemasukan atau pengeluaran tercatat.</p>
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
                                {schoolMonths.map(([month, m]) => (
                                  <TR key={month}>
                                    <TD className="font-medium text-ink">{fmt.date(`${month}-01`, { month: "long", year: "numeric" })}</TD>
                                    <TD className="text-right tabular-nums">{fmt.rupiah(m.income)}</TD>
                                    <TD className="text-right tabular-nums">{fmt.rupiah(m.expense)}</TD>
                                    <TD className="text-right font-semibold tabular-nums text-ink">{fmt.rupiah(m.income - m.expense)}</TD>
                                  </TR>
                                ))}
                              </TBody>
                            </Table>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* ── Aset ─────────────────────────────────────────────── */}
            <section className="mt-10">
              <h2 className="mb-3 border-b-2 border-black pb-2 text-lg font-semibold tracking-tight">Aset</h2>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
                <section className="border border-ink bg-white">
                  <header className="border-b border-ink px-5 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Akumulasi aset — semua unit</p>
                  </header>
                  <div className="space-y-3 p-5">
                    <p className="text-3xl font-semibold tabular-nums text-ink" title={fmt.rupiah(assetsAll)}>{fmt.rupiah(assetsAll)}</p>
                    <p className="text-xs text-ink-muted">{fmt.number(assetCountAll)} aset tercatat</p>
                    <dl className="divide-y divide-line border border-line text-sm">
                      <div className="flex items-center justify-between px-3 py-2"><dt className="text-ink-secondary">Aset Liga</dt><dd className="font-semibold tabular-nums text-ink">{fmt.rupiah(assetsLigaAll)}</dd></div>
                      <div className="flex items-center justify-between px-3 py-2"><dt className="text-ink-secondary">Aset Sekolah Bola</dt><dd className="font-semibold tabular-nums text-ink">{fmt.rupiah(assetsSchoolAll)}</dd></div>
                    </dl>
                  </div>
                </section>
                <Card>
                  <CardContent className="space-y-3">
                    <BlockTitle title="Aset per unit" hint={selected ? `Unit yang dipilih: ${selected.name}` : "Semua unit, dari yang bernilai terbesar."} />
                    {shownAssetUnits.length === 0 ? (
                      <p className="py-4 text-center text-xs text-ink-muted">Belum ada aset tercatat.</p>
                    ) : (
                      <Table>
                        <THead>
                          <TR className="hover:bg-transparent">
                            <TH>Unit</TH>
                            <TH>Jenis</TH>
                            <TH className="text-right">Jumlah</TH>
                            <TH className="text-right">Nilai aset</TH>
                          </TR>
                        </THead>
                        <TBody>
                          {[...shownAssetUnits]
                            .sort((a, b) => assetOf(b.id).total - assetOf(a.id).total)
                            .map((u) => (
                              <TR key={u.id}>
                                <TD>
                                  <Link href={menuHref(u.code, "aset")} className="inline-flex items-center gap-1 font-semibold text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink">
                                    {u.name} <ArrowUpRight className="size-3" />
                                  </Link>
                                </TD>
                                <TD>{UNIT_TYPE_LABEL[u.type]}</TD>
                                <TD className="text-right tabular-nums">{fmt.number(assetOf(u.id).count)}</TD>
                                <TD className="text-right font-semibold tabular-nums text-ink">{fmt.rupiah(assetOf(u.id).total)}</TD>
                              </TR>
                            ))}
                        </TBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </div>
            </section>
          </div>

          <p className="mt-6 text-[11px] text-ink-muted">
            <Badge>{UNIT_TYPE_LABEL.liga}</Badge> dan <Badge>{UNIT_TYPE_LABEL.sekolah_bola}</Badge> dihitung dari data yang diinput setiap unit; angka berubah otomatis saat data berubah.
          </p>
        </>
      )}
    </div>
  );
}
