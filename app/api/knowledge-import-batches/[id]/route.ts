// 管理员查看或完成一个资料导入批次；结果只含文件处理元数据，绝不返回原文或存储密钥。
import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { knowledgeDatasets, knowledgeImportBatches, knowledgeImportItems } from "../../../../db/schema";
import { accessError, canManageFormalDocuments, requireAccessUser } from "../../../../lib/access";
import { refreshKnowledgeImportBatch } from "../../../../lib/knowledge-import-batch";

export const runtime = "edge";

/** 读取一个批次和逐文件持久化结果；仅资料管理员可调用。 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAccessUser(request);
    if (!canManageFormalDocuments(user)) return Response.json({ error: "当前账号无资料批量导入管理权限" }, { status: 403 });
    const { id } = await context.params; const db = getDb();
    const [row] = await db.select({ batch: knowledgeImportBatches, datasetName: knowledgeDatasets.name }).from(knowledgeImportBatches)
      .leftJoin(knowledgeDatasets, eq(knowledgeImportBatches.datasetId, knowledgeDatasets.id)).where(eq(knowledgeImportBatches.id, id)).limit(1);
    if (!row) return Response.json({ error: "未找到资料导入批次" }, { status: 404 });
    // 非系统管理员只能查看自己创建的批次，避免在管理列表中泄漏其他上传人的文件处理结果。
    if (row.batch.uploaderUserId !== user.id && user.role !== "system_admin") return Response.json({ error: "无权查看其他管理员创建的导入批次" }, { status: 403 });
    const items = await db.select().from(knowledgeImportItems).where(eq(knowledgeImportItems.batchId, id)).orderBy(asc(knowledgeImportItems.createdAt));
    return Response.json({ batch: { ...row.batch, datasetName: row.datasetName }, items });
  } catch (error) { return accessError(error, "读取资料导入批次失败"); }
}

/** 完成批次并由服务端重算成功、失败和跳过数量；浏览器不能伪造汇总结果。 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAccessUser(request);
    if (!canManageFormalDocuments(user)) return Response.json({ error: "当前账号无资料批量导入管理权限" }, { status: 403 });
    const { id } = await context.params; const db = getDb();
    const batch = await db.query.knowledgeImportBatches.findFirst({ where: (table, { eq: equals }) => equals(table.id, id) });
    if (!batch) return Response.json({ error: "未找到资料导入批次" }, { status: 404 });
    if (batch.uploaderUserId !== user.id && user.role !== "system_admin") return Response.json({ error: "无权完成其他管理员创建的导入批次" }, { status: 403 });
    return Response.json({ batch: await refreshKnowledgeImportBatch(id, true) });
  } catch (error) { return accessError(error, "完成资料导入批次失败"); }
}
