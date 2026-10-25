import { Badge } from "@/components/ui/badge";
import { loadUnitPage } from "@/lib/finance/access";
import { UNIT_MENUS, UNIT_TYPE_LABEL, menuHref } from "@/lib/finance/unit-types";
import { UnitTabs } from "./unit-tabs";

/** Guards every page of a unit (unknown unit → 404, someone else's unit → sent home) and shows the unit's menus. */
export default async function UnitLayout({ children, params }: { children: React.ReactNode; params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { unit } = await loadUnitPage(code);
  const tabs = [
    { href: menuHref(unit.code), label: "Ringkasan" },
    ...UNIT_MENUS[unit.type].map((m) => ({ href: menuHref(unit.code, m.slug), label: m.label })),
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone="brand">{UNIT_TYPE_LABEL[unit.type]}</Badge>
        <span className="text-[11px] uppercase tracking-[0.14em] text-ink-muted">{unit.code}</span>
        {!unit.active && <Badge tone="warn">Nonaktif — tidak menerima data baru</Badge>}
      </div>
      <UnitTabs tabs={tabs} />
      {children}
    </div>
  );
}
