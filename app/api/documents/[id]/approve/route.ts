import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { approvals, auditLogs, documents, documentVersions } from "../../../../../db/schema";
import { accessError, canReviewDocument, requireAccessUser } from "../../../../../lib/access";
import { indexDocumentVersion } from "../../../../../lib/ingestion";
import { indexApprovedDocumentVersion } from "../../../../../lib/vector-indexing";

export const runtime = "edge";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAccessUser(request);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { comment?: string; decision?: string; resourceCategory?: string; sourceOrganization?: string; documentDate?: string; applicableScope?: string; reliabilityScore?: number };
    const db = getDb();
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    if (!doc) return Response.json({ error: "资料不存在" }, { status: 404 });
    if (!canReviewDocument(user, doc)) return Response.json({ error: "当前账号没有该资料的审核权限" }, { status: 403 });
    if (doc.fileName && doc.parseStatus !== "parsed") return Response.json({ error: "文件尚未完成可靠解析，不能批准为正式资料" }, { status: 400 });
    const [version] = await db.select().from(documentVersions).where(eq(documentVersions.documentId, id)).orderBy(desc(documentVersions.versionNo)).limit(1);
    if (!version) return Response.json({ error: "资料版本不存在" }, { status: 404 });

    const now = new Date().toISOString();
    const decision = body.decision === "reject" ? "rejected" : "approved";
    const category = String(body.resourceCategory || doc.resourceCategory || "").trim();
    const sourceOrganization = String(body.sourceOrganization || doc.sourceOrganization || "").trim();
    const documentDate = String(body.documentDate || doc.documentDate || "").trim();
    const applicableScope = String(body.applicableScope || doc.applicableScope || "").trim();
    const reliabilityScore = Number(body.reliabilityScore ?? doc.reliabilityScore);
    // 批准前必须补齐正式资料元数据与可靠性判断，普通员工不能通过请求体伪造 approved。
    if (decision === "approved" && (!category || !sourceOrganization || !documentDate || !applicableScope || !Number.isFinite(reliabilityScore) || reliabilityScore < 60)) {
      return Response.json({ error: "批准前请补齐资料类别、来源单位、文件日期、适用范围和可靠性评分（至少 60 分）" }, { status: 400 });
    }
    if (decision === "rejected" && !String(body.comment || "").trim()) return Response.json({ error: "拒绝资料时必须填写简短审核理由" }, { status: 400 });
    const reviewer = user.name;
    const chunkCount = await indexDocumentVersion(id, version.id, version.content);
    await db.update(documents).set({ knowledgeStatus: decision, resourceStatus: decision, resourceCategory: category || doc.resourceCategory, sourceOrganization: sourceOrganization || doc.sourceOrganization, documentDate: documentDate || doc.documentDate, applicableScope: applicableScope || doc.applicableScope, reliabilityScore: Number.isFinite(reliabilityScore) ? reliabilityScore : doc.reliabilityScore, reviewNote: body.comment || null, vectorStatus: decision === "approved" ? "pending" : "disabled", updatedAt: now }).where(eq(documents.id, id));
    await db.update(documentVersions).set({ versionStatus: decision }).where(eq(documentVersions.id, version.id));
    await db.update(approvals).set({ status: decision, reviewer, comment: body.comment || (decision === "approved" ? "审核通过，可进入正式知识层" : "退回修改"), reviewedAt: now })
      .where(and(eq(approvals.documentId, id), eq(approvals.status, "pending")));
    // 批准后才向外部 Embedding 服务发送已审核分段；失败只标记状态，不生成模拟向量或改变关键词检索。
    const vectorResult = decision === "approved" ? await indexApprovedDocumentVersion(id, version.id) : { status: "pending" as const, count: 0 };
    if (decision === "approved") {
      await db.update(documents).set({ vectorStatus: vectorResult.status, updatedAt: new Date().toISOString() }).where(eq(documents.id, id));
      await db.insert(auditLogs).values({
        id: crypto.randomUUID(), action: "向量索引", entityType: "document", entityId: id, operator: reviewer,
        detail: `status=${vectorResult.status}; count=${vectorResult.count}`, createdAt: new Date().toISOString(),
      });
    }
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(), action: decision === "approved" ? "审核通过" : "审核退回", entityType: "document", entityId: id,
      operator: reviewer, detail: `${doc.title}｜V${version.versionNo}.0｜${chunkCount}个检索片段｜${body.comment || "无补充意见"}`, createdAt: now,
    });
    return Response.json({ ok: true, status: decision });
  } catch (error) { return accessError(error, "审核失败"); }
}
