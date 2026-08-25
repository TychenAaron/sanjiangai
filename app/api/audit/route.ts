import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLogs } from "../../../db/schema";

export const runtime = "edge";

export async function GET() {
  try {
    const db = getDb();
    const logs = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(30);
    return Response.json({ logs });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取审计日志失败" }, { status: 500 });
  }
}
