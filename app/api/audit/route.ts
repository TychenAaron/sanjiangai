import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLogs } from "../../../db/schema";
import { accessError, canReadAudit, requireAccessUser } from "../../../lib/access";

export const runtime = "edge";

export async function GET(request: Request) {
  try {
    const user = await requireAccessUser(request);
    if (!canReadAudit(user)) return Response.json({ error: "当前账号无权查看审计日志" }, { status: 403 });
    const db = getDb();
    const logs = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(30);
    return Response.json({ logs });
  } catch (error) { return accessError(error, "读取审计日志失败"); }
}
