// 本接口分页查询 Formal Artifact 元数据；正式资料的审核和生效状态仍以 documents/document_versions 为唯一真相。
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { formalArtifacts } from "../../../db/schema";
import { accessError, requireAccessUser } from "../../../lib/access";
export const runtime = "edge";
export async function GET(request: Request) {
  try {
    const user = await requireAccessUser(request); const url = new URL(request.url); const page = Math.max(1, Number(url.searchParams.get("page")) || 1); const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 20));
    const status = url.searchParams.get("status")?.trim(); const rows = user.role === "system_admin" ? await getDb().select().from(formalArtifacts).where(status ? eq(formalArtifacts.status, status) : undefined).orderBy(desc(formalArtifacts.updatedAt)).limit(pageSize).offset((page - 1) * pageSize) : await getDb().select().from(formalArtifacts).where(eq(formalArtifacts.ownerUserId, user.id)).orderBy(desc(formalArtifacts.updatedAt)).limit(pageSize).offset((page - 1) * pageSize);
    return Response.json({ page, pageSize, formalArtifacts: rows });
  } catch (error) { return accessError(error, "读取正式成果失败"); }
}
