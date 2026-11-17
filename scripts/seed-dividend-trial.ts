/**
 * Trial run of the dividend payout on the DEMO units only, so Ringkasan Owner has something to show:
 *   npm run db:seed:dividend-trial              LIGA-DEMO: league marked finished; every owner ticked “Ringkasan Owner”
 *                                               in a demo unit takes their whole share (Liga: all or nothing)
 *   npm run db:seed:dividend-trial -- --undo    takes it back: taken = 0 for every demo owner, LIGA-DEMO open again
 *
 * It goes through the same rules as the Dividen page (lib/finance/dividend.ts). Owners are ticked in the app
 * (Dividen → Ubah pembagian); this script does not tick anyone.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const DEMO_CODES = ["LIGA-DEMO", "SB-DEMO"];

async function main() {
  const undo = process.argv.includes("--undo");
  const { eq } = await import("drizzle-orm");
  const { db } = await import("@/lib/db");
  const s = await import("@/lib/db/schema");
  const { createT } = await import("@/lib/i18n/translate");
  const { saveDividendTaken, setLeagueFinished, unitDividendValue } = await import("@/lib/finance/dividend");
  const { maxTaken, ownerPayouts } = await import("@/lib/finance/ownership");
  const { listOwners } = await import("@/lib/finance/queries");
  const t = createT("id");
  const rp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

  for (const code of DEMO_CODES) {
    const [unit] = await db.select().from(s.businessUnits).where(eq(s.businessUnits.code, code));
    if (!unit) {
      console.log(`${code}: not found, skipped`);
      continue;
    }
    const owners = await listOwners(unit.id);

    if (undo) {
      if (owners.some((o) => o.takenAmount > 0)) await saveDividendTaken(t, unit.id, new Map(owners.map((o) => [o.id, 0])));
      if (unit.type === "liga" && unit.leagueFinishedOn) await setLeagueFinished(t, unit.id, false);
      console.log(`${code}: taken back to 0${unit.type === "liga" ? ", league open again" : ""}`);
      continue;
    }

    const flagged = owners.filter((o) => o.inOverview);
    if (!flagged.length) {
      console.log(`${code}: nobody ticked “Ringkasan Owner”, nothing taken`);
      continue;
    }
    if (unit.type === "liga" && !unit.leagueFinishedOn) await setLeagueFinished(t, unit.id, true);
    const dividend = await unitDividendValue(unit);
    const shares = ownerPayouts(dividend, owners);
    const taken = new Map(owners.flatMap((o, i) => (o.inOverview ? [[o.id, maxTaken(shares[i].share)] as const] : [])));
    await saveDividendTaken(t, unit.id, taken);
    console.log(`${code}: dividend ${rp(dividend)}${unit.type === "liga" ? " (league marked finished)" : ""}`);
    owners.forEach((o, i) => o.inOverview && console.log(`  ${o.name}: takes ${rp(taken.get(o.id)!)} of their share ${rp(shares[i].share)}`));
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
