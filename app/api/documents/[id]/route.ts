// 正式知识资源元数据编辑入口：仅资料管理角色可修改白名单字段，上传时间 createdAt 永远由服务端创建时写入且不可覆盖。
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { auditLogs, documents } from "../../../../db/schema";
import { accessError, canManageFormalDocuments, canUploadDocument, requireAccessUser } from "../../../../lib/access";

export const runtime = "edge";

/** 更新资料元数据。输入为资料 ID 与白名单字段；输出为更新后的资料，不接受 createdAt、评分或生命周期状态。 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAccessUser(request);
    if (!canManageFormalDocuments(user)) return Response.json({ error: "当前账号无资料元数据管理权限" }, { status: 403 });
    const id = (await context.params).id;
    const body = await request.json() as Record<string, unknown>;
    const db = getDb();
    const [document] = await db.select().from(documents).where(eq(documents.id, id));
    if (!document) return Response.json({ error: "资料不存在" }, { status: 404 });
    const ownerDepartment = String(body.ownerDepartment ?? document.ownerDepartment).trim() || document.ownerDepartment;
    const securityLevel = String(body.securityLevel ?? document.securityLevel).trim() || document.securityLevel;
    if (!canUploadDocument(user, securityLevel, ownerDepartment)) return Response.json({ error: "当前账号无权修改该密级或责任部门的资料" }, { status: 403 });
    const patch = {
      resourceCategory: String(body.resourceCategory ?? document.resourceCategory).trim() || document.resourceCategory,
      sourceOrganization: String(body.sourceOrganization ?? document.sourceOrganization ?? "").trim() || null,
      documentDate: String(body.documentDate ?? document.documentDate ?? "").trim() || null,
      applicableScope: String(body.applicableScope ?? document.applicableScope ?? "").trim() || null,
      ownerDepartment,
      securityLevel,
      permissionScope: String(body.permissionScope ?? document.permissionScope).trim() || document.permissionScope,
      updatedAt: new Date().toISOString(),
    };
    await db.update(documents).set(patch).where(eq(documents.id, id));
    const [updated] = await db.select().from(documents).where(eq(documents.id, id));
    // 审计只记录资料 ID、操作者和变更类型，不记录正文、凭证或敏感内容。
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(), action: "更新正式资料元数据", entityType: "document", entityId: id,
      operator: user.name, detail: "仅更新白名单元数据；上传时间保持不变", createdAt: patch.updatedAt,
    });
    return Response.json({ document: updated });
  } catch (error) { return accessError(error, "更新资料元数据失败"); }
}
