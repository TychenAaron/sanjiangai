// 本接口列出当前用户的非正式写作成果；普通用户只能读取本人，系统管理员可读取最小管理列表。
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../../../../db";
import { writingArtifacts } from "../../../../db/schema";
import { accessError, requireAccessUser } from "../../../../lib/access";

export const runtime = "edge";
export async function GET(request: Request) {
  try {
    const user = await requireAccessUser(request); const db = getDb(); const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1); const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 20));
    const owner = user.role === "system_admin" ? url.searchParams.get("owner")?.trim() : user.id; const status = url.searchParams.get("status")?.trim();
    const from = url.searchParams.get("from")?.trim(); const to = url.searchParams.get("to")?.trim();
    const filters = [owner ? eq(writingArtifacts.ownerUserId, owner) : undefined, status ? eq(writingArtifacts.status, status) : undefined, from ? gte(writingArtifacts.createdAt, from) : undefined, to ? lte(writingArtifacts.createdAt, to) : undefined].filter(Boolean);
    const rows = await db.select().from(writingArtifacts).where(filters.length ? and(...filters) : undefined).orderBy(desc(writingArtifacts.updatedAt)).limit(pageSize).offset((page - 1) * pageSize);
    // 管理列表只返回元数据与数量，不能因管理员列表权限泄露私有正文或参考正文。
    return Response.json({ page, pageSize, artifacts: rows.map((artifact) => { const item = { ...artifact, privateReferenceCount: JSON.parse(artifact.privateReferenceIdsJson).length, formalEvidenceCount: JSON.parse(artifact.formalEvidenceIdsJson).length, contentAvailable: artifact.ownerUserId === user.id }; delete item.content; delete item.structuredContentJson; delete item.privateReferenceIdsJson; delete item.formalEvidenceIdsJson; return item; }) });
  } catch (error) { return accessError(error, "读取写作成果失败"); }
}
