import type { Metadata } from "next";
import { CheckCircle2, Clock, Landmark, Users } from "lucide-react";
import { loadUnitPage } from "@/lib/finance/access";
import { listCapital } from "@/lib/finance/queries";
import { capitalSummary } from "@/lib/finance/calc";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BlockTitle, ColumnHead } from "@/components/finance/bits";
import { RankBars, ShareDonut } from "@/components/finance/charts";
import { GuideCard } from "@/components/finance/guide-card";
import { Kpi } from "@/components/finance/kpi";
import { getI18n } from "@/lib/i18n/server";
import { AddRecordButton, DeleteRecordButton, EditRecordButton, MarkReturnedButton, type FinanceRecord } from "../forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t("Modal") };
}
export const dynamic = "force-dynamic";

export default async function CapitalPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { unit, form, canInput, canDelete } = await loadUnitPage(code);
  const { t, fmt } = await getI18n();

  const rows = await listCapital(unit.id);
  const sum = capitalSummary(rows);
  const outstandingCount = rows.filter((r) => r.status === "outstanding").length;

  const record = (r: (typeof rows)[number]): FinanceRecord => ({
    id: r.id,
    businessUnitId: r.businessUnitId,
    ownerName: r.ownerName,
    amount: r.amount,
    status: r.status,
    investedOn: r.investedOn,
    returnedOn: r.returnedOn,
    note: r.note,
  });
  const actions = canInput || canDelete;

  return (
    <div>
      <PageHeader
        eyebrow={unit.name}
        title={t("Modal")}
        description={t("Uang yang disetor pemodal ke unit bisnis, dan apakah modal itu sudah dikembalikan.")}
        actions={canInput && <AddRecordButton kind="capital" ctx={form} />}
      />

      <GuideCard
        id="modal"
        title={t("Cara membaca halaman Modal")}
        intro={t("Modal adalah uang awal yang disetor pemodal supaya unit bisnis bisa berjalan. Seiring waktu modal bisa dikembalikan. Halaman ini menunjukkan berapa modal yang masuk, berapa yang sudah kembali, dan berapa yang masih menjadi tanggungan.")}
        terms={[
          { term: t("Pemodal"), text: t("Orang atau pihak yang menyetor uang.") },
          { term: t("Modal"), text: t("Jumlah uang yang disetor, dalam Rupiah.") },
          { term: t("Modal sudah kembali"), text: t("Uangnya sudah dikembalikan kepada pemodal.") },
          { term: t("Modal belum kembali"), text: t("Uangnya masih dipakai unit dan belum dikembalikan.") },
        ]}
        tip={canInput ? t("Saat modal dikembalikan, klik “Tandai sudah kembali” — status dan tanggal hari ini terisi otomatis.") : undefined}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t("Total modal")} value={fmt.rupiahCompact(sum.total)} full={fmt.rupiah(sum.total)} icon={<Landmark className="size-4" />} block="red" hint={t("{n} setoran", { n: fmt.number(rows.length) })} />
        <Kpi
          label={t("Sudah kembali")}
          value={fmt.rupiahCompact(sum.returned)}
          full={fmt.rupiah(sum.returned)}
          icon={<CheckCircle2 className="size-4" />}
          block="blue"
          hint={t("{pct}% dari total modal", { pct: Math.round(sum.returnedShare * 100) })}
        />
        <Kpi
          label={t("Belum kembali")}
          value={fmt.rupiahCompact(sum.outstanding)}
          full={fmt.rupiah(sum.outstanding)}
          icon={<Clock className="size-4" />}
          block="yellow"
          hint={outstandingCount ? t("{n} setoran masih berjalan", { n: outstandingCount }) : t("Semua modal sudah kembali")}
        />
        <Kpi label={t("Jumlah pemodal")} value={fmt.number(new Set(rows.map((r) => `${r.businessUnitId}:${r.ownerName}`)).size)} icon={<Users className="size-4" />} block="night" hint={t("Orang/pihak yang menyetor")} />
      </div>

      {rows.length > 0 && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("Status pengembalian modal")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ShareDonut
                centerLabel={t("Total modal")}
                slices={[
                  { label: t("Sudah kembali"), value: sum.returned, color: "var(--color-success)" },
                  { label: t("Belum kembali"), value: sum.outstanding, color: "var(--color-warn)" },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("Modal per pemodal")}</CardTitle>
            </CardHeader>
            <CardContent>
              <RankBars
                items={[...rows]
                  .sort((a, b) => b.amount - a.amount)
                  .map((r) => ({ label: r.ownerName, value: r.amount, valueLabel: fmt.rupiah(r.amount) }))}
                accent="var(--color-chart-1)"
              />
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="mt-4">
        <CardContent className="space-y-4">
          <BlockTitle title={t("Daftar modal")} hint={t("Satu baris untuk setiap setoran modal.")} />
          {rows.length === 0 ? (
            <EmptyState
              icon={Landmark}
              title={t("Belum ada modal tercatat")}
              description={canInput ? t("Klik “Tambah modal” untuk mencatat setoran pertama.") : t("Belum ada modal untuk ditampilkan.")}
            />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH className="w-10">No</TH>
                  <TH><ColumnHead label={t("Pemodal")} hint={t("Yang menyetor uang")} /></TH>
                  <TH className="text-right"><ColumnHead label={t("Modal")} hint={t("Jumlah disetor")} align="right" /></TH>
                  <TH><ColumnHead label={t("Status")} hint={t("Sudah dikembalikan?")} /></TH>
                  <TH><ColumnHead label={t("Disetor")} hint={t("Tanggal")} /></TH>
                  <TH><ColumnHead label={t("Dikembalikan")} hint={t("Tanggal")} /></TH>
                  {actions && <TH><span className="sr-only">{t("Aksi")}</span></TH>}
                </TR>
              </THead>
              <TBody>
                {rows.map((r, i) => (
                  <TR key={r.id}>
                    <TD className="tabular-nums text-ink-muted">{i + 1}</TD>
                    <TD>
                      <span className="font-medium text-ink">{r.ownerName}</span>
                      {r.note && <span className="block text-[11px] text-ink-muted">{r.note}</span>}
                    </TD>
                    <TD className="text-right font-medium tabular-nums text-ink">{fmt.rupiah(r.amount)}</TD>
                    <TD>
                      <Badge tone={r.status === "returned" ? "success" : "warn"} dot>
                        {r.status === "returned" ? t("Modal sudah kembali") : t("Modal belum kembali")}
                      </Badge>
                    </TD>
                    <TD className="whitespace-nowrap tabular-nums text-ink-muted">{r.investedOn ? fmt.date(r.investedOn) : "—"}</TD>
                    <TD className="whitespace-nowrap tabular-nums text-ink-muted">{r.returnedOn ? fmt.date(r.returnedOn) : "—"}</TD>
                    {actions && (
                      <TD>
                        <div className="flex items-center justify-end gap-1">
                          {canInput && r.status === "outstanding" && <MarkReturnedButton id={r.id} />}
                          {canInput && <EditRecordButton kind="capital" record={record(r)} ctx={form} />}
                          {canDelete && <DeleteRecordButton kind="capital" id={r.id} name={r.ownerName} />}
                        </div>
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
              <tfoot>
                <tr className="border-t-2 border-line bg-surface-2">
                  <td colSpan={2} className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                    {t("Total modal")}
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-bold tabular-nums text-ink">{fmt.rupiah(sum.total)}</td>
                  <td colSpan={actions ? 4 : 3} className="px-3 py-3 text-xs text-ink-secondary">
                    {t("{returned} sudah kembali · {outstanding} belum kembali", { returned: fmt.rupiah(sum.returned), outstanding: fmt.rupiah(sum.outstanding) })}
                  </td>
                </tr>
              </tfoot>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
