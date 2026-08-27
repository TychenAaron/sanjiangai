// 本接口按当前会话权限返回单个正式引用的短预览，不提供下载、R2 键或全文。
import { and, eq, gte, ne } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { documentAcl, documentChunks, documents, documentVersions } from "../../../../../db/schema";
import { accessError, canReadDocument, requireAccessUser } from "../../../../../lib/access";

export const runtime = "edge";

// 输入为引用资料 ID 与分段序号；输出仅为已批准、已解析、当前版本且有权限的短片段。
export async function GET(request: Request, context: { params: Promise<{ documentId: string }> }) {
  try {
    const user = await requireAccessUser(request);
    const { documentId } = await context.params;
    const chunkIndex = Number(new URL(request.url).searchParams.get("chunkIndex"));
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0) return Response.json({ error: "引用定位无效" }, { status: 400 });
    const db = getDb();
    const [grants, rows] = await Promise.all([
      db.select().from(documentAcl).where(eq(documentAcl.documentId, documentId)),
      db.select({ chunk: documentChunks, document: documents, version: documentVersions }).from(documentChunks)
        .innerJoin(documents, eq(documentChunks.documentId, documents.id))
        .innerJoin(documentVersions, eq(documentChunks.versionId, documentVersions.id))
        .where(and(eq(documents.id, documentId), eq(documentChunks.chunkIndex, chunkIndex), eq(documents.knowledgeStatus, "approved"), eq(documents.resourceStatus, "approved"), eq(documents.lifecycleStatus, "effective"), eq(documents.parseStatus, "parsed"), eq(documents.indexStatus, "ready"), ne(documents.securityLevel, "D4"), gte(documents.reliabilityScore, 60), eq(documentVersions.versionStatus, "approved"))).limit(1),
    ]);
    const row = rows[0];
    if (!row || row.version.versionNo !== row.document.currentVersion || !canReadDocument(user, row.document, grants)) return Response.json({ error: "当前账号无权查看该引用，或资料已不可用" }, { status: 403 });
    return Response.json({ preview: row.chunk.content.slice(0, 520), location: `第${row.chunk.chunkIndex + 1}段` });
  } catch (error) { return accessError(error, "读取引用预览失败"); }
}
