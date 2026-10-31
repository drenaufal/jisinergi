import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Building2, Mail } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { listVisibleUnits } from "@/lib/finance/access";
import { listUnitLogins, listUnitOwners } from "@/lib/finance/units";
import { bpToField } from "@/lib/finance/ownership";
import { UNIT_MENUS, UNIT_TYPE_LABEL, menuHref } from "@/lib/finance/unit-types";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { getI18n } from "@/lib/i18n/server";
import { LoginCreate, LoginEdit, UnitCreate, UnitEdit } from "./unit-manage";

export const metadata: Metadata = { title: "Kelola Unit Bisnis" };
export const dynamic = "force-dynamic";

const STEPS = [
  { n: "1", title: "Buat unit bisnis", text: "Pilih jenis: Liga atau Sekolah Bola, lalu isi pemilik dan persentase dividennya." },
  { n: "2", title: "Buat akun Admin Unit", text: "Akun ini hanya bisa melihat dan mengisi unitnya sendiri." },
  { n: "3", title: "Isi data lewat menu unit", text: "Liga: menu keuangan dan RAB Actual. Sekolah Bola: Pemasukan, Pengeluaran, Aset, Modal, Dividen." },
];

export default async function BusinessUnitsPage() {
  const { fmt } = await getI18n();
  const user = await requireCapability("units:manage");
  const [units, logins, owners] = await Promise.all([listVisibleUnits(user), listUnitLogins(), listUnitOwners()]);

  return (
    <div>
      <PageHeader
        title="Kelola Unit Bisnis"
        description="Buat unit bisnis, lalu buat akun Admin Unit untuk mengisi datanya."
        actions={<UnitCreate />}
      />

      <ol className="mb-6 grid gap-px border border-ink bg-ink sm:grid-cols-3">
        {STEPS.map((s) => (
          <li key={s.n} className="flex gap-3 bg-white p-4">
            <span className="grid size-7 shrink-0 place-items-center bg-black text-xs font-bold text-white">{s.n}</span>
            <span>
              <span className="block text-sm font-semibold text-ink">{s.title}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>

      {units.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Belum ada unit bisnis"
          description="Klik “Tambah unit bisnis” untuk membuat unit pertama — Liga atau Sekolah Bola."
        />
      ) : (
        <div className="space-y-4">
          {units.map((unit) => {
            const mine = logins.filter((l) => l.unitId === unit.id);
            const unitOwners = owners.filter((o) => o.unitId === unit.id);
            const menus = UNIT_MENUS[unit.type];
            return (
              <Card key={unit.id}>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold tracking-tight text-ink">{unit.name}</h2>
                        <Badge tone="brand">{UNIT_TYPE_LABEL[unit.type]}</Badge>
                        <Badge tone="neutral">{unit.code}</Badge>
                        {!unit.active && <Badge tone="warn">Nonaktif</Badge>}
                      </div>
                      <p className="mt-1 text-xs text-ink-muted">
                        {unit.type === "liga" ? `${unit.programWeeks} minggu program · ` : ""}
                        Menu: {menus.map((m) => m.label).join(", ")}
                        {unit.description ? ` · ${unit.description}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-ink-muted">
                        <span className="font-semibold text-ink">Kepemilikan:</span>{" "}
                        {unitOwners.length ? unitOwners.map((o) => `${o.name} ${bpToField(o.shareBp)}%`).join(" · ") : "belum diatur — isi di menu Dividen unit ini"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={menuHref(unit.code)} className="flex items-center gap-1 text-xs font-semibold text-ink underline underline-offset-2">
                        Buka unit <ArrowUpRight className="size-3" />
                      </Link>
                      <UnitEdit unit={unit} />
                      <LoginCreate unitId={unit.id} unitName={unit.name} />
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Akun Admin Unit · {fmt.number(mine.length)}</p>
                    {mine.length === 0 ? (
                      <p className="border border-dashed border-ink/40 px-4 py-3 text-xs text-ink-muted">
                        Belum ada akun. Tanpa akun, unit ini hanya bisa diisi oleh Owner.
                      </p>
                    ) : (
                      <ul className="divide-y divide-line border border-line">
                        {mine.filter((l) => l.unitId === unit.id).map((login) => (
                          <li key={login.userId} className="flex items-center gap-3 px-4 py-2.5">
                            <span className="grid size-8 shrink-0 place-items-center border border-line text-ink-muted">
                              <Mail className="size-3.5" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-ink">{login.name}</p>
                              <p className="truncate text-xs text-ink-muted">{login.email}</p>
                            </div>
                            <Badge tone={login.active ? "success" : "warn"}>{login.active ? "Aktif" : "Nonaktif"}</Badge>
                            <LoginEdit login={{ userId: login.userId, name: login.name, email: login.email, active: login.active }} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
