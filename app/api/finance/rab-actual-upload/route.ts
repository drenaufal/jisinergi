import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { actionUser } from "@/lib/auth/session";
import { auditText, recordAudit } from "@/lib/audit";
import { getT } from "@/lib/i18n/server";
import { scopeOf } from "@/lib/finance/access";
import { canTouchUnit } from "@/lib/finance/scope";
import {
  MAX_WORKBOOK_BYTES,
  UploadRuleError,
  importRabActualUpload,
  importRabBudgetUpload,
  previewRabActualUpload,
  previewRabBudgetUpload,
} from "@/lib/finance/rab-actual-import";

/**
 * Upload of an Excel file (.xlsx) to a Liga unit.
 *   target=actual (default)  RAB Actual: the template, or the old "file RAB Actual.xlsx" workbook
 *   target=budget            RAB Budget: the template
 *   mode=preview  reads the file and says what loading it would do (nothing is written)
 *   mode=import   loads it, after the same checks
 * Whoever may input data into the unit may use it; a unit login only reaches its own unit.
 */
export async function POST(req: Request) {
  const t = await getT();
  let user;
  try {
    user = await actionUser("input");
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : t("Akses ditolak") }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: t("Format unggahan tidak valid.") }, { status: 400 });
  }

  const unitId = String(form.get("unitId") ?? "");
  if (!canTouchUnit(scopeOf(user), unitId)) return NextResponse.json({ error: t("Unit bisnis tidak ditemukan.") }, { status: 404 });
  const target = form.get("target") === "budget" ? "budget" : "actual";

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: t("Berkas tidak ditemukan.") }, { status: 400 });
  if (!/\.xlsx$/i.test(file.name)) return NextResponse.json({ error: t("Format harus Excel (.xlsx).") }, { status: 415 });
  if (file.size > MAX_WORKBOOK_BYTES) {
    return NextResponse.json({ error: t("Ukuran maksimal {size} MB.", { size: MAX_WORKBOOK_BYTES / 1024 / 1024 }) }, { status: 413 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  // an .xlsx is a zip file: "PK"
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return NextResponse.json({ error: t("Isi berkas tidak sesuai formatnya.") }, { status: 415 });

  const startsOn = String(form.get("startsOn") ?? "").trim() || null;
  const base = { unitId, fileName: file.name.slice(0, 200), bytes };
  const imports = form.get("mode") === "import";

  try {
    if (target === "budget") {
      if (!imports) return NextResponse.json({ preview: (await previewRabBudgetUpload(t, base)).preview });
      const { unit, plan, preview, newTotal } = await importRabBudgetUpload(t, { ...base, actorId: user.id });
      await recordAudit({
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        action: "finance.budget.upload",
        entityType: "business_unit",
        entityId: unit.id,
        summary: auditText("RAB Budget diunggah dari Excel ({file}): {lines} baris RAB baru (Rp {amount}), {skipped} dilewati — {unit}", {
          file: base.fileName,
          lines: plan.summary.lines.created,
          amount: newTotal.toLocaleString("id-ID"),
          skipped: plan.summary.lines.existing,
          unit: unit.name,
        }),
      });
      revalidatePath("/", "layout");
      return NextResponse.json({ preview, imported: plan.summary });
    }

    if (!imports) return NextResponse.json({ preview: (await previewRabActualUpload(t, { ...base, startsOn })).preview });
    const { unit, plan, preview } = await importRabActualUpload(t, { ...base, startsOn, actorId: user.id });
    await recordAudit({
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: "finance.rabactual.upload",
      entityType: "business_unit",
      entityId: unit.id,
      summary: auditText("RAB Actual diunggah dari Excel ({file}): {lines} baris RAB baru, {extras} baris di luar RAB, {costs} biaya actual (Rp {amount}) — {unit}", {
        file: base.fileName,
        lines: plan.summary.lines.created,
        extras: plan.summary.extras.created,
        costs: plan.summary.costs.imported,
        amount: plan.summary.costs.importedAmount.toLocaleString("id-ID"),
        unit: unit.name,
      }),
    });
    revalidatePath("/", "layout");
    return NextResponse.json({ preview, imported: plan.summary });
  } catch (e) {
    if (e instanceof UploadRuleError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error(`RAB ${target} upload failed`, e);
    return NextResponse.json({ error: t("Gagal memproses berkas.") }, { status: 500 });
  }
}
