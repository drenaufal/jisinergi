import Link from "next/link";
import { ArrowUpRight, Calculator, Clock, HandCoins, Landmark, Package, Wallet } from "lucide-react";
import type { UnitInfo } from "@/lib/finance/access";
import { ligaDataset } from "@/lib/finance/queries";
import { budgetByCategory, matchFeeByWeek, unitFigures } from "@/lib/finance/calc";
import { menuHref } from "@/lib/finance/unit-types";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { BlockTitle, Notice } from "@/components/finance/bits";
import { ColumnChart, RankBars, ShareDonut } from "@/components/finance/charts";
import { Formula } from "@/components/finance/formula";
import { GuideCard } from "@/components/finance/guide-card";
import { Kpi } from "@/components/finance/kpi";
import { getI18n } from "@/lib/i18n/server";

/** Summary of one Liga unit: the six ledgers at a glance, plus the dividend formula. */
export async function LigaSummary({ unit }: { unit: UnitInfo }) {
  const { fmt } = await getI18n();
  const dataset = await ligaDataset(unit.id, unit.programWeeks);
  const f = unitFigures(dataset);
  const link = (slug: string) => menuHref(unit.code, slug);
  const pct = (fraction: number) => `${Math.round(fraction * 100)}%`;
  const pct1 = (fraction: number) => `${(fraction * 100).toLocaleString(fmt.tag, { maximumFractionDigits: 1 })}%`;
  const empty = f.capital.count + f.assets.count + f.registration.clubs + f.matchFee.matches + f.budget.lines + f.dividends.count === 0;

  const weeks = matchFeeByWeek(dataset.matchFees, unit.programWeeks);
  const topCategories = budgetByCategory(dataset.budget, unit.programWeeks).slice(0, 6);

  const tiles = [
    { slug: "modal", label: "Modal masuk", value: f.capital.total, icon: <Landmark className="size-4" />, block: "red" as const, hint: `${pct(f.capital.returnedShare)} sudah kembali · ${fmt.rupiahCompact(f.capital.outstanding)} belum` },
    { slug: "aset", label: "Aset dibeli", value: f.assets.total, icon: <Package className="size-4" />, block: "blue" as const, hint: `${fmt.number(f.assets.count)} pembelian` },
    { slug: "registrasi", label: "Uang masuk", value: f.income, icon: <Wallet className="size-4" />, block: "yellow" as const, hint: `Registrasi ${fmt.rupiahCompact(f.registration.received)} · match fee ${fmt.rupiahCompact(f.matchFee.amount)}` },
    {
      slug: "registrasi",
      label: "Sisa tagihan registrasi",
      value: f.registration.remaining,
      icon: <Clock className="size-4" />,
      block: "white" as const,
      tone: f.registration.remaining > 0 ? ("warn" as const) : ("default" as const),
      hint: `${fmt.number(f.registration.paidClubs)} dari ${fmt.number(f.registration.clubs)} klub sudah lunas`,
    },
    { slug: "rab", label: "Anggaran (RAB)", value: f.budget.total, icon: <Calculator className="size-4" />, block: "night" as const, hint: `${fmt.rupiahCompact(f.budget.weeklyPerWeek)} per minggu · ${fmt.rupiahCompact(f.budget.monthly)} bulanan` },
    { slug: "dividen", label: "Dividen (rumus)", value: f.dividend.value, icon: <HandCoins className="size-4" />, block: "white" as const, hint: "RAB − (modal + registrasi + match fee)" },
  ];

  return (
    <div>
      <PageHeader eyebrow={unit.name} title="Ringkasan unit" description="Modal, aset, uang masuk, anggaran, dan dividen unit ini dalam satu halaman." />

      <GuideCard
        id="ringkasan-liga"
        title="Cara membaca ringkasan ini"
        intro="Setiap kotak adalah satu menu unit; klik kotaknya untuk melihat tabel rincinya. Angka besar dipendekkan (1 jt = 1 juta Rupiah) — arahkan kursor ke angka untuk melihat nilai lengkapnya."
        terms={[
          { term: "Modal masuk", text: "Uang yang disetor pemodal dan berapa persen yang sudah dikembalikan." },
          { term: "Aset dibeli", text: "Peralatan dan sarana pertandingan yang sudah dibeli." },
          { term: "Uang masuk", text: "Uang dari klub: registrasi (DP + pelunasan) ditambah match fee." },
          { term: "Anggaran (RAB)", text: "Perkiraan seluruh pengeluaran: biaya mingguan seluruh program ditambah biaya bulanan." },
          { term: "Dividen (rumus)", text: "RAB dikurangi (uang modal + registrasi + match fee). Dihitung otomatis." },
        ]}
      />

      {empty && (
        <Notice tone="info" title="Belum ada data keuangan" className="mb-4">
          Mulai dari menu Modal, Aset, Registrasi, Match Fee, atau RAB. Angka di halaman ini terisi sendiri begitu data dimasukkan.
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {tiles.map((tile) => (
          <Link key={tile.label} href={link(tile.slug)} className="group block outline-none transition-transform hover:-translate-y-0.5">
            <Kpi label={tile.label} value={fmt.rupiahCompact(tile.value)} full={fmt.rupiah(tile.value)} icon={tile.icon} block={tile.block} tone={tile.tone} hint={tile.hint} />
          </Link>
        ))}
      </div>

      <Formula
        className="mt-4"
        title="Perhitungan dividen — Liga"
        formula="Dividen = RAB − (Uang modal + Uang masuk registrasi + Uang masuk match fee)"
        lines={[
          { label: "RAB (estimasi OPEX)", value: fmt.rupiah(f.dividend.budget), href: link("rab") },
          { op: "−", label: "Uang modal", value: fmt.rupiah(f.dividend.capital), href: link("modal") },
          { op: "−", label: "Uang masuk registrasi", value: fmt.rupiah(f.dividend.registration), href: link("registrasi") },
          { op: "−", label: "Uang masuk match fee", value: fmt.rupiah(f.dividend.matchFee), href: link("match-fee") },
        ]}
        resultLabel="Dividen (rumus)"
        result={fmt.rupiah(f.dividend.value)}
      />

      <Card className="mt-4">
        <CardContent className="space-y-3">
          <BlockTitle
            title="Seberapa jauh anggaran tertutup uang masuk?"
            hint="Uang masuk dari klub dibandingkan dengan estimasi OPEX di RAB."
            right={
              <Link href={link("rab")} className="flex shrink-0 items-center gap-1 text-[11px] text-ink-muted hover:text-ink">
                Lihat RAB <ArrowUpRight className="size-3" />
              </Link>
            }
          />
          <div className="flex items-end justify-between gap-3">
            <p className="text-4xl font-semibold tracking-tight tabular-nums text-ink">{pct1(f.budgetCoverage)}</p>
            <p className="pb-1 text-right text-xs text-ink-muted">
              {fmt.rupiah(f.income)} dari {fmt.rupiah(f.budget.total)}
            </p>
          </div>
          <Progress value={f.budgetCoverage * 100} />
          <p className="text-xs text-ink-secondary">
            {f.budget.total === 0
              ? "Belum ada anggaran (RAB), jadi belum ada pembanding."
              : f.budgetCoverage >= 1
                ? "Uang masuk sudah menutup seluruh estimasi OPEX."
                : `Masih kurang ${fmt.rupiah(f.budget.total - f.income)} untuk menutup seluruh estimasi OPEX.`}
          </p>
        </CardContent>
      </Card>

      {!empty && (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Match fee masuk per minggu</CardTitle>
              <Link href={link("match-fee")} className="flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink">
                Rincian <ArrowUpRight className="size-3" />
              </Link>
            </CardHeader>
            <CardContent>
              {f.matchFee.matches > 0 ? (
                <ColumnChart
                  data={weeks.map((w) => ({ label: `${w.week}`, value: w.amount, detail: `${w.matches} laga` }))}
                  summary={`Match fee per minggu, total ${fmt.rupiah(f.matchFee.amount)}`}
                  emptyLabel="Belum berjalan"
                />
              ) : (
                <p className="py-10 text-center text-xs text-ink-muted">Belum ada match fee tercatat</p>
              )}
              <p className="text-center text-[10px] uppercase tracking-wider text-ink-muted">Minggu ke-</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Status modal</CardTitle>
              <Link href={link("modal")} className="flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink">
                Rincian <ArrowUpRight className="size-3" />
              </Link>
            </CardHeader>
            <CardContent>
              {f.capital.total > 0 ? (
                <ShareDonut
                  size={116}
                  centerLabel="Total modal"
                  slices={[
                    { label: "Sudah kembali", value: f.capital.returned, color: "var(--color-chart-1)" },
                    { label: "Belum kembali", value: f.capital.outstanding, color: "var(--color-chart-4)" },
                  ]}
                />
              ) : (
                <p className="py-10 text-center text-xs text-ink-muted">Belum ada modal tercatat</p>
              )}
            </CardContent>
          </Card>
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Kategori biaya terbesar di RAB</CardTitle>
              <Link href={link("rab")} className="flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink">
                Rincian <ArrowUpRight className="size-3" />
              </Link>
            </CardHeader>
            <CardContent>
              {topCategories.length ? (
                <RankBars
                  items={topCategories.map((c) => ({
                    label: c.category,
                    value: c.amount,
                    valueLabel: fmt.rupiah(c.amount),
                    sublabel: f.budget.total ? `${Math.round((c.amount / f.budget.total) * 100)}%` : undefined,
                  }))}
                  accent="var(--color-chart-1)"
                />
              ) : (
                <p className="py-6 text-center text-xs text-ink-muted">Belum ada anggaran tercatat</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
