import { and, eq, or } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import { db } from "@/lib/db";
import { finActualCosts, finAssets, finExpenses, finMatchFees, finOtherIncome, finRegistrations, finStudentPayments } from "@/lib/db/schema";
import { mediaUrl } from "@/lib/media";
import type { CurrentUser } from "@/lib/auth/session";
import { scopeOf } from "./access";

/**
 * Receipts are private documents. A receipt is readable by (a) whoever uploaded it, while they are
 * still filling in the form, and (b) the logins that may see the unit whose record it is attached to:
 * the owner for any unit, a unit admin only for their own.
 */
export async function canOpenFinanceProof(
  user: Pick<CurrentUser, "id" | "role" | "unitId">,
  file: { id: string; uploadedBy: string | null },
): Promise<boolean> {
  if (file.uploadedBy === user.id) return true;

  const scope = scopeOf(user);
  if (!scope.allUnits && !scope.unitId) return false;
  const url = mediaUrl(file.id);
  const mine = (column: AnyMySqlColumn) => (scope.allUnits ? undefined : eq(column, scope.unitId!));

  try {
    const hits = await Promise.all([
      db.select({ id: finAssets.id }).from(finAssets).where(and(eq(finAssets.proofUrl, url), mine(finAssets.businessUnitId))).limit(1),
      db
        .select({ id: finRegistrations.id })
        .from(finRegistrations)
        .where(and(or(eq(finRegistrations.dpProofUrl, url), eq(finRegistrations.finalProofUrl, url)), mine(finRegistrations.businessUnitId)))
        .limit(1),
      db.select({ id: finMatchFees.id }).from(finMatchFees).where(and(eq(finMatchFees.proofUrl, url), mine(finMatchFees.businessUnitId))).limit(1),
      db
        .select({ id: finStudentPayments.id })
        .from(finStudentPayments)
        .where(and(eq(finStudentPayments.proofUrl, url), mine(finStudentPayments.businessUnitId)))
        .limit(1),
      db.select({ id: finExpenses.id }).from(finExpenses).where(and(eq(finExpenses.proofUrl, url), mine(finExpenses.businessUnitId))).limit(1),
      db.select({ id: finActualCosts.id }).from(finActualCosts).where(and(eq(finActualCosts.proofUrl, url), mine(finActualCosts.businessUnitId))).limit(1),
      db.select({ id: finOtherIncome.id }).from(finOtherIncome).where(and(eq(finOtherIncome.proofUrl, url), mine(finOtherIncome.businessUnitId))).limit(1),
    ]);
    return hits.some((rows) => rows.length > 0);
  } catch {
    return false;
  }
}
