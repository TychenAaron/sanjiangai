// 管理员重建正式资料向量索引：只处理已批准、有效、已解析的当前版本，不改变 ACL、D4、审核或资料生命周期。
import { and, eq, ne } from "drizzle-orm";
import { getDb } from "../../../../db";
import { documents, documentVersions } from "../../../../db/schema";
import { accessError, canManageFormalDocuments, requireAccessUser } from "../../../../lib/access";
import { indexDocumentVersion } from "../../../../lib/ingestion";
import { indexApprovedDocumentVersion } from "../../../../lib/vector-indexing";

export const runtime = "edge";
/** 重建全部、资料集或指定文档的分段与向量；Embedding 未配置时如实保留 pending 状态。 */
export async function POST(request: Request) {
  try {
    const user = await requireAccessUser(request); if (!canManageFormalDocuments(user)) return Response.json({ error: "仅资料管理角色可重建知识索引" }, { status: 403 });
    const body = await request.json().catch(() => ({})) as { documentIds?: string[]; datasetId?: string };
    const db = getDb(); let rows = await db.select({ document: documents, version: documentVersions }).from(documents).innerJoin(documentVersions, and(eq(documentVersions.documentId, documents.id), eq(documentVersions.versionNo, documents.currentVersion))).where(and(eq(documents.knowledgeStatus, "approved"), eq(documents.resourceStatus, "approved"), eq(documents.lifecycleStatus, "effective"), eq(documents.parseStatus, "parsed"), ne(documents.securityLevel, "D4"), eq(documentVersions.versionStatus, "approved")));
    if (body.datasetId) rows = rows.filter(row => row.document.datasetId === body.datasetId); if (body.documentIds?.length) rows = rows.filter(row => body.documentIds!.includes(row.document.id));
    let ready = 0; let pending = 0; let failed = 0;
    for (const row of rows) { await indexDocumentVersion(row.document.id, row.version.id, row.version.content); const result = await indexApprovedDocumentVersion(row.document.id, row.version.id); await db.update(documents).set({ vectorStatus: result.status, updatedAt: new Date().toISOString() }).where(eq(documents.id, row.document.id)); if (result.status === "ready") ready += 1; else if (result.status === "pending") pending += 1; else failed += 1; }
    return Response.json({ total: rows.length, ready, pending, failed });
  } catch (error) { return accessError(error, "重建知识索引失败"); }
}
