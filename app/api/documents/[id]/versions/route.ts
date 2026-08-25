import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { approvals, auditLogs, documentAcl, documents, documentVersions } from "../../../../../db/schema";
import { accessError, canEditDocument, canReadDocument, requireAccessUser } from "../../../../../lib/access";
import { indexDocumentVersion } from "../../../../../lib/ingestion";

export const runtime = "edge";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAccessUser(request);
    const { id } = await context.params;
    const db = getDb();
    const [document] = await db.select().from(documents).where(eq(documents.id, id));
    if (!document) return Response.json({ error: "资料不存在" }, { status: 404 });
    const grants = await db.select().from(documentAcl).where(eq(documentAcl.documentId, id));
    if (!canReadDocument(user, document, grants)) return Response.json({ error: "当前账号无权查看该资料" }, { status: 403 });
    const versions = await db.select().from(documentVersions).where(eq(documentVersions.documentId, id)).orderBy(desc(documentVersions.versionNo));
    return Response.json({ document, versions });
  } catch (error) { return accessError(error, "读取版本失败"); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAccessUser(request);
    const { id } = await context.params;
    const body = (await request.json()) as { content?: string; changeSummary?: string };
    const content = body.content?.trim();
    if (!content) return Response.json({ error: "新版本正文不能为空" }, { status: 400 });
    const db = getDb();
    const [document] = await db.select().from(documents).where(eq(documents.id, id));
    if (!document) return Response.json({ error: "资料不存在" }, { status: 404 });
    const grants = await db.select().from(documentAcl).where(eq(documentAcl.documentId, id));
    if (!canEditDocument(user, document, grants)) return Response.json({ error: "当前账号无权修改该资料" }, { status: 403 });
    const now = new Date().toISOString();
    const nextVersion = document.currentVersion + 1;
    const versionId = crypto.randomUUID();
    const operator = user.name;
    await db.insert(documentVersions).values({ id: versionId, documentId: id, versionNo: nextVersion, content, changeSummary: body.changeSummary?.trim() || "人工修改", versionStatus: "pending", createdBy: operator, createdAt: now });
    await indexDocumentVersion(id, versionId, content);
    await db.update(documents).set({ currentVersion: nextVersion, knowledgeStatus: "pending", updatedAt: now }).where(eq(documents.id, id));
    await db.insert(approvals).values({ id: crypto.randomUUID(), documentId: id, versionId, status: "pending", submittedBy: operator, submittedAt: now });
    await db.insert(auditLogs).values({ id: crypto.randomUUID(), action: "提交新版本", entityType: "document", entityId: id, operator, detail: `${document.title}｜V${nextVersion}.0｜${body.changeSummary?.trim() || "人工修改"}`, createdAt: now });
    return Response.json({ ok: true, version: nextVersion }, { status: 201 });
  } catch (error) { return accessError(error, "创建版本失败"); }
}
