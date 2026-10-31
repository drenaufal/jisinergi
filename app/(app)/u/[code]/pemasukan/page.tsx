import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownToLine, CalendarCheck, Percent, Scale, UserPlus, Users, Wallet } from "lucide-react";
import { loadUnitPage } from "@/lib/finance/access";
import { listExpenses, listStudentPayments, listStudents } from "@/lib/finance/queries";
import { coveredMonth, incomeByKind, incomeMonthsByKind, schoolMonthly, studentStatus, sum, type PaymentKind } from "@/lib/finance/calc";
import { PAYMENT_KIND_LABEL } from "@/lib/finance/entities";
import { currentMonth } from "@/lib/finance/period";
import { menuHref } from "@/lib/finance/unit-types";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BlockTitle, ColumnHead, ProofChip } from "@/components/finance/bits";
import { GroupedColumns } from "@/components/finance/grouped-chart";
import { GuideCard } from "@/components/finance/guide-card";
import { Kpi } from "@/components/finance/kpi";
import { getI18n } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";
import { AddRecordButton, DeleteRecordButton, EditRecordButton, type FinanceRecord } from "../forms";

export const metadata: Metadata = { title: "Pemasukan" };
export const dynamic = "force-dynamic";

const KINDS: PaymentKind[] = ["registration", "monthly"];
const isKind = (v: unknown): v is PaymentKind => typeof v === "string" && (KINDS as string[]).includes(v);

