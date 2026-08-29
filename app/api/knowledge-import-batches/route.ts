// 管理员创建和查询正式知识资料批次；批次只组织既有上传链路，不能绕过审核或把文件直接送入 RAG。
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { knowledgeDatasets, knowledgeImportBatches } from "../../../db/schema";
import { accessError, canManageFormalDocuments, requireAccessUser } from "../../../lib/access";

export const runtime = "edge";
const trialClasses = new Set(["T1-公开资料", "T2-内部脱敏测试", "T3-部门隔离测试"]);

/** 查询管理员可管理的批次元数据；不返回文件正文、R2 key 或未授权资料。 */
export async function GET(request: Request) {
  try {
    const user = await requireAccessUser(request);
    if (!canManageFormalDocuments(user)) return Response.json({ error: "当前账号无资料批量导入管理权限" }, { status: 403 });
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || 20)));
    const query = getDb().select({ batch: knowledgeImportBatches, datasetName: knowledgeDatasets.name })
      .from(knowledgeImportBatches).leftJoin(knowledgeDatasets, eq(knowledgeImportBatches.datasetId, knowledgeDatasets.id));
    // 系统管理员可管理全局批次；其余资料管理角色仅看到自己发起的导入，避免泄漏批次文件元数据。
    const rows = user.role === "system_admin"
      ? await query.orderBy(desc(knowledgeImportBatches.createdAt)).limit(pageSize).offset((page - 1) * pageSize)
      : await query.where(eq(knowledgeImportBatches.uploaderUserId, user.id)).orderBy(desc(knowledgeImportBatches.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
    return Response.json({ batches: rows.map(({ batch, datasetName }) => ({ ...batch, datasetName })), page, pageSize });
  } catch (error) { return accessError(error, "读取资料导入批次失败"); }
}

/** 创建一个带统一元数据的导入批次；只有资料管理员可调用，文件仍需逐份通过既有上传安全检查。 */
export async function POST(request: Request) {
  try {
    const user = await requireAccessUser(request);
    if (!canManageFormalDocuments(user)) return Response.json({ error: "当前账号无资料批量导入管理权限" }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const datasetName = String(body.datasetName || "").trim();
    const totalCount = Number(body.totalCount || 0);
    const securityLevel = String(body.securityLevel || "内部");
    const trialDataClass = String(body.trialDataClass || "T2-内部脱敏测试");
    if (!datasetName || datasetName.length > 80) return Response.json({ error: "请填写不超过 80 个字符的资料集名称" }, { status: 400 });
    if (!Number.isInteger(totalCount) || totalCount < 1 || totalCount > 1000) return Response.json({ error: "本批文件数量应在 1 至 1000 之间" }, { status: 400 });
    if (!trialClasses.has(trialDataClass)) return Response.json({ error: "试用数据类别不符合当前入口要求" }, { status: 400 });
    // D4/机密资料不能进入当前在线导入入口，避免批次能力绕过既有机密资料专用流程。
    if (securityLevel === "D4" || securityLevel === "机密" || securityLevel === "confidential") return Response.json({ error: "D4/机密资料不能通过当前在线批量导入入口上传" }, { status: 403 });
    const db = getDb(); const now = new Date().toISOString();
    let dataset = await db.query.knowledgeDatasets.findFirst({ where: (table, { eq: equals }) => equals(table.name, datasetName) });
    if (!dataset) {
      const id = crypto.randomUUID();
      await db.insert(knowledgeDatasets).values({ id, name: datasetName, createdByUserId: user.id, createdBy: user.name, createdAt: now, updatedAt: now });
      dataset = await db.query.knowledgeDatasets.findFirst({ where: (table, { eq: equals }) => equals(table.id, id) });
    }
    if (!dataset) throw new Error("资料集创建失败");
    const batch = { id: crypto.randomUUID(), datasetId: dataset.id, uploaderUserId: user.id, uploader: user.name,
      documentType: String(body.documentType || "其他资料"), resourceCategory: String(body.resourceCategory || "其他"), securityLevel, permissionScope: String(body.permissionScope || "责任部门"),
      ownerDepartment: user.positionLevel >= 4 ? String(body.ownerDepartment || user.departmentName) : user.departmentName,
      sourceOrganization: String(body.sourceOrganization || "").trim() || null, documentDate: String(body.documentDate || "").trim() || null, applicableScope: String(body.applicableScope || "").trim() || null,
      trialDataClass, totalCount, successCount: 0, failedCount: 0, skippedCount: 0, status: "uploading", createdAt: now, completedAt: null };
    await db.insert(knowledgeImportBatches).values(batch);
    return Response.json({ batch, dataset: { id: dataset.id, name: dataset.name } }, { status: 201 });
  } catch (error) { return accessError(error, "创建资料导入批次失败"); }
}
