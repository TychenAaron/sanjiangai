// 本接口查询 Formal Artifact 与既有正式知识 document/version 的关系；仅成果创建人或系统管理员可读取。
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { formalArtifacts } from "../../../../db/schema";
import { accessError, requireAccessUser } from "../../../../lib/access";

export const runtime = "edge";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAccessUser(request); const { id } = await context.params;
    const [artifact] = await getDb().select().from(formalArtifacts).where(eq(formalArtifacts.id, id)).limit(1);
    if (!artifact) return Response.json({ error: "正式成果不存在" }, { status: 404 });
    if (user.role !== "system_admin" && artifact.ownerUserId !== user.id) return Response.json({ error: "无权读取该正式成果" }, { status: 403 });
    return Response.json({ formalArtifact: artifact });
  } catch (error) { return accessError(error, "读取正式成果失败"); }
}
