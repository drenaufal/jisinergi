import { count, desc, eq, like, and, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";

export type AuditParams = { q?: string; action?: string; page?: string };

export async function getAuditLog(params: AuditParams) {
  const page = Math.max(1, Number(params.page) || 1);
  const size = 30;
  const conds: SQL[] = [];
  if (params.q) conds.push(like(auditLogs.summary, `%${params.q}%`));
  if (params.action) conds.push(eq(auditLogs.action, params.action));
  const where = conds.length ? and(...conds) : undefined;

  const [rows, total, actions] = await Promise.all([
    db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt)).limit(size).offset((page - 1) * size),
    db.select({ n: count() }).from(auditLogs).where(where),
    db.selectDistinct({ action: auditLogs.action }).from(auditLogs).orderBy(auditLogs.action),
  ]);

  return { rows, total: total[0].n, page, size, actions: actions.map((a) => a.action) };
}
