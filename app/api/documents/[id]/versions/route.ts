import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { approvals, auditLogs, documents, documentVersions } from "../../../../../db/schema";

export const runtime = "edge";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const db = getDb();
    const [document] = await db.select().from(documents).where(eq(documents.id, id));
    if (!document) return Response.json({ error: "资料不存在" }, { status: 404 });
    const versions = await db.select().from(documentVersions).where(eq(documentVersions.documentId, id)).orderBy(desc(documentVersions.versionNo));
    return Response.json({ document, versions });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "读取版本失败" }, { status: 500 }); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { content?: string; changeSummary?: string; operator?: string };
    const content = body.content?.trim();
    if (!content) return Response.json({ error: "新版本正文不能为空" }, { status: 400 });
    const db = getDb();
    const [document] = await db.select().from(documents).where(eq(documents.id, id));
    if (!document) return Response.json({ error: "资料不存在" }, { status: 404 });
    const now = new Date().toISOString();
    const nextVersion = document.currentVersion + 1;
    const versionId = crypto.randomUUID();
    const operator = body.operator?.trim() || "项目管理员";
    await db.insert(documentVersions).values({ id: versionId, documentId: id, versionNo: nextVersion, content, changeSummary: body.changeSummary?.trim() || "人工修改", versionStatus: "pending", createdBy: operator, createdAt: now });
    await db.update(documents).set({ currentVersion: nextVersion, knowledgeStatus: "pending", updatedAt: now }).where(eq(documents.id, id));
    await db.insert(approvals).values({ id: crypto.randomUUID(), documentId: id, versionId, status: "pending", submittedBy: operator, submittedAt: now });
    await db.insert(auditLogs).values({ id: crypto.randomUUID(), action: "提交新版本", entityType: "document", entityId: id, operator, detail: `${document.title}｜V${nextVersion}.0｜${body.changeSummary?.trim() || "人工修改"}`, createdAt: now });
    return Response.json({ ok: true, version: nextVersion }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "创建版本失败" }, { status: 500 }); }
}
