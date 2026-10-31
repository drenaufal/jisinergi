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

  const { and, eq, like, or } = await import("drizzle-orm");
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
    const swapped = await replaceUnitOwners(t, liga.id, [{ name: "Pemilik A", shareBp: 5000 }, { name: "Pemilik C", shareBp: 5000 }]);
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

    /* ── RAB: asset lines fill ASET, saved lines are final ── */
    const rab = (raw: Record<string, string>) => parseKind("budget", { quantity: "1", note: "", ...raw });
    const dispenser = await save(liga, "budget", rab({ period: "monthly", category: "Peralatan", name: "Dispenser", unitPrice: "1000000", assetType: "asset" }));
    const weeklyAsset = await save(liga, "budget", rab({ period: "weekly", category: "Peralatan", name: "Sewa genset", quantity: "2", unitPrice: "150000", assetType: "asset" }));
    const lakban = await save(liga, "budget", rab({ period: "monthly", category: "Peralatan", name: "Lakban", unitPrice: "50000", assetType: "non_asset" }));
    const budgetRows = await db.select().from(s.finBudgetItems).where(eq(s.finBudgetItems.businessUnitId, liga.id));
    const byName = (name: string) => budgetRows.find((b) => b.name === name)!;
    eq2(budgetRows.map((b) => [b.name, b.isAsset]).sort(), [["Dispenser", true], ["Lakban", false], ["Sewa genset", true]], "RAB: the Aset / Non aset choice is stored per line");
    const ligaAssets = await db.select().from(s.finAssets).where(eq(s.finAssets.businessUnitId, liga.id));
    eq2(ligaAssets.map((a) => [a.name, a.amount, a.budgetItemId === byName(a.name).id]).sort(), [["Dispenser", 1000000, true], ["Sewa genset", 3000000, true]], "RAB: asset lines become assets (a weekly line × the 10 program weeks); a non-asset line does not");
    ok(dispenser.created && weeklyAsset.created && lakban.created, "RAB: three lines saved");
    await rejects(save(liga, "budget", rab({ period: "monthly", category: "Peralatan", name: "Dispenser", unitPrice: "2000000" }), byName("Dispenser").id), "RAB: a saved line cannot be edited", /tidak dapat diubah/);
    const linked = ligaAssets.find((a) => a.name === "Dispenser")!;
    await rejects(save(liga, "asset", parseKind("asset", { purchasedOn: "2026-10-05", name: "Dispenser", amount: "5", proofUrl: "", note: "" }), linked.id), "ASET: an asset made from the RAB cannot be edited", /otomatis/);
    await rejects(deleteFinanceRecord({ t, actor, scope: owner, kind: "asset", id: linked.id }), "ASET: an asset made from the RAB cannot be deleted on its own", /otomatis/);
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
    const costs = await listActualCosts(liga.id);
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
    await deleteFinanceRecord({ t, actor, scope: owner, kind: "actualcost", id: first.id });
    eq2((await listActualCosts(liga.id)).length, 2, "RAB Actual: a cost can be deleted");
    await deleteFinanceRecord({ t, actor, scope: owner, kind: "budget", id: byName("Lakban").id });
    ok((await db.select().from(s.finBudgetItems).where(eq(s.finBudgetItems.id, byName("Lakban").id))).length === 0, "RAB: a line without costs can be deleted");
    await deleteFinanceRecord({ t, actor, scope: owner, kind: "budget", id: byName("Sewa genset").id });
    ok((await db.select().from(s.finAssets).where(eq(s.finAssets.budgetItemId, byName("Sewa genset").id))).length === 0, "RAB: deleting an asset line removes the asset it made");
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

    /* ── Sekolah Bola: a registration covers its month ── */
    await save(school, "student", parseKind("student", { name: "Anak Uji", nickname: "", joinedOn: "2026-10-01", birthDate: "2015-04-12", jerseyNumber: "", note: "" }));
    const [student] = await db.select().from(s.finStudents).where(eq(s.finStudents.businessUnitId, school.id));
    eq2(student.birthDate, "2015-04-12", "Siswa: the birth date is saved");
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
      { id: liga.id, type: "liga", programWeeks: 10 },
      { id: school.id, type: "sekolah_bola", programWeeks: 10 },
    ]);
    const schoolFigures = figures.get(school.id)!;
    const ligaFigures = figures.get(liga.id)!;
    if (schoolFigures.type !== "sekolah_bola" || ligaFigures.type !== "liga") throw new Error("unexpected figures");
    eq2([schoolFigures.figures.assets, schoolFigures.figures.income.total], [{ total: 300000, count: 1 }, 500000 + 200000 + 200000], "Dashboard: a school's assets are counted, and income has registration + monthly but no jersey");
    eq2(ligaFigures.figures.assets.total, 1000000 + 450000, "Dashboard: a Liga's assets include the one made from the RAB");
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
