import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { approvals, auditLogs, documents, documentVersions } from "../../../../../db/schema";

export const runtime = "edge";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { reviewer?: string; comment?: string; decision?: string };
    const db = getDb();
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    if (!doc) return Response.json({ error: "资料不存在" }, { status: 404 });
    const [version] = await db.select().from(documentVersions).where(eq(documentVersions.documentId, id)).orderBy(desc(documentVersions.versionNo)).limit(1);
    if (!version) return Response.json({ error: "资料版本不存在" }, { status: 404 });

    const now = new Date().toISOString();
    const decision = body.decision === "reject" ? "rejected" : "approved";
    const reviewer = body.reviewer?.trim() || "资料审核员";
    await db.update(documents).set({ knowledgeStatus: decision, updatedAt: now }).where(eq(documents.id, id));
    await db.update(documentVersions).set({ versionStatus: decision }).where(eq(documentVersions.id, version.id));
    await db.update(approvals).set({ status: decision, reviewer, comment: body.comment || (decision === "approved" ? "审核通过，可进入正式知识层" : "退回修改"), reviewedAt: now })
      .where(and(eq(approvals.documentId, id), eq(approvals.status, "pending")));
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(), action: decision === "approved" ? "审核通过" : "审核退回", entityType: "document", entityId: id,
      operator: reviewer, detail: `${doc.title}｜V${version.versionNo}.0｜${body.comment || "无补充意见"}`, createdAt: now,
    });
    return Response.json({ ok: true, status: decision });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "审核失败" }, { status: 500 });
  }
}
