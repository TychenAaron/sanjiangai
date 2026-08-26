import { getDb } from "../../../../db";
import { auditLogs } from "../../../../db/schema";
import { accessError, requireAccessUser } from "../../../../lib/access";
import { retrieveAuthorized } from "../../../../lib/rag";

export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const user = await requireAccessUser(request);
    const body = await request.json() as { query?: string };
    const query = body.query?.trim();
    if (!query) return Response.json({ error: "请输入搜索内容" }, { status: 400 });
    if (query.length > 300) return Response.json({ error: "单次搜索不得超过300字" }, { status: 400 });

    const matches = await retrieveAuthorized(user, query);
    const results = matches.map(row => ({
      documentId: row.document.id,
      title: row.document.title,
      documentType: row.document.documentType,
      sourceType: row.document.sourceType,
      ownerDepartment: row.document.ownerDepartment,
      securityLevel: row.document.securityLevel,
      version: row.versionNo,
      excerpt: row.chunk.content.slice(0, 620),
      score: Number(row.score.toFixed(1)),
    }));

    await getDb().insert(auditLogs).values({
      id: crypto.randomUUID(), action: "智能搜索", entityType: "knowledge_search", entityId: crypto.randomUUID(), operator: user.name,
      detail: `${query.slice(0, 80)}｜权限内命中${results.length}条`, createdAt: new Date().toISOString(),
    });
    return Response.json({ results, retrievalMode: "authorized_fulltext" });
  } catch (error) { return accessError(error, "智能搜索失败"); }
}
