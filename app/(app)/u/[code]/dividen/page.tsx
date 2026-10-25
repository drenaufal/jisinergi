import type { Metadata } from "next";
import { Award, CalendarCheck, Calculator, HandCoins, Users } from "lucide-react";
import { loadUnitPage } from "@/lib/finance/access";
import { ligaDataset, listDividends } from "@/lib/finance/queries";
import { dividendShares, sum, unitFigures } from "@/lib/finance/calc";
import { menuHref } from "@/lib/finance/unit-types";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, Progress } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BlockTitle, ColumnHead } from "@/components/finance/bits";
import { CHART_COLORS, RankBars, ShareDonut } from "@/components/finance/charts";
import { Formula } from "@/components/finance/formula";
import { GuideCard } from "@/components/finance/guide-card";
import { Kpi } from "@/components/finance/kpi";
import { getI18n } from "@/lib/i18n/server";
import { AddRecordButton, DeleteRecordButton, EditRecordButton, type FinanceRecord } from "../forms";

export const metadata: Metadata = { title: "Dividen" };
export const dynamic = "force-dynamic";

export default async function DividendsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { unit, form, canInput, canDelete } = await loadUnitPage(code, "liga");
  const { t, fmt } = await getI18n();

  const [rows, dataset] = await Promise.all([listDividends(unit.id), ligaDataset(unit.id, unit.programWeeks)]);
  const figures = unitFigures(dataset);
  const f = figures.dividend;
  const total = sum(rows, (r) => r.amount);
  // a recipient's portion is measured against everything this unit has paid out
  const shares = dividendShares(rows, total);
  const biggest = shares.reduce<(typeof shares)[number] | null>((top, s) => (!top || s.row.amount > top.row.amount ? s : top), null);
  const paid = rows.filter((r) => r.paidOn).length;
  const pct = (fraction: number) => `${(fraction * 100).toLocaleString(fmt.tag, { maximumFractionDigits: 1 })}%`;

  const record = (r: (typeof rows)[number]): FinanceRecord => ({
    id: r.id,
    businessUnitId: r.businessUnitId,
    recipientName: r.recipientName,
    amount: r.amount,
    paidOn: r.paidOn,
    note: r.note,
  });
  const actions = canInput || canDelete;
  const link = (slug: string) => menuHref(unit.code, slug);

  return (
    <div>
      <PageHeader
        eyebrow={unit.name}
        title="Dividen"
        description="Dividen unit Liga dihitung dari rumus, lalu dicatat siapa yang menerima berapa."
        actions={canInput && <AddRecordButton kind="dividend" ctx={form} />}
      />

      <GuideCard
        id="dividen"
        title="Cara membaca halaman Dividen"
        intro="Bagian atas menghitung dividen unit ini dengan rumus yang ditetapkan: RAB dikurangi jumlah uang modal, uang masuk registrasi, dan uang masuk match fee. Angka-angkanya diambil otomatis dari menu RAB, Modal, Registrasi, dan Match Fee. Bagian bawah adalah catatan pembagian dividen kepada penerima."
        terms={[
          { term: "Dividen (rumus)", text: "Hasil perhitungan otomatis. Berubah sendiri saat data di menu lain berubah." },
          { term: "Penerima", text: "Pemodal yang mendapat bagian dividen." },
          { term: "Nominal", text: "Jumlah yang dibagikan kepada penerima itu, dalam Rupiah." },
          { term: "Porsi", text: "Nominal penerima dibagi total dividen yang dibagikan unit ini." },
        ]}
      />

      <Formula
        className="mb-4"
        title="Perhitungan dividen — Liga"
        formula="Dividen = RAB − (Uang modal + Uang masuk registrasi + Uang masuk match fee)"
        lines={[
          { label: "RAB (estimasi OPEX)", value: fmt.rupiah(f.budget), href: link("rab"), hint: "Biaya mingguan × lama program + biaya bulanan" },
          { op: "−", label: "Uang modal", value: fmt.rupiah(f.capital), href: link("modal") },
          { op: "−", label: "Uang masuk registrasi", value: fmt.rupiah(f.registration), href: link("registrasi"), hint: "DP + pelunasan yang sudah diterima" },
          { op: "−", label: "Uang masuk match fee", value: fmt.rupiah(f.matchFee), href: link("match-fee") },
        ]}
        resultLabel="Dividen (rumus)"
        result={fmt.rupiah(f.value)}
        note={
          f.value < 0
            ? "Hasil negatif: uang modal, registrasi, dan match fee bersama-sama sudah melebihi RAB."
            : "Hasil ini ikut dijumlahkan ke akumulasi dividen Owner."
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Dividen (rumus)" value={fmt.rupiahCompact(f.value)} full={fmt.rupiah(f.value)} icon={<Calculator className="size-4" />} block="red" hint="RAB − (modal + registrasi + match fee)" />
        <Kpi label="Sudah dibagikan" value={fmt.rupiahCompact(total)} full={fmt.rupiah(total)} icon={<HandCoins className="size-4" />} block="blue" hint={`${fmt.number(rows.length)} pembagian tercatat`} />
        <Kpi
          label="Penerima terbesar"
          value={biggest ? pct(biggest.share) : "—"}
          full={biggest ? fmt.rupiah(biggest.row.amount) : undefined}
          icon={<Award className="size-4" />}
          block="yellow"
          hint={biggest ? `${biggest.row.recipientName} · ${fmt.rupiahCompact(biggest.row.amount)}` : "Belum ada data."}
        />
        <Kpi label="Sudah dibayarkan" value={`${fmt.number(paid)}/${fmt.number(rows.length)}`} icon={<CalendarCheck className="size-4" />} block="white" hint="Baris yang punya tanggal bayar" />
      </div>

      {rows.length > 0 && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Porsi per penerima</CardTitle>
            </CardHeader>
            <CardContent>
              <ShareDonut
                centerLabel="Dibagikan"
                slices={rows.map((r, i) => ({ label: r.recipientName, value: r.amount, color: CHART_COLORS[i % CHART_COLORS.length] }))}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Nominal per penerima</CardTitle>
            </CardHeader>
            <CardContent>
              <RankBars
                items={[...shares]
                  .sort((a, b) => b.row.amount - a.row.amount)
                  .map((s) => ({ label: s.row.recipientName, value: s.row.amount, valueLabel: fmt.rupiah(s.row.amount), sublabel: pct(s.share) }))}
                accent="var(--color-chart-1)"
              />
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="mt-4">
        <CardContent className="space-y-4">
          <BlockTitle title="Catatan pembagian dividen" hint="Satu baris untuk setiap penerima." />
          {rows.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Belum ada pembagian dividen tercatat"
              description={canInput ? "Klik “Tambah dividen” untuk mencatat pembagian pertama." : "Belum ada pembagian dividen untuk ditampilkan."}
            />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH className="w-10">No</TH>
                  <TH><ColumnHead label="Penerima" hint="Pemodal" /></TH>
                  <TH className="text-right"><ColumnHead label="Nominal" hint="Dividen diterima" align="right" /></TH>
                  <TH className="min-w-40"><ColumnHead label="Porsi" hint="Dari yang dibagikan" /></TH>
                  <TH><ColumnHead label="Tanggal dibayar" hint="Kosong = belum dicatat" /></TH>
                  {actions && <TH><span className="sr-only">{t("Aksi")}</span></TH>}
                </TR>
              </THead>
              <TBody>
                {shares.map(({ row: r, share }, i) => (
                  <TR key={r.id}>
                    <TD className="tabular-nums text-ink-muted">{i + 1}</TD>
                    <TD>
                      <span className="font-medium text-ink">{r.recipientName}</span>
                      {r.note && <span className="block text-[11px] text-ink-muted">{r.note}</span>}
                    </TD>
                    <TD className="text-right font-medium tabular-nums text-ink">{fmt.rupiah(r.amount)}</TD>
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <Progress value={share * 100} className="w-24" />
                        <span className="w-12 text-right text-xs font-semibold tabular-nums text-ink">{pct(share)}</span>
                      </div>
                    </TD>
                    <TD className="whitespace-nowrap tabular-nums text-ink-muted">{r.paidOn ? fmt.date(r.paidOn) : "—"}</TD>
                    {actions && (
                      <TD>
                        <div className="flex justify-end gap-0.5">
                          {canInput && <EditRecordButton kind="dividend" record={record(r)} ctx={form} />}
                          {canDelete && <DeleteRecordButton kind="dividend" id={r.id} name={r.recipientName} />}
                        </div>
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
              <tfoot>
                <tr className="border-t-2 border-ink bg-surface-2">
                  <td colSpan={2} className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-ink">
                    Total dibagikan
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-bold tabular-nums text-ink">{fmt.rupiah(total)}</td>
                  <td colSpan={actions ? 3 : 2} />
                </tr>
              </tfoot>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
