// 政策候选详情接口：管理员读取候选记录及其正式知识生命周期状态。
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import {
  approvals,
  documentVersions,
  documents,
  policyCandidates,
  policySources,
} from "../../../../db/schema";
import { accessError, requireAccessUser } from "../../../../lib/access";
import { isFormalEvidenceDocument } from "../../../../lib/rag";

export const runtime = "edge";

/**
 * 读取一份政策候选及其关联正式资料的实时状态。
 * 输入为当前登录用户和候选 ID；仅 system_admin 可读，不返回 R2 存储信息或原始正文。
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAccessUser(request);
    if (user.role !== "system_admin") {
      return Response.json({ error: "仅管理员可读取政策候选" }, { status: 403 });
    }

    const { id } = await context.params;
    const db = getDb();
    const [candidate] = await db
      .select()
      .from(policyCandidates)
      .where(eq(policyCandidates.id, id))
      .limit(1);
    if (!candidate) {
      return Response.json({ error: "政策候选不存在" }, { status: 404 });
    }

    // documents/document_versions/approvals 是正式知识真状态，不根据 candidate.status 推断 RAG 可用性。
    const [sourceRows, documentRows, versionRows, approvalRows] = await Promise.all([
      db
        .select()
        .from(policySources)
        .where(eq(policySources.id, candidate.policySourceId))
        .limit(1),
      candidate.knowledgeDocumentId
        ? db.select().from(documents).where(eq(documents.id, candidate.knowledgeDocumentId)).limit(1)
        : Promise.resolve([]),
      candidate.knowledgeVersionId
        ? db
            .select()
            .from(documentVersions)
            .where(eq(documentVersions.id, candidate.knowledgeVersionId))
            .limit(1)
        : Promise.resolve([]),
      candidate.knowledgeVersionId
        ? db
            .select()
            .from(approvals)
            .where(eq(approvals.versionId, candidate.knowledgeVersionId))
            .orderBy(desc(approvals.submittedAt))
            .limit(1)
        : Promise.resolve([]),
    ]);
    const [source] = sourceRows;
    const [document] = documentRows;
    const [version] = versionRows;
    const [approval] = approvalRows;

    return Response.json({
      candidate,
      policySource: source || null,
      knowledge:
        document && version
          ? {
              document,
              version,
              approval: approval || null,
              ragAvailable: isFormalEvidenceDocument(
                document,
                version.versionNo,
                version.versionStatus,
              ),
            }
          : null,
    });
  } catch (error) {
    return accessError(error, "读取政策候选失败");
  }
}
