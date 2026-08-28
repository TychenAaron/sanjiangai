// 本接口列出当前用户的非正式写作成果；普通用户只能读取本人，系统管理员可读取最小管理列表。
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { writingArtifacts } from "../../../../db/schema";
import { accessError, requireAccessUser } from "../../../../lib/access";

export const runtime = "edge";
export async function GET(request: Request) {
  try {
    const user = await requireAccessUser(request); const db = getDb();
    const rows = user.role === "system_admin" ? await db.select().from(writingArtifacts).orderBy(desc(writingArtifacts.updatedAt)).limit(100) : await db.select().from(writingArtifacts).where(eq(writingArtifacts.ownerUserId, user.id)).orderBy(desc(writingArtifacts.updatedAt)).limit(100);
    return Response.json({ artifacts: rows });
  } catch (error) { return accessError(error, "读取写作成果失败"); }
}
