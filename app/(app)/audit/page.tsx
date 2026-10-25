import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { ROLE_LABEL, isRole } from "@/lib/auth/rbac";
import { getAuditLog, type AuditParams } from "@/lib/queries/settings";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { SearchBox, FilterSelect, Pagination } from "@/components/app/list-controls";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Jejak Audit" };
export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: { searchParams: Promise<AuditParams> }) {
  const { fmt } = await getI18n();
  await requireCapability("audit:view");
  const params = await searchParams;
  const { rows, total, page, size, actions } = await getAuditLog(params);

  return (
    <div>
      <PageHeader
        title="Jejak Audit"
        description="Setiap penambahan, perubahan, dan penghapusan data tercatat lengkap dengan pelaku dan waktunya."
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <SearchBox placeholder="Cari aktivitas…" />
          <FilterSelect param="action" placeholder="Semua aksi" options={actions.map((a) => ({ value: a, label: a }))} />
        </div>
        {rows.length === 0 ? (
          <EmptyState className="m-4" icon={ScrollText} title="Belum ada aktivitas" description="Aktivitas muncul di sini begitu ada data yang ditambah atau diubah." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-ink bg-surface-2 text-left text-[10.5px] uppercase tracking-wider text-ink">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Waktu</th>
                  <th className="px-2 py-2.5 font-semibold">Pelaku</th>
                  <th className="px-2 py-2.5 font-semibold">Aksi</th>
                  <th className="px-4 py-2.5 font-semibold">Ringkasan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-2">
                    <td className="whitespace-nowrap px-4 py-2.5 text-[11px] text-ink-muted">{fmt.dateTime(r.createdAt)}</td>
                    <td className="px-2 py-2.5">
                      <span className="text-xs text-ink">{r.actorName ?? "Sistem"}</span>
                      {r.actorRole && <span className="block text-[10px] text-ink-muted">{isRole(r.actorRole) ? ROLE_LABEL[r.actorRole] : r.actorRole}</span>}
                    </td>
                    <td className="px-2 py-2.5">
                      <code className="border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-secondary">{r.action}</code>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-ink-secondary">{r.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-3">
          <Pagination page={page} pageSize={size} total={total} />
        </div>
      </Card>
      <p className="mt-2 text-[11px] text-ink-muted">
        <Badge>Hanya baca</Badge> Entri audit tidak dapat diubah atau dihapus melalui antarmuka.
      </p>
    </div>
  );
}
