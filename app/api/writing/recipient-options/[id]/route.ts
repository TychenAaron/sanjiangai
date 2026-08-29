// 公文报送/发送对象单项管理接口：系统管理员可编辑、停用和删除未被新公文引用的项。
import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { auditLogs, writingDocuments, writingRecipientOptions } from "../../../../../db/schema";
import { accessError, requireAccessUser } from "../../../../../lib/access";

export const runtime = "edge";

async function requireSystemAdmin(request: Request) {
  const user = await requireAccessUser(request);
  if (user.role !== "system_admin") throw Object.assign(new Error("仅系统管理员可以维护报送/发送对象"), { status: 403 });
  return user;
}

// 说明：编辑名称、启停和排序。输入仅允许白名单字段，输出更新后配置；数据库只更新配置表与审计记录。
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSystemAdmin(request); const id = (await context.params).id;
    const body = await request.json() as { name?: string; enabled?: boolean; sortOrder?: number };
    const db = getDb(); const [current] = await db.select().from(writingRecipientOptions).where(eq(writingRecipientOptions.id, id));
    if (!current) return Response.json({ error: "报送/发送对象不存在" }, { status: 404 });
    const name = body.name === undefined ? current.name : String(body.name).trim().slice(0, 100);
    if (!name) return Response.json({ error: "请填写报送/发送对象名称" }, { status: 400 });
    if (name !== current.name) {
      const duplicate = await db.select({ id: writingRecipientOptions.id }).from(writingRecipientOptions).where(eq(writingRecipientOptions.name, name)).limit(1);
      if (duplicate.length) return Response.json({ error: "该报送/发送对象已存在" }, { status: 409 });
    }
    const now = new Date().toISOString();
    await db.update(writingRecipientOptions).set({ name, enabled: body.enabled === undefined ? current.enabled : Boolean(body.enabled), sortOrder: Number.isFinite(body.sortOrder) ? Number(body.sortOrder) : current.sortOrder, updatedAt: now }).where(eq(writingRecipientOptions.id, id));
    await db.insert(auditLogs).values({ id: crypto.randomUUID(), action: "更新报送发送对象", entityType: "writing_recipient_option", entityId: id, operator: user.name, detail: `name=${name}`, createdAt: now });
    const [option] = await db.select().from(writingRecipientOptions).where(eq(writingRecipientOptions.id, id));
    return Response.json({ option });
  } catch (error) {
    if (error instanceof Error && "status" in error) return Response.json({ error: error.message }, { status: Number((error as Error & { status: number }).status) });
    return accessError(error, "更新报送/发送对象失败");
  }
}

// 说明：删除未被新公文关联的配置。历史自由文本始终保留；若已有 recipient_option_id 引用则要求管理员改为停用，避免管理配置误删。
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSystemAdmin(request); const id = (await context.params).id; const db = getDb();
    const [current] = await db.select().from(writingRecipientOptions).where(eq(writingRecipientOptions.id, id));
    if (!current) return Response.json({ error: "报送/发送对象不存在" }, { status: 404 });
    const used = await db.select({ id: writingDocuments.id }).from(writingDocuments).where(eq(writingDocuments.recipientOptionId, id)).limit(1);
    if (used.length) return Response.json({ error: "该对象已被历史公文使用，请停用而不是删除" }, { status: 409 });
    const now = new Date().toISOString(); await db.delete(writingRecipientOptions).where(eq(writingRecipientOptions.id, id));
    await db.insert(auditLogs).values({ id: crypto.randomUUID(), action: "删除报送发送对象", entityType: "writing_recipient_option", entityId: id, operator: user.name, detail: `name=${current.name}`, createdAt: now });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && "status" in error) return Response.json({ error: error.message }, { status: Number((error as Error & { status: number }).status) });
    return accessError(error, "删除报送/发送对象失败");
  }
}