export default async function IncomePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ tab?: string; jenis?: string }>;
}) {
  const { code } = await params;
  const sp = await searchParams;
  const { unit, form, canInput, canDelete } = await loadUnitPage(code, "sekolah_bola");
  const { fmt } = await getI18n();

  const [students, payments, expenses] = await Promise.all([listStudents(unit.id), listStudentPayments(unit.id), listExpenses(unit.id)]);
  const tab = sp.tab === "pembayaran" ? "pembayaran" : "siswa";
  const kindFilter = isKind(sp.jenis) ? sp.jenis : null;
  const month = currentMonth();
  const monthLabel = (m: string) => fmt.date(`${m}-01`, { month: "short", year: "2-digit" });

  const income = incomeByKind(payments);
  // a registration already includes the fee of the month it was paid in, so it counts as "this month paid" too
  const paidThisMonth = students.filter((s) => studentStatus(payments, s.id, month).paidThisMonth).length;
  const monthRows = schoolMonthly(payments, expenses);
  const balanceNow = monthRows.find((m) => m.month === month)?.dividend ?? 0;
  const balanceAll = sum(monthRows, (m) => m.dividend);
  const formCtx = { ...form, students: students.map((s) => ({ id: s.id, name: s.name, jerseyNumber: s.jerseyNumber })) };
  const here = menuHref(unit.code, "pemasukan");
  const actions = canInput || canDelete;

  const byStudent = new Map<string, typeof payments>();
  for (const p of payments) byStudent.set(p.studentId, [...(byStudent.get(p.studentId) ?? []), p]);

  const studentRecord = (s: (typeof students)[number]): FinanceRecord => ({
    id: s.id,
    businessUnitId: s.businessUnitId,
    name: s.name,
    nickname: s.nickname,
    joinedOn: s.joinedOn,
    birthDate: s.birthDate,
    jerseyNumber: s.jerseyNumber,
    note: s.note,
  });
  const paymentRecord = (p: (typeof payments)[number]): FinanceRecord => ({
    id: p.id,
    businessUnitId: p.businessUnitId,
    studentId: p.studentId,
    kind: p.kind,
    paidOn: p.paidOn,
    amount: p.amount,
    discount: p.discount,
    period: p.period,
    proofUrl: p.proofUrl,
    note: p.note,
  });

  const months = incomeMonthsByKind(payments);
  const shownPayments = kindFilter ? payments.filter((p) => p.kind === kindFilter) : payments;

  const tabLink = (label: string, href: string, active: boolean, count: number) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("flex items-center gap-2 border px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors", active ? "border-black bg-black text-white" : "border-ink bg-white text-ink hover:bg-surface-2")}
    >
      {label}
      <span className={cn("px-1.5 py-0.5 text-[10px] tabular-nums", active ? "bg-white text-black" : "bg-surface-2")}>{fmt.number(count)}</span>
    </Link>
  );

  return (
    <div>
      <PageHeader
        eyebrow={unit.name}
        title="Pemasukan"
        description="Daftar siswa beserta pembayaran registrasi dan iuran bulanannya."
        actions={
          canInput && (
            <>
              <AddRecordButton kind="student" ctx={formCtx} variant="outline" />
              <AddRecordButton kind="payment" ctx={formCtx} />
            </>
          )
        }
      />

      <GuideCard
        id="pemasukan"
        title="Cara membaca halaman Pemasukan"
        intro="Satu baris di tab Siswa adalah satu anak — sama seperti satu baris pada formulir Excel “Sekolah Bola”. Setiap pembayaran dicatat di tab Pembayaran dan otomatis muncul pada baris anak yang bersangkutan."
        terms={[
          { term: "Registrasi", text: "Uang pendaftaran, dibayar sekali per siswa, dengan diskon jika ada. Sudah termasuk iuran bulan saat registrasi dibayar." },
          { term: "Iuran bulanan", text: "Satu pembayaran untuk setiap bulan; kolom “Bulan ini” menunjukkan siapa yang belum membayar." },
          { term: "Sisa saldo", text: "Pemasukan bulan ini dikurangi pengeluaran bulan ini (dividen per bulan). Uang jersey tidak dicatat sebagai pemasukan." },
          { term: "Diskon", text: "Potongan yang diberikan. Hanya informasi, bukan bagian dari uang yang diterima." },
          { term: "Bukti", text: "Foto atau scan bukti pembayaran. Klik “Lihat bukti” untuk membukanya." },
        ]}
        tip={canInput ? "Gunakan tombol “Bayar” di baris siswa untuk mencatat pembayarannya dengan cepat." : undefined}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Total pemasukan" value={fmt.rupiahCompact(income.total)} full={fmt.rupiah(income.total)} icon={<ArrowDownToLine className="size-4" />} block="red" hint={`${fmt.number(payments.length)} pembayaran`} />
        <Kpi label="Siswa" value={fmt.number(students.length)} icon={<Users className="size-4" />} block="blue" hint="Terdaftar di unit ini" />
        <Kpi label="Registrasi" value={fmt.rupiahCompact(income.registration)} full={fmt.rupiah(income.registration)} icon={<Wallet className="size-4" />} block="white" hint={`${fmt.number(new Set(payments.filter((p) => p.kind === "registration").map((p) => p.studentId)).size)} siswa`} />
        <Kpi label="Iuran bulanan" value={fmt.rupiahCompact(income.monthly)} full={fmt.rupiah(income.monthly)} icon={<CalendarCheck className="size-4" />} block="white" hint={`${fmt.number(paidThisMonth)}/${fmt.number(students.length)} siswa bayar ${monthLabel(month)}`} />
        <Kpi label="Diskon diberikan" value={fmt.rupiahCompact(income.discounts)} full={fmt.rupiah(income.discounts)} icon={<Percent className="size-4" />} block="yellow" hint="Registrasi + bulanan" />
        <Kpi label="Sisa saldo" value={fmt.rupiahCompact(balanceNow)} full={fmt.rupiah(balanceNow)} icon={<Scale className="size-4" />} block="night" hint={`Dividen ${monthLabel(month)} · akumulasi ${fmt.rupiahCompact(balanceAll)}`} />
      </div>

      {months.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Pemasukan per bulan</CardTitle>
          </CardHeader>
          <CardContent>
            <GroupedColumns
              data={months.map((m) => ({ label: monthLabel(m.month), values: [m.monthly, m.registration] }))}
              series={[
                { label: "Iuran bulanan", style: "solid" },
                { label: "Registrasi", style: "hatch" },
              ]}
              summary={`Pemasukan per bulan, total ${fmt.rupiah(income.total)}`}
            />
          </CardContent>
        </Card>
      )}

      <div className="mb-3 mt-6 flex flex-wrap items-center gap-2">
        {tabLink("Siswa", here, tab === "siswa", students.length)}
        {tabLink("Pembayaran", `${here}?tab=pembayaran`, tab === "pembayaran", payments.length)}
        {tab === "pembayaran" && (
          <span className="ml-auto flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-ink-muted">Jenis:</span>
            {[null, ...KINDS].map((k) => (
              <Link
                key={k ?? "all"}
                href={k ? `${here}?tab=pembayaran&jenis=${k}` : `${here}?tab=pembayaran`}
                className={cn("border px-2.5 py-1 font-medium", kindFilter === k ? "border-black bg-black text-white" : "border-line hover:border-ink")}
              >
                {k ? PAYMENT_KIND_LABEL[k] : "Semua"}
              </Link>
            ))}
          </span>
        )}
      </div>

      <Card>
        <CardContent className="space-y-4">
          {tab === "siswa" ? (
            <>
              <BlockTitle title="Daftar siswa" hint="Satu baris per anak, dengan ringkasan pembayarannya." />
              {students.length === 0 ? (
                <EmptyState
                  icon={UserPlus}
                  title="Belum ada siswa"
                  description={canInput ? "Klik “Tambah siswa” untuk mendaftarkan anak pertama." : "Belum ada siswa untuk ditampilkan."}
                />
              ) : (
                <Table>
                  <THead>
                    <TR className="hover:bg-transparent">
                      <TH className="w-10">No</TH>
                      <TH><ColumnHead label="Nama anak" hint="Nama panggilan" /></TH>
                      <TH><ColumnHead label="Tanggal lahir" hint="Anak" /></TH>
                      <TH><ColumnHead label="Bergabung" hint="Tanggal masuk" /></TH>
                      <TH className="text-center"><ColumnHead label="No punggung" align="center" /></TH>
                      <TH><ColumnHead label="Registrasi" hint="Uang · diskon" /></TH>
                      <TH><ColumnHead label={`Bulan ini`} hint={monthLabel(month)} /></TH>
                      <TH className="text-right"><ColumnHead label="Total dibayar" hint="Semua jenis" align="right" /></TH>
                      <TH className="w-44"><span className="sr-only">Aksi</span></TH>
                    </TR>
                  </THead>
                  <TBody>
                    {students.map((s, i) => {
                      const mine = byStudent.get(s.id) ?? [];
                      const reg = mine.find((p) => p.kind === "registration");
                      const monthPay = mine.find((p) => coveredMonth(p) === month);
                      return (
                        <TR key={s.id}>
                          <TD className="tabular-nums text-ink-muted">{i + 1}</TD>
                          <TD>
                            <span className="font-medium text-ink">{s.name}</span>
                            {s.nickname && <span className="block text-[11px] text-ink-muted">“{s.nickname}”</span>}
                          </TD>
                          <TD className="whitespace-nowrap tabular-nums">{s.birthDate ? fmt.date(s.birthDate) : "—"}</TD>
                          <TD className="whitespace-nowrap tabular-nums">{fmt.date(s.joinedOn)}</TD>
                          <TD className="text-center tabular-nums">{s.jerseyNumber ?? "—"}</TD>
                          <TD>
                            {reg ? (
                              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className="font-medium tabular-nums text-ink">{fmt.rupiah(reg.amount)}</span>
                                {reg.discount > 0 && <span className="text-[11px] text-ink-muted">− {fmt.rupiah(reg.discount)}</span>}
                                <ProofChip url={reg.proofUrl} viewLabel="Lihat bukti" missingLabel="Belum ada bukti" compact />
                              </span>
                            ) : (
                              <Badge tone="danger">Belum</Badge>
                            )}
                          </TD>
                          <TD>
                            {monthPay ? <Badge tone="success">Lunas</Badge> : <Badge tone="danger">Belum</Badge>}
                            {monthPay?.kind === "registration" && <span className="mt-0.5 block text-[10px] text-ink-muted">Dari registrasi</span>}
                          </TD>
                          <TD className="text-right font-medium tabular-nums text-ink">{fmt.rupiah(sum(mine, (p) => p.amount))}</TD>
                          <TD>
                            <div className="flex items-center justify-end gap-1">
                              {canInput && (
                                <AddRecordButton kind="payment" ctx={formCtx} variant="outline" preset={{ studentId: s.id, kind: reg ? "monthly" : "registration" }}>
                                  Bayar
                                </AddRecordButton>
                              )}
                              {canInput && <EditRecordButton kind="student" record={studentRecord(s)} ctx={formCtx} />}
                              {canDelete && <DeleteRecordButton kind="student" id={s.id} name={s.name} />}
                            </div>
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                  <tfoot>
                    <tr className="border-t-2 border-ink bg-surface-2">
                      <td colSpan={7} className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-ink">
                        Total pemasukan · {fmt.number(students.length)} siswa
                      </td>
                      <td className="px-3 py-3 text-right text-sm font-bold tabular-nums text-ink">{fmt.rupiah(income.total)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </Table>
              )}
            </>
          ) : (
            <>
              <BlockTitle title="Daftar pembayaran" hint="Terbaru di atas." />
              {shownPayments.length === 0 ? (
                <EmptyState
                  icon={Wallet}
                  title="Belum ada pembayaran"
                  description={canInput ? "Klik “Catat pembayaran” untuk mencatat pembayaran pertama." : "Belum ada pembayaran untuk ditampilkan."}
                />
              ) : (
                <Table>
                  <THead>
                    <TR className="hover:bg-transparent">
                      <TH>Tanggal</TH>
                      <TH>Siswa</TH>
                      <TH>Jenis</TH>
                      <TH>Untuk bulan</TH>
                      <TH className="text-right">Uang dibayar</TH>
                      <TH className="text-right">Diskon</TH>
                      <TH>Bukti</TH>
                      {actions && <TH className="w-24"><span className="sr-only">Aksi</span></TH>}
                    </TR>
                  </THead>
                  <TBody>
                    {shownPayments.map((p) => (
                      <TR key={p.id}>
                        <TD className="whitespace-nowrap tabular-nums">{fmt.date(p.paidOn)}</TD>
                        <TD>
                          <span className="font-medium text-ink">{p.studentName}</span>
                          {p.note && <span className="block text-[11px] text-ink-muted">{p.note}</span>}
                        </TD>
                        <TD><Badge tone={p.kind === "monthly" ? "neutral" : "info"}>{PAYMENT_KIND_LABEL[p.kind]}</Badge></TD>
                        <TD className="whitespace-nowrap">{coveredMonth(p) ? monthLabel(coveredMonth(p)!) : "—"}</TD>
                        <TD className="text-right font-medium tabular-nums text-ink">{fmt.rupiah(p.amount)}</TD>
                        <TD className="text-right tabular-nums text-ink-muted">{p.discount > 0 ? fmt.rupiah(p.discount) : "—"}</TD>
                        <TD><ProofChip url={p.proofUrl} viewLabel="Lihat bukti" missingLabel="Belum ada bukti" /></TD>
                        {actions && (
                          <TD>
                            <div className="flex justify-end gap-0.5">
                              {canInput && <EditRecordButton kind="payment" record={paymentRecord(p)} ctx={formCtx} />}
                              {canDelete && <DeleteRecordButton kind="payment" id={p.id} name={`${p.studentName} · ${PAYMENT_KIND_LABEL[p.kind]}`} />}
                            </div>
                          </TD>
                        )}
                      </TR>
                    ))}
                  </TBody>
                  <tfoot>
                    <tr className="border-t-2 border-ink bg-surface-2">
                      <td colSpan={4} className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-ink">
                        Total{kindFilter ? ` ${PAYMENT_KIND_LABEL[kindFilter].toLowerCase()}` : ""}
                      </td>
                      <td className="px-3 py-3 text-right text-sm font-bold tabular-nums text-ink">{fmt.rupiah(sum(shownPayments, (p) => p.amount))}</td>
                      <td className="px-3 py-3 text-right text-xs tabular-nums text-ink-muted">{fmt.rupiah(sum(shownPayments, (p) => p.discount))}</td>
                      <td colSpan={actions ? 2 : 1} />
                    </tr>
                  </tfoot>
                </Table>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
