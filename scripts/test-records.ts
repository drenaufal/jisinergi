import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

/**
 * Integration check of the rules that live in the database layer (lib/finance/records.ts, units.ts):
 * the RAB is final, asset lines and asset expenses fill the Aset menu, real costs need a line of the same
 * unit, a registration covers its month, owners' shares. It creates two throw-away units (code prefix
 * ZZTEST), runs the checks against the database DATABASE_URL points at, and deletes everything it made
 * (rows, receipts, audit entries) at the end, also when a check fails.
 *
 *   npm run test:records
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const target = new URL(url);
  console.log(`Database: ${target.hostname}:${target.port || "3306"}${target.pathname}`);

  const { and, eq, isNotNull, like, or } = await import("drizzle-orm");
  const { db } = await import("@/lib/db");
  const s = await import("@/lib/db/schema");
  const { createT } = await import("@/lib/i18n/translate");
  const { FinanceRuleError, deleteFinanceRecord, saveFinanceRecord } = await import("@/lib/finance/records");
  const { createUnit, replaceUnitOwners, UnitRuleError } = await import("@/lib/finance/units");
  const { removeUnit } = await import("@/lib/finance/remove");
  const { getAllUnitFigures, listActualCosts, listOwners, listStudentPayments } = await import("@/lib/finance/queries");
  const { makeNewUnitSchema } = await import("@/lib/finance/unit-schemas");
  const { scopeOf } = await import("@/lib/finance/scope");

  const t = createT("id");
  let failures = 0;
  const ok = (cond: unknown, label: string) => {
    if (!cond) failures++;
    console.log(`${cond ? "✓" : "✗"} ${label}`);
  };
  const eq2 = (actual: unknown, expected: unknown, label: string) => {
    const same = JSON.stringify(actual) === JSON.stringify(expected);
    if (!same) console.log(`   expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    ok(same, label);
  };
  const rejects = async (promise: Promise<unknown>, label: string, match?: RegExp) => {
    try {
      await promise;
      ok(false, `${label} (was accepted)`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const fields = e instanceof FinanceRuleError ? Object.values(e.fieldErrors).join(" ") : "";
      ok(e instanceof FinanceRuleError && (!match || match.test(`${message} ${fields}`)), `${label} → “${(fields || message).slice(0, 80)}”`);
    }
  };

  const [ownerUser] = await db.select({ id: s.users.id, name: s.users.name }).from(s.users).where(eq(s.users.role, "owner")).limit(1);
  if (!ownerUser) throw new Error("There is no owner account in this database; run npm run db:seed:owner first.");
  const actor = { id: ownerUser.id, name: ownerUser.name, role: "owner" };
  const owner = scopeOf({ role: "owner", unitId: null });

  const stamp = Date.now().toString(36).toUpperCase();
  const codes = { liga: `ZZTEST-L-${stamp}`, school: `ZZTEST-S-${stamp}`, other: `ZZTEST-O-${stamp}` };
  const owners = [{ name: "Pemilik A", percent: "60", capital: "10.000.000" }, { name: "Pemilik B", percent: "40", capital: "" }];
  const parse = (code: string, type: string) => {
    const parsed = makeNewUnitSchema(t).safeParse({ code, name: `Uji ${code}`, type, description: "", programWeeks: "10", programStartsOn: "2026-10-05", owners });
    if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
    return parsed.data;
  };

  try {
    /* ── units, owners and the school's opening modal ── */
    const liga = await createUnit(t, parse(codes.liga, "liga"), actor.id);
    const school = await createUnit(t, parse(codes.school, "sekolah_bola"), actor.id);
    const other = await createUnit(t, parse(codes.other, "liga"), actor.id);
    eq2((await listOwners(liga.id)).map((o) => [o.name, o.shareBp, o.position]), [["Pemilik A", 6000, 1], ["Pemilik B", 4000, 2]], "unit: owners are saved with their shares, in order");
    const schoolCapital = await db.select().from(s.finCapital).where(eq(s.finCapital.businessUnitId, school.id));
    eq2(schoolCapital.map((c) => [c.ownerName, c.amount, c.status]), [["Pemilik A", 10000000, "outstanding"]], "Sekolah Bola: the modal an owner enters at creation becomes a Modal row");
    eq2((await db.select().from(s.finCapital).where(eq(s.finCapital.businessUnitId, liga.id))).length, 0, "Liga: no modal is created from the owner rows");
    const [ligaRow] = await db.select().from(s.businessUnits).where(eq(s.businessUnits.id, liga.id));
    eq2(ligaRow.programStartsOn, "2026-10-05", "Liga: the program start day is saved");
    const [schoolRow] = await db.select().from(s.businessUnits).where(eq(s.businessUnits.id, school.id));
    eq2(schoolRow.programStartsOn, null, "Sekolah Bola: no program start day");
    try {
      await createUnit(t, parse(codes.liga, "liga"), actor.id);
      ok(false, "unit: a taken code is refused");
    } catch (e) {
      ok(e instanceof UnitRuleError, "unit: a taken code is refused");
    }
    const swapped = await replaceUnitOwners(t, liga.id, [{ name: "Pemilik A", shareBp: 5000, inOverview: false }, { name: "Pemilik C", shareBp: 5000, inOverview: false }]);
    eq2(swapped.before.map((o) => o.shareBp), [6000, 4000], "owners: the old shares are reported");
    eq2((await listOwners(liga.id)).map((o) => [o.name, o.shareBp]), [["Pemilik A", 5000], ["Pemilik C", 5000]], "owners: the Dividen page rewrites the shares");

    const save = (unit: { id: string }, kind: Parameters<typeof saveFinanceRecord>[0]["kind"], values: Record<string, unknown>, id: string | null = null, scope = owner) =>
      saveFinanceRecord({ t, actor, scope, kind, id, requestedUnitId: unit.id, values });
    const schemas = await import("@/lib/finance/entities");
    const parseKind = (kind: keyof typeof schemas.ENTITIES, raw: Record<string, string>) => {
      const parsed = schemas.ENTITIES[kind].schema(t).safeParse(raw);
      if (!parsed.success) throw new Error(`${kind}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
      return parsed.data;
    };

    /* ── RAB: asset lines only fill ASET once something is bought (RAB Actual), saved lines are final ── */
    const rab = (raw: Record<string, string>) => parseKind("budget", { quantity: "1", note: "", ...raw });
    const dispenser = await save(liga, "budget", rab({ period: "monthly", category: "Peralatan", name: "Dispenser", unitPrice: "1000000", assetType: "asset" }));
    const weeklyAsset = await save(liga, "budget", rab({ period: "weekly", category: "Peralatan", name: "Sewa genset", quantity: "2", unitPrice: "150000", assetType: "asset" }));
    const lakban = await save(liga, "budget", rab({ period: "monthly", category: "Peralatan", name: "Lakban", unitPrice: "50000", assetType: "non_asset" }));
    const budgetRows = await db.select().from(s.finBudgetItems).where(eq(s.finBudgetItems.businessUnitId, liga.id));
    const byName = (name: string) => budgetRows.find((b) => b.name === name)!;
    eq2(budgetRows.map((b) => [b.name, b.isAsset]).sort(), [["Dispenser", true], ["Lakban", false], ["Sewa genset", true]], "RAB: the Aset / Non aset choice is stored per line");
    const ligaAssets = await db.select().from(s.finAssets).where(eq(s.finAssets.businessUnitId, liga.id));
    eq2(ligaAssets.length, 0, "RAB: an asset line makes no asset by itself — only a purchase (RAB Actual cost) does");
    ok(dispenser.created && weeklyAsset.created && lakban.created, "RAB: three lines saved");
    await rejects(save(liga, "budget", rab({ period: "monthly", category: "Peralatan", name: "Dispenser", unitPrice: "2000000" }), byName("Dispenser").id), "RAB: a saved line cannot be edited", /tidak dapat diubah/);
    const manual = await save(liga, "asset", parseKind("asset", { purchasedOn: "2026-10-05", name: "Bola", amount: "400000", proofUrl: "", note: "" }));
    ok(manual.created, "ASET: a hand-typed asset still works");
    const manualRow = (await db.select().from(s.finAssets).where(and(eq(s.finAssets.businessUnitId, liga.id), eq(s.finAssets.name, "Bola"))))[0];
    await save(liga, "asset", parseKind("asset", { purchasedOn: "2026-10-06", name: "Bola futsal", amount: "450000", proofUrl: "", note: "" }), manualRow.id);
    eq2((await db.select().from(s.finAssets).where(eq(s.finAssets.id, manualRow.id)))[0].name, "Bola futsal", "ASET: a hand-typed asset can be edited");

    /* ── RAB Actual ── */
    const item = await save(liga, "actualitem", parseKind("actualitem", { category: "Peralatan", name: "Sewa HT", note: "" }));
    ok(item.created, "RAB Actual: an extra cost line is added");
    await rejects(save(liga, "actualitem", parseKind("actualitem", { category: "peralatan", name: "SEWA HT", note: "" })), "RAB Actual: the same extra line twice is refused", /sudah ada/);
    await rejects(save(liga, "actualitem", parseKind("actualitem", { category: "Peralatan", name: "dispenser", note: "" })), "RAB Actual: a name that is already in the RAB is refused", /sudah ada di RAB/);
    const extra = (await db.select().from(s.finActualItems).where(eq(s.finActualItems.businessUnitId, liga.id)))[0];
    const cost = (ref: string, amount: string, spentOn: string) => parseKind("actualcost", { itemRef: ref, amount, spentOn, proofUrl: "", note: "" });
    await save(liga, "actualcost", cost(`b:${byName("Dispenser").id}`, "1.050.000", "2026-10-06"));
    await save(liga, "actualcost", cost(`b:${byName("Dispenser").id}`, "50.000", "2026-10-13"));
    await save(liga, "actualcost", cost(`a:${extra.id}`, "100.000", "2026-10-13"));
    await save(liga, "actualcost", cost(`b:${byName("Lakban").id}`, "20.000", "2026-10-14"));
    const costs = (await listActualCosts(liga.id)).filter((c) => c.amount !== 20000);
    const lakbanCost = (await listActualCosts(liga.id)).find((c) => c.amount === 20000)!;
    const costAssets = () => db.select().from(s.finAssets).where(and(eq(s.finAssets.businessUnitId, liga.id), isNotNull(s.finAssets.actualCostId)));
    eq2((await costAssets()).map((a) => [a.name, a.amount, a.purchasedOn]).sort(), [["Dispenser", 1050000, "2026-10-06"], ["Dispenser", 50000, "2026-10-13"]], "RAB Actual: a cost on an asset line becomes an asset (what was paid, on the day it was paid); costs on other lines do not");
    await deleteFinanceRecord({ t, actor, scope: owner, kind: "actualcost", id: lakbanCost.id });
    const linked = (await costAssets()).find((a) => a.amount === 1050000)!;
    ok(linked.actualCostId === costs[0].id, "ASET: the asset points at the cost it came from");
    await rejects(save(liga, "asset", parseKind("asset", { purchasedOn: "2026-10-05", name: "Dispenser", amount: "5", proofUrl: "", note: "" }), linked.id), "ASET: an asset made from RAB Actual cannot be edited", /otomatis/);
    await rejects(deleteFinanceRecord({ t, actor, scope: owner, kind: "asset", id: linked.id }), "ASET: an asset made from RAB Actual cannot be deleted on its own", /otomatis/);
    eq2(costs.map((c) => [c.amount, c.budgetItemId === byName("Dispenser").id ? "RAB" : "extra", c.spentOn]), [[1050000, "RAB", "2026-10-06"], [50000, "RAB", "2026-10-13"], [100000, "extra", "2026-10-13"]], "RAB Actual: costs are saved on a RAB line or an extra line, oldest first");
    await rejects(save(liga, "actualcost", cost(`b:${crypto.randomUUID()}`, "1", "2026-10-06")), "RAB Actual: a cost for a line that does not exist is refused", /tidak ditemukan/);
    const otherItem = await save(other, "budget", rab({ period: "monthly", category: "X", name: "Barang unit lain", unitPrice: "10", assetType: "non_asset" }));
    const [otherLine] = await db.select().from(s.finBudgetItems).where(eq(s.finBudgetItems.businessUnitId, other.id));
    ok(otherItem.created, "RAB Actual: another unit has its own RAB");
    await rejects(save(liga, "actualcost", cost(`b:${otherLine.id}`, "1", "2026-10-06")), "RAB Actual: a cost cannot point at another unit's RAB line", /tidak ditemukan/);
    await rejects(deleteFinanceRecord({ t, actor, scope: owner, kind: "budget", id: byName("Dispenser").id }), "RAB: a line that has real costs cannot be deleted", /biaya actual/);
    await rejects(deleteFinanceRecord({ t, actor, scope: owner, kind: "actualitem", id: extra.id }), "RAB Actual: an extra line that has costs cannot be deleted", /biaya actual/);
    ok((await db.select().from(s.finBudgetItems).where(eq(s.finBudgetItems.id, byName("Dispenser").id))).length === 1, "RAB: the refused delete left the line in place");
    const first = costs[0];
    await save(liga, "actualcost", { ...cost(`b:${byName("Dispenser").id}`, "1.100.000", "2026-10-07") }, first.id);
    eq2((await listActualCosts(liga.id))[0].amount, 1100000, "RAB Actual: a cost can be corrected");
    eq2((await costAssets()).map((a) => [a.amount, a.purchasedOn]).sort(), [[1100000, "2026-10-07"], [50000, "2026-10-13"]], "RAB Actual: correcting a cost corrects its asset");
    await deleteFinanceRecord({ t, actor, scope: owner, kind: "actualcost", id: first.id });
    eq2((await listActualCosts(liga.id)).length, 2, "RAB Actual: a cost can be deleted");
    eq2((await costAssets()).map((a) => a.amount), [50000], "RAB Actual: deleting a cost deletes its asset");
    await deleteFinanceRecord({ t, actor, scope: owner, kind: "budget", id: byName("Lakban").id });
    ok((await db.select().from(s.finBudgetItems).where(eq(s.finBudgetItems.id, byName("Lakban").id))).length === 0, "RAB: a line without costs can be deleted");
    await deleteFinanceRecord({ t, actor, scope: owner, kind: "budget", id: byName("Sewa genset").id });
    ok((await db.select().from(s.finBudgetItems).where(eq(s.finBudgetItems.id, byName("Sewa genset").id))).length === 0, "RAB: an asset line without costs can be deleted");
    await rejects(save(school, "actualcost", cost(`b:${byName("Dispenser").id}`, "1", "2026-10-06")), "RAB Actual: a Sekolah Bola has no RAB Actual", /tidak tersedia/);
    await rejects(save(school, "budget", rab({ period: "monthly", category: "X", name: "Y", unitPrice: "1", assetType: "non_asset" })), "RAB: a Sekolah Bola has no RAB", /tidak tersedia/);

    /* ── Sekolah Bola: asset expenses ── */
    const expense = (raw: Record<string, string>) => parseKind("expense", { spentOn: "2026-10-10", category: "Perlengkapan", name: "Bola latihan", amount: "750000", proofUrl: "", note: "", ...raw });
    await save(school, "expense", expense({ assetType: "asset" }));
    await save(school, "expense", expense({ name: "Sewa lapangan", category: "Sewa", amount: "600000", assetType: "non_asset" }));
    const schoolExpenses = await db.select().from(s.finExpenses).where(eq(s.finExpenses.businessUnitId, school.id));
    const ball = schoolExpenses.find((e) => e.name === "Bola latihan")!;
    const schoolAssets = () => db.select().from(s.finAssets).where(eq(s.finAssets.businessUnitId, school.id));
    eq2((await schoolAssets()).map((a) => [a.name, a.amount, a.purchasedOn, a.expenseId === ball.id]), [["Bola latihan", 750000, "2026-10-10", true]], "Pengeluaran: only the asset expense becomes an asset (same name, amount and date)");
    await save(school, "expense", expense({ assetType: "asset", amount: "800000", name: "Bola latihan (6)", spentOn: "2026-10-11" }), ball.id);
    eq2((await schoolAssets()).map((a) => [a.name, a.amount, a.purchasedOn]), [["Bola latihan (6)", 800000, "2026-10-11"]], "Pengeluaran: editing the expense updates its asset");
    await save(school, "expense", expense({ assetType: "non_asset" }), ball.id);
    eq2((await schoolAssets()).length, 0, "Pengeluaran: switching to Non aset removes the asset");
    await save(school, "expense", expense({ assetType: "asset" }), ball.id);
    eq2((await schoolAssets()).length, 1, "Pengeluaran: switching back to Aset creates it again");
    const a = (await schoolAssets())[0];
    await rejects(save(school, "asset", parseKind("asset", { purchasedOn: "2026-10-05", name: "x", amount: "1", proofUrl: "", note: "" }), a.id), "ASET: an asset made from an expense cannot be edited there", /pengeluaran/);
    const handmade = await save(school, "asset", parseKind("asset", { purchasedOn: "2026-10-05", name: "Gawang kecil", amount: "300000", proofUrl: "", note: "" }));
    ok(handmade.created, "Sekolah Bola: an asset can also be typed in by hand");
    await save(school, "capital", parseKind("capital", { ownerName: "Pemilik B", amount: "5000000", status: "outstanding", investedOn: "", returnedOn: "", note: "" }));
    eq2((await db.select().from(s.finCapital).where(eq(s.finCapital.businessUnitId, school.id))).length, 2, "Sekolah Bola: it has a Modal menu");
    await deleteFinanceRecord({ t, actor, scope: owner, kind: "expense", id: ball.id });
    eq2((await schoolAssets()).map((x) => x.name), ["Gawang kecil"], "Pengeluaran: deleting the expense deletes its asset, not the hand-typed one");
    await save(school, "expense", expense({ name: "Gaji Fikri", category: "Gaji", amount: "1400000", attendanceDays: "8", dailyRate: "175000" }));
    await save(school, "expense", expense({ name: "Gaji Apen", category: "Gaji", amount: "1500000", attendanceDays: "", dailyRate: "" }));
    const salaries = (await db.select().from(s.finExpenses).where(and(eq(s.finExpenses.businessUnitId, school.id), eq(s.finExpenses.category, "Gaji")))).sort((x, y) => x.name.localeCompare(y.name));
    eq2(salaries.map((x) => [x.name, x.attendanceDays, x.dailyRate]), [["Gaji Apen", null, null], ["Gaji Fikri", 8, 175000]], "Pengeluaran: absen and gaji satuan are saved on a salary row and stay empty on a fixed one");

    /* ── Sekolah Bola: a registration covers its month ── */
    await save(school, "student", parseKind("student", { name: "Anak Uji", nickname: "", joinedOn: "2026-10-01", birthDate: "2015-04-12", jerseyNumber: "", nik: "GDJ001", birthPlace: "Jakarta", parentPhone: "0895403942345", jerseySize: "L", sizeType: "Size Anak", note: "" }));
    const [student] = await db.select().from(s.finStudents).where(eq(s.finStudents.businessUnitId, school.id));
    eq2(student.birthDate, "2015-04-12", "Siswa: the birth date is saved");
    eq2([student.nik, student.birthPlace, student.parentPhone, student.jerseySize, student.sizeType], ["GDJ001", "Jakarta", "0895403942345", "L", "Size Anak"], "Siswa: NIK, birth place, parent's phone (leading zero kept) and jersey size are saved");
    const pay = (raw: Record<string, string>) => parseKind("payment", { studentId: student.id, kind: "monthly", paidOn: "2026-10-05", amount: "200000", discount: "", period: "2026-10", proofUrl: "", note: "", ...raw });
    await save(school, "payment", pay({ kind: "monthly", period: "2026-09", paidOn: "2026-09-05" }));
    await rejects(save(school, "payment", pay({ kind: "registration", paidOn: "2026-09-20", amount: "500000", period: "" })), "Pembayaran: a registration cannot cover a month whose fee was paid separately", /Hapus iuran bulanannya/);
    await save(school, "payment", pay({ kind: "registration", paidOn: "2026-10-03", amount: "500000", period: "" }));
    const [reg] = (await listStudentPayments(school.id)).filter((p) => p.kind === "registration");
    eq2([reg.period, reg.amount], ["2026-10", 500000], "Pembayaran: a registration is stored with the month it covers");
    await rejects(save(school, "payment", pay({ kind: "monthly", period: "2026-10" })), "Pembayaran: the month a registration covers cannot be paid again as a monthly fee", /registrasi sudah termasuk/);
    await save(school, "payment", pay({ kind: "monthly", period: "2026-11", paidOn: "2026-11-05" }));
    await rejects(save(school, "payment", pay({ kind: "monthly", period: "2026-11", paidOn: "2026-11-06" })), "Pembayaran: a monthly fee twice for the same month is refused", /sudah tercatat/);
    await rejects(save(school, "payment", pay({ kind: "registration", paidOn: "2026-10-04", amount: "1", period: "" })), "Pembayaran: a second registration is refused", /sudah punya pembayaran registrasi/);
    await rejects(save(liga, "payment", pay({})), "Pembayaran: a Liga has no students", /tidak tersedia|tidak ditemukan/);
    ok(parseKind("payment", { studentId: student.id, kind: "monthly", paidOn: "2026-10-05", amount: "1", discount: "", period: "2026-10", proofUrl: "", note: "" }) !== undefined, "Pembayaran: parse sanity");
    // an old jersey row (from before jersey money was dropped) must not show up or count
    await db.insert(s.finStudentPayments).values({ id: crypto.randomUUID(), businessUnitId: school.id, studentId: student.id, kind: "jersey", paidOn: "2026-10-05", amount: 250000, discount: 0 });
    eq2((await listStudentPayments(school.id)).map((p) => p.kind).sort(), ["monthly", "monthly", "registration"], "Pemasukan: an old jersey row is left out of the list");

    /* ── Liga: age groups, other income, weekly / monthly extra lines, receipts ── */
    const regForm = (raw: Record<string, string>) => parseKind("registration", { clubName: "BSS Jakarta", ageGroup: "U8", fee: "1750000", dpAmount: "", dpPaidOn: "", dpProofUrl: "", finalAmount: "", finalPaidOn: "", finalProofUrl: "", note: "", ...raw });
    await save(liga, "registration", regForm({}));
    await save(liga, "registration", regForm({ ageGroup: "U9" }));
    eq2((await db.select().from(s.finRegistrations).where(eq(s.finRegistrations.businessUnitId, liga.id))).map((r) => r.ageGroup).sort(), ["U8", "U9"], "Registrasi: the same club can enter two age groups");
    await rejects(save(liga, "registration", regForm({})), "Registrasi: the same club twice in one age group is refused", /sudah terdaftar di kelompok U8/);
    await save(liga, "registration", regForm({ ageGroup: "" }));
    await rejects(save(liga, "registration", regForm({ ageGroup: "" })), "Registrasi: the same club twice with no age group is refused", /sudah punya data registrasi/);
    const mf = (raw: Record<string, string>) => parseKind("matchfee", { clubName: "BSS Jakarta", ageGroup: "U8", week: "1", matches: "2", feePerMatch: "500000", proofUrl: "", note: "", ...raw });
    await save(liga, "matchfee", mf({}));
    await save(liga, "matchfee", mf({ ageGroup: "U9" }));
    await rejects(save(liga, "matchfee", mf({})), "Match fee: the same club, group and week twice is refused", /minggu tersebut/);
    eq2((await db.select().from(s.finMatchFees).where(eq(s.finMatchFees.businessUnitId, liga.id))).length, 2, "Match fee: U8 and U9 are separate rows for the same club and week");

    const income = (raw: Record<string, string>) => parseKind("otherincome", { name: "Sewa stand es teh", week: "2", amount: "250000", proofUrl: "", note: "", ...raw });
    const standSaved = await save(liga, "otherincome", income({}));
    ok(standSaved.created, "Pemasukan lain: a row is saved per week");
    const [stand] = await db.select().from(s.finOtherIncome).where(eq(s.finOtherIncome.businessUnitId, liga.id));
    await save(liga, "otherincome", income({ amount: "300000" }), stand.id);
    eq2((await db.select().from(s.finOtherIncome).where(eq(s.finOtherIncome.id, stand.id)))[0].amount, 300000, "Pemasukan lain: a row can be corrected");
    await rejects(save(school, "otherincome", income({})), "Pemasukan lain: a Sekolah Bola has none", /tidak tersedia/);

    // an extra cost line is weekly or monthly; the RAB Actual page puts it in that part
    await save(liga, "actualitem", parseKind("actualitem", { period: "monthly", category: "Biaya Hadiah", name: "Piala tambahan", note: "" }));
    const monthlyExtra = (await db.select().from(s.finActualItems).where(eq(s.finActualItems.businessUnitId, liga.id))).find((i) => i.name === "Piala tambahan")!;
    eq2(monthlyExtra.period, "monthly", "RAB Actual: an extra line keeps its weekly / monthly choice");
    eq2((await db.select().from(s.finActualItems).where(eq(s.finActualItems.id, extra.id)))[0].period, "weekly", "RAB Actual: an extra line is weekly unless said otherwise");

    // receipts: a unit admin opens the receipts of their own unit's costs and other income, never another unit's
    const { canOpenFinanceProof } = await import("@/lib/finance/proof");
    const picture = async () => {
      const id = crypto.randomUUID();
      await db.insert(s.media).values({ id, kind: "document", fileName: "bukti.jpeg", mimeType: "image/jpeg", size: 3, data: "AAEC", uploadedBy: null });
      return id;
    };
    const costProof = await picture();
    const incomeProof = await picture();
    const loose = await picture();
    await db.update(s.finActualCosts).set({ proofUrl: `/api/media/${costProof}` }).where(eq(s.finActualCosts.businessUnitId, liga.id));
    await db.update(s.finOtherIncome).set({ proofUrl: `/api/media/${incomeProof}` }).where(eq(s.finOtherIncome.id, stand.id));
    const viewer = (unitId: string | null, role: "owner" | "unit_admin" = "unit_admin") => ({ id: crypto.randomUUID(), role, unitId });
    const file = (id: string) => ({ id, uploadedBy: null });
    ok(await canOpenFinanceProof(viewer(liga.id), file(costProof)), "Bukti: a unit admin opens a RAB Actual receipt of their unit");
    ok(await canOpenFinanceProof(viewer(liga.id), file(incomeProof)), "Bukti: a unit admin opens an other-income receipt of their unit");
    ok(!(await canOpenFinanceProof(viewer(other.id), file(costProof))), "Bukti: a unit admin cannot open another unit's RAB Actual receipt");
    ok(!(await canOpenFinanceProof(viewer(other.id), file(incomeProof))), "Bukti: a unit admin cannot open another unit's other-income receipt");
    ok(await canOpenFinanceProof(viewer(null, "owner"), file(costProof)) && await canOpenFinanceProof(viewer(null, "owner"), file(incomeProof)), "Bukti: the owner opens any unit's receipts");
    ok(!(await canOpenFinanceProof(viewer(liga.id), file(loose))), "Bukti: a receipt attached to nothing is closed to everyone else");
    await db.delete(s.media).where(or(eq(s.media.id, costProof), eq(s.media.id, incomeProof), eq(s.media.id, loose)));

    /* ── Dashboard figures and who may touch what ── */
    const figures = await getAllUnitFigures([
      { id: liga.id, type: "liga", programWeeks: 10, leagueFinishedOn: null },
      { id: school.id, type: "sekolah_bola", programWeeks: 10, leagueFinishedOn: null },
    ]);
    const schoolFigures = figures.get(school.id)!;
    const ligaFigures = figures.get(liga.id)!;
    if (schoolFigures.type !== "sekolah_bola" || ligaFigures.type !== "liga") throw new Error("unexpected figures");
    eq2([schoolFigures.figures.assets, schoolFigures.figures.income.total], [{ total: 300000, count: 1 }, 500000 + 200000 + 200000], "Dashboard: a school's assets are counted, and income has registration + monthly but no jersey");
    eq2(ligaFigures.figures.assets.total, 450000 + 50000, "Dashboard: a Liga's assets are the hand-typed one plus the purchase made through RAB Actual");
    const costsTotal = (await listActualCosts(liga.id)).reduce((total, c) => total + c.amount, 0);
    eq2([ligaFigures.figures.actual.total, ligaFigures.figures.dividend.actual], [costsTotal, costsTotal], "Dashboard: a Liga's RAB Actual is every real cost of the unit");
    eq2(ligaFigures.figures.dividend.value, ligaFigures.figures.dividend.funding - costsTotal, "Dashboard: the Liga dividend is (modal + registrasi + match fee) − RAB Actual");
    eq2([ligaFigures.figures.capital.total, schoolFigures.figures.capital.total], [0, 10000000 + 5000000], "Dashboard: modal is counted for both unit types");
    /* ── Dividen: the event of a Liga must be finished, owners take their share, the Owner overview counts what is left ── */
    const { saveDividendTaken, setLeagueFinished, unitDividendValue } = await import("@/lib/finance/dividend");
    const { dividendFinal, ownerPayouts } = await import("@/lib/finance/ownership");
    const rejectsUnit = async (promise: Promise<unknown>, label: string, match: RegExp) => {
      try {
        await promise;
        ok(false, `${label} (was accepted)`);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const fields = e instanceof UnitRuleError ? Object.values(e.fieldErrors).join(" ") : "";
        ok(e instanceof UnitRuleError && match.test(`${message} ${fields}`), `${label} → “${(fields || message).slice(0, 70)}”`);
      }
    };
    const ligaOwners = await listOwners(liga.id);
    const ligaDividendNow = await unitDividendValue({ id: liga.id, type: "liga", programWeeks: 10 });
    ok(ligaDividendNow > 0, "Dividen: the test Liga has a positive dividend to share");
    eq2([ligaFigures.payout.generated, ligaFigures.payout.final, ligaFigures.payout.dividend], [false, 0, ligaDividendNow], "Dividen: a Liga whose event is not finished has no dividend yet (it counts 0 for the Owner)");
    await rejectsUnit(saveDividendTaken(t, liga.id, new Map([[ligaOwners[0].id, 1]])), "Dividen: nothing can be taken before the event is finished", /setelah event liga/);
    await setLeagueFinished(t, liga.id, true);
    const ligaShare = ownerPayouts(ligaDividendNow, ligaOwners)[0].share;
    await rejectsUnit(saveDividendTaken(t, liga.id, new Map([[ligaOwners[0].id, ligaShare - 1]])), "Dividen: a Liga dividend can only be taken in full", /seluruhnya/);
    await rejectsUnit(saveDividendTaken(t, liga.id, new Map([[ligaOwners[0].id, ligaShare + 1]])), "Dividen: more than the share cannot be taken", /Melebihi/);
    await saveDividendTaken(t, liga.id, new Map([[ligaOwners[0].id, ligaShare]]));
    const afterTake = (await getAllUnitFigures([{ id: liga.id, type: "liga", programWeeks: 10, leagueFinishedOn: "2026-11-07" }])).get(liga.id)!;
    eq2([afterTake.payout.generated, afterTake.payout.taken, afterTake.payout.final], [true, ligaShare, ligaDividendNow - ligaShare], "Dividen: once finished, the Owner overview counts the dividend minus what was taken");
    await rejectsUnit(setLeagueFinished(t, liga.id, false), "Dividen: a league whose dividend was taken cannot be reopened", /sudah diambil/);
    await replaceUnitOwners(t, liga.id, [{ name: "Pemilik A", shareBp: 5000, inOverview: true }, { name: "Pemilik B", shareBp: 5000, inOverview: false }]);
    eq2((await listOwners(liga.id)).map((o) => [o.name, o.takenAmount]), [["Pemilik A", ligaShare], ["Pemilik B", 0]], "Dividen: rewriting the owner shares keeps what each owner took");
    const flagged = (await getAllUnitFigures([{ id: liga.id, type: "liga", programWeeks: 10, leagueFinishedOn: "2026-11-07" }])).get(liga.id)!;
    eq2([(await listOwners(liga.id)).map((o) => o.inOverview), flagged.payout.overview], [[true, false], ligaShare], "Dividen: the Owner overview counts only what the flagged owner took");
    await rejectsUnit(replaceUnitOwners(t, liga.id, [{ name: "Pemilik B", shareBp: 10000, inOverview: false }]), "Dividen: an owner who took money cannot be removed", /sudah mengambil/);
    // the owner rows are rewritten with new ids whenever the shares are edited, so read them again
    await saveDividendTaken(t, liga.id, new Map([[(await listOwners(liga.id))[0].id, 0]]));
    eq2((await listOwners(liga.id)).map((o) => o.takenAmount), [0, 0], "Dividen: a withdrawal can be undone");
    eq2(dividendFinal(1000, 300).final, 700, "Dividen: sisa dividen = dividend − taken");
    eq2(dividendFinal(1000, 0, false).final, 0, "Dividen: not generated counts 0");

    // Sekolah Bola: any amount up to the share
    await db.insert(s.finStudentPayments).values({ id: crypto.randomUUID(), businessUnitId: school.id, studentId: student.id, kind: "monthly", paidOn: "2027-01-05", amount: 10000000, discount: 0, period: "2027-01" });
    const schoolOwners = await listOwners(school.id);
    const schoolDividendNow = await unitDividendValue({ id: school.id, type: "sekolah_bola", programWeeks: 10 });
    const schoolPayout = ownerPayouts(schoolDividendNow, schoolOwners);
    ok(schoolDividendNow > 0 && schoolPayout[0].share > 1000000, "Dividen: the test school has a dividend to share");
    await saveDividendTaken(t, school.id, new Map([[schoolOwners[0].id, 1000000]]));
    const schoolAfter = (await getAllUnitFigures([{ id: school.id, type: "sekolah_bola", programWeeks: 10, leagueFinishedOn: null }])).get(school.id)!;
    eq2([schoolAfter.payout.taken, schoolAfter.payout.final], [1000000, schoolDividendNow - 1000000], "Dividen: a school owner can take part of the share");
    await rejectsUnit(saveDividendTaken(t, school.id, new Map([[schoolOwners[1].id, schoolPayout[1].share + 1]])), "Dividen: a school owner cannot take more than the share", /Melebihi/);
    await saveDividendTaken(t, school.id, new Map([[schoolOwners[0].id, schoolPayout[0].share], [schoolOwners[1].id, schoolPayout[1].share]]));
    eq2((await listOwners(school.id)).map((o) => o.takenAmount), [schoolPayout[0].share, schoolPayout[1].share], "Dividen: “ambil semua” takes every share");
    const schoolEmpty = (await getAllUnitFigures([{ id: school.id, type: "sekolah_bola", programWeeks: 10, leagueFinishedOn: null }])).get(school.id)!;
    eq2(schoolEmpty.payout.final, 0, "Dividen: when every owner took everything nothing is left for the Owner overview");

    const admin = scopeOf({ role: "unit_admin", unitId: school.id });
    const pinned = await save(liga, "asset", parseKind("asset", { purchasedOn: "2026-10-05", name: "Dipaksa", amount: "1", proofUrl: "", note: "" }), null, admin);
    eq2(pinned.unitId, school.id, "Access: a unit admin is pinned to their own unit even when the form names another one");
    await rejects(save(liga, "asset", parseKind("asset", { purchasedOn: "2026-10-05", name: "x", amount: "1", proofUrl: "", note: "" }), manualRow.id, admin), "Access: a unit admin cannot edit a row of another unit", /tidak ditemukan/);
    await rejects(deleteFinanceRecord({ t, actor, scope: admin, kind: "asset", id: manualRow.id }), "Access: a unit admin cannot delete a row of another unit", /tidak ditemukan/);
    ok((await save(school, "asset", parseKind("asset", { purchasedOn: "2026-10-05", name: "Cones", amount: "90000", proofUrl: "", note: "" }), null, admin)).created, "Access: a unit admin can add to their own unit");
  } finally {
    for (const code of Object.values(codes)) await removeUnit(db, code).catch((e) => console.log("cleanup:", e instanceof Error ? e.message : e));
    const gone = await db.select({ id: s.businessUnits.id }).from(s.businessUnits).where(or(...Object.values(codes).map((c) => eq(s.businessUnits.code, c))));
    // audit entries of the throw-away units name them in their summary
    await db.delete(s.auditLogs).where(like(s.auditLogs.summary, `%ZZTEST-%-${stamp}%`));
    ok(gone.length === 0, "cleanup: the throw-away units are gone");
  }

  console.log(failures ? `\n${failures} check(s) failed` : "\nAll record checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});
