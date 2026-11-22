import type { Metadata } from "next";
import { ArrowDownToLine, ArrowUpFromLine, PiggyBank, Users } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { listSavings, savingKey, savingNameSuggestions, savingsBalances } from "@/lib/finance/savings";
import { sum } from "@/lib/finance/calc";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BlockTitle } from "@/components/finance/bits";
import { Kpi } from "@/components/finance/kpi";
import { getI18n } from "@/lib/i18n/server";
import { DeleteSavingButton, SavingForm } from "./nabung-form";

export const metadata: Metadata = { title: "Nabung" };
export const dynamic = "force-dynamic";

/**
 * NABUNG — the Owner's savings book, laid out like the user's sheet: "Owner" (nama, jumlah uang = masuk − keluar)
 * on top, "Pencatatan" (nama, uang, tanggal, keterangan masuk/keluar) underneath, and a form to add a record.
 */
export default async function SavingsPage() {
  const user = await requireCapability("all-units");
  const { fmt } = await getI18n();
  const rows = await listSavings();
  const balances = savingsBalances(rows);
  const names = await savingNameSuggestions();
  const canDelete = can(user.role, "delete");

  const totalIn = sum(rows.filter((r) => r.direction === "in"), (r) => r.amount);
  const totalOut = sum(rows.filter((r) => r.direction === "out"), (r) => r.amount);
  const total = totalIn - totalOut;

  return (
    <div>
      <PageHeader title="Nabung" description="Tabungan para pemilik. Jumlah uang setiap orang = total uang masuk − total uang keluar. Angkanya juga tampil di Ringkasan Owner." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Jumlah uang" value={fmt.rupiahCompact(total)} full={fmt.rupiah(total)} icon={<PiggyBank className="size-4" />} block="red" hint="Semua orang, masuk − keluar" />
        <Kpi label="Total masuk" value={fmt.rupiahCompact(totalIn)} full={fmt.rupiah(totalIn)} icon={<ArrowDownToLine className="size-4" />} block="white" hint={`${fmt.number(rows.filter((r) => r.direction === "in").length)} catatan`} />
        <Kpi label="Total keluar" value={fmt.rupiahCompact(totalOut)} full={fmt.rupiah(totalOut)} icon={<ArrowUpFromLine className="size-4" />} block="yellow" hint={`${fmt.number(rows.filter((r) => r.direction === "out").length)} catatan`} />
        <Kpi label="Penabung" value={fmt.number(balances.length)} icon={<Users className="size-4" />} block="white" hint="Orang yang punya catatan" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* ── Owner: nama & jumlah uang ─────────────────────────── */}
        <Card>
          <CardContent className="space-y-3">
            <BlockTitle title="Owner" hint="Jumlah uang = uang masuk − uang keluar." />
            {balances.length === 0 ? (
              <p className="border border-dashed border-ink/40 px-4 py-6 text-center text-xs text-ink-muted">Belum ada catatan. Isi formulir “Catat uang masuk / keluar” untuk mulai menabung.</p>
            ) : (
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Nama</TH>
                    <TH className="text-right">Masuk</TH>
                    <TH className="text-right">Keluar</TH>
                    <TH className="text-right">Jumlah uang</TH>
                  </TR>
                </THead>
                <TBody>
                  {balances.map((b) => (
                    <TR key={b.name}>
                      <TD className="font-semibold text-ink">{b.name}</TD>
                      <TD className="text-right tabular-nums">{fmt.rupiah(b.in)}</TD>
                      <TD className="text-right tabular-nums">{fmt.rupiah(b.out)}</TD>
                      <TD className="text-right font-semibold tabular-nums text-ink">{fmt.rupiah(b.balance)}</TD>
                    </TR>
                  ))}
                  <TR className="border-t-2 border-ink bg-surface-2 hover:bg-surface-2">
                    <TD className="text-xs font-bold uppercase tracking-wider">Total</TD>
                    <TD className="text-right font-semibold tabular-nums">{fmt.rupiah(totalIn)}</TD>
                    <TD className="text-right font-semibold tabular-nums">{fmt.rupiah(totalOut)}</TD>
                    <TD className="text-right font-bold tabular-nums text-ink">{fmt.rupiah(total)}</TD>
                  </TR>
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* ── Form input pencatatan ─────────────────────────────── */}
        <Card>
          <CardContent className="space-y-3">
            <BlockTitle title="Catat uang masuk / keluar" hint="Uang keluar tidak boleh lebih dari jumlah uang orang itu." />
            <SavingForm names={names} balances={Object.fromEntries(balances.map((b) => [savingKey(b.name), b.balance]))} />
          </CardContent>
        </Card>
      </div>

      {/* ── Pencatatan ─────────────────────────────────────────── */}
      <Card className="mt-4">
        <CardContent className="space-y-3">
          <BlockTitle title="Pencatatan" hint={rows.length ? `${fmt.number(rows.length)} catatan, terbaru di atas.` : undefined} />
          {rows.length === 0 ? (
            <p className="border border-dashed border-ink/40 px-4 py-6 text-center text-xs text-ink-muted">Belum ada uang masuk atau keluar yang dicatat.</p>
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Nama</TH>
                  <TH className="text-right">Uang</TH>
                  <TH>Tanggal</TH>
                  <TH>Keterangan</TH>
                  {canDelete && <TH className="w-12"><span className="sr-only">Aksi</span></TH>}
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-medium text-ink">{r.name}</TD>
                    <TD className="text-right tabular-nums text-ink">
                      {r.direction === "out" ? "− " : ""}
                      {fmt.rupiah(r.amount)}
                    </TD>
                    <TD className="whitespace-nowrap tabular-nums">{fmt.date(r.savedOn)}</TD>
                    <TD>
                      <Badge tone={r.direction === "in" ? "brand" : "info"}>{r.direction === "in" ? "Masuk" : "Keluar"}</Badge>
                    </TD>
                    {canDelete && (
                      <TD className="px-2 py-1">
                        <DeleteSavingButton id={r.id} label={`${r.name} · ${r.direction === "in" ? "masuk" : "keluar"} ${fmt.rupiah(r.amount)} · ${fmt.date(r.savedOn)}`} />
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
