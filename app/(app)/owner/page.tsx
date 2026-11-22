import type { Metadata } from "next";
import { Building2, Percent, Users, Wallet } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { listGlobalOwners } from "@/lib/finance/global-owners";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BlockTitle } from "@/components/finance/bits";
import { GuideCard } from "@/components/finance/guide-card";
import { Kpi } from "@/components/finance/kpi";
import { getI18n } from "@/lib/i18n/server";
import { AddOwnerForm } from "./owner-form";
import { OwnerActionButtons } from "./owner-dialogs";

export const metadata: Metadata = { title: "Data Owner" };
export const dynamic = "force-dynamic";

export default async function GlobalOwnersPage() {
  await requireCapability("all-units");
  const { fmt } = await getI18n();
  const owners = await listGlobalOwners();

  const totalOwners = owners.length;
  const activeSharesCount = owners.filter((o) => o.maxShareBp > 0).length;
  const totalWithTaken = owners.filter((o) => o.totalTaken > 0).length;

  return (
    <div>
      <PageHeader
        title="Data Owner"
        description="Master data pemilik bisnis. Setiap owner otomatis dimasukkan ke menu Dividen semua unit bisnis (dengan alokasi awal 0% dan penanda Ringkasan Owner) serta menjadi pilihan di halaman Nabung."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi
          label="Total Owner"
          value={fmt.number(totalOwners)}
          icon={<Users className="size-4" />}
          block="red"
          hint="Pemilik terdaftar di sistem"
        />
        <Kpi
          label="Punya Alokasi Dividen"
          value={fmt.number(activeSharesCount)}
          icon={<Percent className="size-4" />}
          block="white"
          hint="Memiliki persentase > 0% di unit"
        />
        <Kpi
          label="Pernah Mencairkan"
          value={fmt.number(totalWithTaken)}
          icon={<Wallet className="size-4" />}
          block="yellow"
          hint="Pernah mengambil dividen"
        />
      </div>

      <div className="mt-4">
        <GuideCard
          id="data-owner-guide"
          title="Cara kerja Data Owner"
          intro="Halaman ini mengelola master data pemilik secara terpusat agar tidak perlu memasukkan nama pemilik secara berulang pada setiap unit bisnis atau halaman tabungan."
          terms={[
            {
              term: "Otomatis ke Unit Bisnis",
              text: "Ketika owner ditambahkan, namanya langsung dimasukkan ke menu Dividen setiap unit bisnis dengan bagian 0% agar tidak mengganggu persentase 100% yang sudah ada. Owner dapat mengatur persentase pembagian di menu Dividen unit terkait (tombol Ubah pembagian).",
            },
            {
              term: "Tampil di Ringkasan Owner",
              text: "Seluruh owner yang ditambahkan otomatis memiliki penanda Ringkasan Owner (in_overview), sehingga dividen yang dicairkannya langsung masuk dalam akumulasi target 3 Miliar.",
            },
            {
              term: "Tersedia di Halaman Nabung",
              text: "Nama owner otomatis muncul sebagai pilihan pencarian/autocomplete saat menginput transaksi uang masuk atau uang keluar di halaman Nabung.",
            },
            {
              term: "Ubah & Hapus",
              text: "Ubah nama akan memperbarui nama di semua unit bisnis dan catatan tabungan. Penghapusan dijaga sistem keamanan: ditolak jika owner sudah memiliki riwayat pencairan dividen, alokasi persentase aktif, atau catatan di halaman Nabung.",
            },
          ]}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {/* ── Form Tambah Owner ─────────────────────────────── */}
        <Card>
          <CardContent className="space-y-4">
            <BlockTitle title="Tambah Owner Baru" hint="Nama lengkap pemilik modal / penerima dividen." />
            <AddOwnerForm />
          </CardContent>
        </Card>

        {/* ── Tabel Data Owner ─────────────────────────────── */}
        <Card>
          <CardContent className="space-y-4">
            <BlockTitle
              title="Daftar Master Owner"
              hint={`${fmt.number(owners.length)} pemilik terdaftar di sistem.`}
            />

            {owners.length === 0 ? (
              <p className="border border-dashed border-ink/40 px-4 py-8 text-center text-xs text-ink-muted">
                Belum ada owner yang terdaftar. Tambahkan owner pertama melalui formulir di samping.
              </p>
            ) : (
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH className="w-12">No</TH>
                    <TH>Nama Pemilik</TH>
                    <TH className="text-right">Unit Terhubung</TH>
                    <TH className="text-right">Dividen Diambil</TH>
                    <TH className="text-right w-24">Aksi</TH>
                  </TR>
                </THead>
                <TBody>
                  {owners.map((owner, idx) => (
                    <TR key={owner.id}>
                      <TD className="tabular-nums text-ink-muted">{idx + 1}</TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ink">{owner.name}</span>
                          {owner.maxShareBp > 0 && (
                            <Badge tone="info" className="text-[10px] py-0 px-1 font-semibold">
                              {(owner.maxShareBp / 100).toFixed(2).replace(/\.00$/, "")}%
                            </Badge>
                          )}
                        </div>
                      </TD>
                      <TD className="text-right tabular-nums text-ink">
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="size-3 text-ink-muted" />
                          {fmt.number(owner.unitsCount)} unit
                        </span>
                      </TD>
                      <TD className="text-right tabular-nums font-medium text-ink">
                        {fmt.rupiah(owner.totalTaken)}
                      </TD>
                      <TD className="text-right">
                        <OwnerActionButtons owner={owner} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
