import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { approvals, auditLogs, documentAcl, documents, documentVersions } from "../../../../../db/schema";
import { accessError, canReviewDocument, requireAccessUser } from "../../../../../lib/access";
import { indexDocumentVersion } from "../../../../../lib/ingestion";

export const runtime = "edge";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAccessUser(request);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { reviewer?: string; comment?: string; decision?: string };
    const db = getDb();
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    if (!doc) return Response.json({ error: "资料不存在" }, { status: 404 });
    const grants = await db.select().from(documentAcl).where(eq(documentAcl.documentId, id));
    if (!canReviewDocument(user, doc, grants)) return Response.json({ error: "当前账号没有该资料的审核权限" }, { status: 403 });
    const [version] = await db.select().from(documentVersions).where(eq(documentVersions.documentId, id)).orderBy(desc(documentVersions.versionNo)).limit(1);
    if (!version) return Response.json({ error: "资料版本不存在" }, { status: 404 });

    const now = new Date().toISOString();
    const decision = body.decision === "reject" ? "rejected" : "approved";
    const reviewer = user.name;
    const chunkCount = await indexDocumentVersion(id, version.id, version.content);
    await db.update(documents).set({ knowledgeStatus: decision, updatedAt: now }).where(eq(documents.id, id));
    await db.update(documentVersions).set({ versionStatus: decision }).where(eq(documentVersions.id, version.id));
    await db.update(approvals).set({ status: decision, reviewer, comment: body.comment || (decision === "approved" ? "审核通过，可进入正式知识层" : "退回修改"), reviewedAt: now })
      .where(and(eq(approvals.documentId, id), eq(approvals.status, "pending")));
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(), action: decision === "approved" ? "审核通过" : "审核退回", entityType: "document", entityId: id,
      operator: reviewer, detail: `${doc.title}｜V${version.versionNo}.0｜${chunkCount}个检索片段｜${body.comment || "无补充意见"}`, createdAt: now,
    });
    return Response.json({ ok: true, status: decision });
  } catch (error) { return accessError(error, "审核失败"); }
}
