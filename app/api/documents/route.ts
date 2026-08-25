import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { approvals, auditLogs, documents, documentVersions } from "../../../db/schema";

export const runtime = "edge";

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : "数据库操作失败";
  return Response.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    const db = getDb();
    const rows = await db.select().from(documents).orderBy(desc(documents.updatedAt)).limit(100);
    const [summary] = await db.select({
      total: sql<number>`count(*)`,
      pending: sql<number>`sum(case when ${documents.knowledgeStatus} = 'pending' then 1 else 0 end)`,
      approved: sql<number>`sum(case when ${documents.knowledgeStatus} = 'approved' then 1 else 0 end)`,
      draft: sql<number>`sum(case when ${documents.knowledgeStatus} = 'draft' then 1 else 0 end)`,
    }).from(documents);
    return Response.json({ documents: rows, summary: summary ?? { total: 0, pending: 0, approved: 0, draft: 0 } });
  } catch (error) { return fail(error); }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, string>;
    const title = body.title?.trim();
    const content = body.content?.trim();
    if (!title || !content) return Response.json({ error: "文件名称和正文内容不能为空" }, { status: 400 });

    const now = new Date().toISOString();
    const documentId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const approvalId = crypto.randomUUID();
    const operator = body.operator?.trim() || "项目管理员";
    const status = body.submitMode === "draft" ? "draft" : "pending";
    const db = getDb();

    await db.insert(documents).values({
      id: documentId, title, documentType: body.documentType || "其他资料", sourceType: body.sourceType || "人工录入",
      sourceRef: body.sourceRef || null, ownerDepartment: body.ownerDepartment || "集团办公室",
      securityLevel: body.securityLevel || "内部", permissionScope: body.permissionScope || "集团本部",
      lifecycleStatus: "effective", knowledgeStatus: status, currentVersion: 1, createdBy: operator, createdAt: now, updatedAt: now,
    });
    await db.insert(documentVersions).values({
      id: versionId, documentId, versionNo: 1, content, changeSummary: "首次入库", versionStatus: status, createdBy: operator, createdAt: now,
    });
    if (status === "pending") await db.insert(approvals).values({ id: approvalId, documentId, versionId, status: "pending", submittedBy: operator, submittedAt: now });
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(), action: status === "pending" ? "提交审核" : "保存草稿", entityType: "document", entityId: documentId,
      operator, detail: `${title}｜来源：${body.sourceType || "人工录入"}｜权限：${body.permissionScope || "集团本部"}`, createdAt: now,
    });

    const [created] = await db.select().from(documents).where(eq(documents.id, documentId));
    return Response.json({ document: created }, { status: 201 });
  } catch (error) { return fail(error); }
}
