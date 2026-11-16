import { NextResponse } from "next/server";
import { actionUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { scopeOf } from "@/lib/finance/access";
import { canTouchUnit } from "@/lib/finance/scope";
import { budgetLineTotal } from "@/lib/finance/calc";
import { actualTemplate, budgetTemplate } from "@/lib/finance/excel/rab-templates";
import { UploadRuleError, loadLigaUnit, readExisting } from "@/lib/finance/rab-actual-import";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * GET ?unitId=…&kind=budget|actual — the Excel template "Import Excel" accepts, made for this unit. The RAB Actual
 * template lists the unit's current RAB lines (sheet "Daftar RAB"), so the cost names can be copied exactly.
 */
export async function GET(req: Request) {
  const t = await getT();
  let user;
  try {
    user = await actionUser("input");
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : t("Akses ditolak") }, { status: 403 });
  }
  const url = new URL(req.url);
  const unitId = url.searchParams.get("unitId") ?? "";
  const kind = url.searchParams.get("kind") === "budget" ? "budget" : "actual";
  if (!canTouchUnit(scopeOf(user), unitId)) return NextResponse.json({ error: t("Unit bisnis tidak ditemukan.") }, { status: 404 });

  try {
    const unit = await loadLigaUnit(t, unitId, kind);
    let bytes: Buffer;
    if (kind === "budget") {
      bytes = budgetTemplate(unit);
    } else {
      const { existingBudget, existingExtras } = await readExisting(unit.id);
      const order = { weekly: 0, monthly: 1 } as const;
      const lines = [
        ...[...existingBudget]
          .sort((a, b) => order[a.period] - order[b.period] || a.categoryOrder - b.categoryOrder || a.itemOrder - b.itemOrder)
          .map((l) => ({ period: l.period, category: l.category, name: l.name, budget: budgetLineTotal(l), isAsset: l.isAsset, inRab: true })),
        ...existingExtras.map((e) => ({ period: e.period, category: e.category, name: e.name, budget: 0, isAsset: false, inRab: false })),
      ];
      bytes = actualTemplate(unit, lines);
    }
    const fileName = `Template ${kind === "budget" ? "RAB Budget" : "RAB Actual"} - ${unit.name}.xlsx`;
    const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": XLSX,
        "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof UploadRuleError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error("RAB template failed", e);
    return NextResponse.json({ error: t("Gagal membuat template.") }, { status: 500 });
  }
}
