import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { auditLogs, blockedTerms } from "../../../../db/schema";
import { accessError, canManageUploadRules, requireAccessUser } from "../../../../lib/access";

export const runtime = "edge";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAccessUser(request);
    if (!canManageUploadRules(user)) return Response.json({ error: "当前账号无权管理禁止上传词条" }, { status: 403 });
    const { id } = await context.params;
    const body = await request.json() as { enabled?: boolean };
    if (typeof body.enabled !== "boolean") return Response.json({ error: "缺少启用状态" }, { status: 400 });
    const db = getDb();
    const [existing] = await db.select().from(blockedTerms).where(eq(blockedTerms.id, id));
    if (!existing) return Response.json({ error: "词条不存在" }, { status: 404 });
    const now = new Date().toISOString();
    await db.update(blockedTerms).set({ enabled: body.enabled, updatedAt: now }).where(eq(blockedTerms.id, id));
    await db.insert(auditLogs).values({ id: crypto.randomUUID(), action: body.enabled ? "启用禁止上传词条" : "停用禁止上传词条", entityType: "blocked_term", entityId: id, operator: user.name, detail: `${existing.term}｜${existing.category}`, createdAt: now });
    return Response.json({ ok: true });
  } catch (error) { return accessError(error, "更新禁止上传词条失败"); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAccessUser(request);
    if (!canManageUploadRules(user)) return Response.json({ error: "当前账号无权管理禁止上传词条" }, { status: 403 });
    const { id } = await context.params;
    const db = getDb();
    const [existing] = await db.select().from(blockedTerms).where(eq(blockedTerms.id, id));
    if (!existing) return Response.json({ error: "词条不存在" }, { status: 404 });
    const now = new Date().toISOString();
    await db.delete(blockedTerms).where(eq(blockedTerms.id, id));
    await db.insert(auditLogs).values({ id: crypto.randomUUID(), action: "删除禁止上传词条", entityType: "blocked_term", entityId: id, operator: user.name, detail: `${existing.term}｜${existing.category}`, createdAt: now });
    return Response.json({ ok: true });
  } catch (error) { return accessError(error, "删除禁止上传词条失败"); }
}
