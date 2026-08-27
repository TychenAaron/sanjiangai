// 本接口负责正式知识资源的归档与删除；只返回操作结果，不向浏览器泄露正文或 R2 存储键。
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { approvals, auditLogs, documentAcl, documentChunks, documents, documentVersions } from "../../../../../db/schema";
import { accessError, requireAccessUser } from "../../../../../lib/access";

export const runtime = "edge";
type Bucket = { delete: (key: string) => Promise<unknown> };

// 归档输入为当前账号和资料 ID；仅系统管理员可归档待审核、已批准或已拒绝资料，输出不含资料正文。
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAccessUser(request);
    const { id } = await context.params;
    if (user.role !== "system_admin") return Response.json({ error: "仅系统管理员可以归档资料" }, { status: 403 });
    const db = getDb();
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    if (!doc) return Response.json({ error: "资料不存在" }, { status: 404 });
    if (!new Set(["approved", "pending_review", "rejected"]).has(doc.resourceStatus)) return Response.json({ error: "当前资料状态不能归档" }, { status: 400 });
    const now = new Date().toISOString();
    await db.update(documents).set({ resourceStatus: "archived", knowledgeStatus: "archived", lifecycleStatus: "archived", updatedAt: now }).where(eq(documents.id, id));
    await db.insert(auditLogs).values({ id: crypto.randomUUID(), action: "归档正式资料", entityType: "document", entityId: id, operator: user.name, detail: "资料已归档并立即退出检索和正式引用范围", createdAt: now });
    return Response.json({ ok: true, status: "archived" });
  } catch (error) { return accessError(error, "归档资料失败"); }
}

// 删除输入为当前账号和资料 ID；创建人或系统管理员可删，先停用 D1 可检索状态，再尽力清理 R2 与关联索引。
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAccessUser(request);
    const { id } = await context.params;
    const db = getDb();
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    if (!doc) return Response.json({ error: "资料不存在" }, { status: 404 });
    if (user.role !== "system_admin") return Response.json({ error: "仅系统管理员可以删除资料" }, { status: 403 });
    const now = new Date().toISOString();
    // 先标记不可用，R2 清理异常也不会再被检索或引用。
    await db.update(documents).set({ resourceStatus: "archived", knowledgeStatus: "archived", lifecycleStatus: "deleted", updatedAt: now }).where(eq(documents.id, id));
    let storageCleanup = "not_required";
    if (doc.storageKey) {
      const bucket = (env as unknown as { BUCKET?: Bucket }).BUCKET;
      try {
        if (!bucket) throw new Error("存储绑定不可用");
        await bucket.delete(doc.storageKey);
        storageCleanup = "completed";
      } catch { storageCleanup = "failed_protected"; }
    }
    await db.delete(documentChunks).where(eq(documentChunks.documentId, id));
    await db.delete(approvals).where(eq(approvals.documentId, id));
    await db.delete(documentAcl).where(eq(documentAcl.documentId, id));
    await db.delete(documentVersions).where(eq(documentVersions.documentId, id));
    await db.delete(documents).where(eq(documents.id, id));
    await db.insert(auditLogs).values({ id: crypto.randomUUID(), action: "删除正式资料", entityType: "document", entityId: id, operator: user.name, detail: `D1 资料与索引已清理；存储清理=${storageCleanup}`, createdAt: now });
    return Response.json({ ok: true, storageCleanup });
  } catch (error) { return accessError(error, "删除资料失败"); }
}
