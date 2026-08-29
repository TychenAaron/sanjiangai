// 正式知识文件上传入口：单文件与管理员批次均复用同一预检、R2 回滚、解析、分段和待审核生命周期。
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { approvals, auditLogs, documents, documentVersions } from "../../../../db/schema";
import { accessError, canManageFormalDocuments, canUploadDocument, requireAccessUser } from "../../../../lib/access";
import { extractUpload, indexDocumentVersion, safeStorageName } from "../../../../lib/ingestion";
import { indexApprovedDocumentVersion } from "../../../../lib/vector-indexing";
import { recordKnowledgeImportItem, refreshKnowledgeImportBatch } from "../../../../lib/knowledge-import-batch";
import { findBlockedMatches } from "../../../../lib/upload-control";

export const runtime = "edge";
type Bucket = { put: (key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }) => Promise<unknown>; delete: (key: string) => Promise<unknown> };
type BatchContext = { id: string; datasetId: string; documentType: string; resourceCategory: string; securityLevel: string; permissionScope: string; ownerDepartment: string; sourceOrganization: string | null; documentDate: string | null; applicableScope: string | null; trialDataClass: string };

/** 读取并校验批次上下文，确保逐文件请求只能使用服务端保存的批次资料集、密级和范围。 */
async function getBatchContext(form: FormData, userId: string, isManager: boolean): Promise<BatchContext | null> {
  const batchId = String(form.get("batchId") || "").trim();
  if (!batchId) return null;
  if (!isManager) throw new Error("当前账号无资料批量导入管理权限");
  const batch = await getDb().query.knowledgeImportBatches.findFirst({ where: (table, { eq: equals }) => equals(table.id, batchId) });
  if (!batch || batch.status !== "uploading") throw new Error("资料导入批次不存在或已完成");
  if (batch.uploaderUserId !== userId) throw new Error("无权向其他管理员创建的导入批次写入文件");
  return batch;
}

/** 保存批次内单个文件的失败或跳过结果；旧单文件上传不会写批次表。 */
async function recordBatchTerminal(batch: BatchContext | null, form: FormData, file: File | null, status: "failed" | "skipped", reason: string) {
  if (!batch || !file) return;
  await recordKnowledgeImportItem({ batchId: batch.id, clientFileKey: String(form.get("batchItemKey") || `${file.name}:${file.size}:${file.lastModified}`), fileName: file.name, fileSize: file.size, mimeType: file.type, status, reason });
  await refreshKnowledgeImportBatch(batch.id);
}

/**
 * 上传一个正式知识文件。
 * 输入为资料管理角色上传的文件和可选批次 ID；解析成功时自动输出已批准文档，待解析文件保持待审核。格式、禁止词条检查均在 R2/D1 写入前完成。
 */
export async function POST(request: Request) {
  let bucket: Bucket | undefined; let storageKey: string | undefined; let storageWritten = false;
  let batch: BatchContext | null = null; let form: FormData | null = null; let file: File | null = null;
  try {
    const user = await requireAccessUser(request);
    if (!canManageFormalDocuments(user)) return Response.json({ error: "仅系统管理员、知识管理员或资料审核员可以上传知识资源" }, { status: 403 });
    form = await request.formData();
    const incoming = form.get("file"); file = incoming instanceof File ? incoming : null;
    if (!file) return Response.json({ error: "请选择要上传的文件" }, { status: 400 });
    batch = await getBatchContext(form, user.id, canManageFormalDocuments(user));
    if (form.get("confirmedDesensitized") !== "true") { await recordBatchTerminal(batch, form, file, "failed", "未确认脱敏"); return Response.json({ error: "上传文件必须先确认已脱敏" }, { status: 400 }); }

    const trialDataClass = batch?.trialDataClass || String(form.get("trialDataClass") || "T2-内部脱敏测试");
    if (!new Set(["T1-公开资料", "T2-内部脱敏测试", "T3-部门隔离测试"]).has(trialDataClass)) { await recordBatchTerminal(batch, form, file, "failed", "试用数据类别无效"); return Response.json({ error: "试用数据类别不符合标准" }, { status: 400 }); }
    let securityLevel = batch?.securityLevel || String(form.get("securityLevel") || "内部");
    let permissionScope = batch?.permissionScope || String(form.get("permissionScope") || "责任部门");
    if (securityLevel === "D1") securityLevel = "公开"; if (securityLevel === "D2") securityLevel = "内部"; if (securityLevel === "D3") securityLevel = "敏感";
    if (securityLevel === "D4" || securityLevel === "机密" || securityLevel === "confidential") { await recordBatchTerminal(batch, form, file, "failed", "D4/机密资料不支持在线上传"); return Response.json({ error: "D4/机密资料不能通过当前在线上传入口提交" }, { status: 403 }); }
    if (trialDataClass === "T1-公开资料") { securityLevel = "公开"; permissionScope = "公司全员"; }
    if (trialDataClass === "T3-部门隔离测试") permissionScope = "责任部门";
    const ownerDepartment = batch?.ownerDepartment || (user.positionLevel >= 4 ? String(form.get("ownerDepartment") || user.departmentName) : user.departmentName);
    if (!canUploadDocument(user, securityLevel, ownerDepartment)) { await recordBatchTerminal(batch, form, file, "failed", "无上传该密级资料的权限"); return Response.json({ error: "当前账号无权上传该数据级别或责任部门的资料" }, { status: 403 }); }

    let extracted: Awaited<ReturnType<typeof extractUpload>>;
    try { extracted = await extractUpload(file); } catch (error) { const reason = error instanceof Error ? error.message : "文件预检失败"; await recordBatchTerminal(batch, form, file, "failed", reason); return Response.json({ error: reason }, { status: 400 }); }
    const { buffer, content, parseStatus, parseReason } = extracted;
    const automaticallyApproved = parseStatus === "parsed";
    const title = String(form.get("title") || file.name.replace(/\.[^.]+$/, "")).trim();
    if (!title) { await recordBatchTerminal(batch, form, file, "failed", "文件名称为空"); return Response.json({ error: "请填写文件名称" }, { status: 400 }); }
    const db = getDb(); const blocked = await findBlockedMatches({ title, fileName: file.name, content });
    if (blocked.length) {
      const now = new Date().toISOString();
      await db.insert(auditLogs).values({ id: crypto.randomUUID(), action: "禁止词条拦截上传", entityType: "upload_control", entityId: crypto.randomUUID(), operator: user.name, detail: "文件命中上传拦截规则，原文件未保存", createdAt: now });
      await recordBatchTerminal(batch, form, file, "failed", "命中后台禁止上传规则");
      return Response.json({ error: "文件命中后台禁止上传规则，原文件未保存" }, { status: 400 });
    }
    const [duplicate] = await db.select({ id: documents.id }).from(documents).where(and(eq(documents.sourceRef, file.name), eq(documents.fileSize, file.size))).limit(1);
    if (duplicate) { await recordBatchTerminal(batch, form, file, "skipped", "同名同大小文件已入库"); return Response.json({ error: "发现同名同大小的已入库文件，已跳过重复上传", duplicateDocumentId: duplicate.id }, { status: 409 }); }
    bucket = (env as unknown as { BUCKET?: Bucket }).BUCKET; if (!bucket) throw new Error("文件存储尚未启用");
    const now = new Date().toISOString(); const documentId = crypto.randomUUID(); const versionId = crypto.randomUUID();
    storageKey = `trial/${now.slice(0, 10)}/${documentId}/${safeStorageName(file.name)}`;
    await bucket.put(storageKey, buffer, { httpMetadata: { contentType: file.type || "application/octet-stream" }, customMetadata: { uploadedBy: user.id, trialDataClass } }); storageWritten = true;
    await db.insert(documents).values({
      id: documentId, title, documentType: batch?.documentType || String(form.get("documentType") || "其他资料"), sourceType: "文件上传", sourceRef: file.name,
      ownerDepartment, securityLevel, permissionScope, lifecycleStatus: "effective", trialDataClass, isTrialData: true, fileName: file.name, storageKey, mimeType: file.type || "application/octet-stream", fileSize: file.size,
      parseStatus, indexStatus: automaticallyApproved ? "ready" : "pending", resourceStatus: automaticallyApproved ? "approved" : "pending_review", resourceCategory: batch?.resourceCategory || String(form.get("resourceCategory") || form.get("documentType") || "其他"),
      sourceOrganization: batch?.sourceOrganization || String(form.get("sourceOrganization") || "").trim() || null, documentDate: batch?.documentDate || String(form.get("documentDate") || "").trim() || null, applicableScope: batch?.applicableScope || String(form.get("applicableScope") || "").trim() || null,
      reliabilityScore: 60, knowledgeStatus: automaticallyApproved ? "approved" : "pending", currentVersion: 1, createdBy: user.name, createdByUserId: user.id, datasetId: batch?.datasetId || null, importBatchId: batch?.id || null, createdAt: now, updatedAt: now,
    });
    await db.insert(documentVersions).values({ id: versionId, documentId, versionNo: 1, content, changeSummary: parseStatus === "parsed" ? "文件首次上传、解析并自动批准" : `文件已保存，${parseReason || "等待后续解析"}`, versionStatus: automaticallyApproved ? "approved" : "pending", createdBy: user.name, createdAt: now });
    const chunkCount = await indexDocumentVersion(documentId, versionId, content);
    await db.insert(approvals).values({ id: crypto.randomUUID(), documentId, versionId, status: automaticallyApproved ? "approved" : "pending", submittedBy: user.name, submittedAt: now, reviewer: automaticallyApproved ? user.name : null, reviewedAt: automaticallyApproved ? now : null, comment: automaticallyApproved ? "上传解析成功，系统自动批准" : null });
    const vectorResult = automaticallyApproved ? await indexApprovedDocumentVersion(documentId, versionId) : { status: "pending", count: 0 };
    if (automaticallyApproved) await db.update(documents).set({ vectorStatus: vectorResult.status, updatedAt: new Date().toISOString() }).where(eq(documents.id, documentId));
    await db.insert(auditLogs).values({ id: crypto.randomUUID(), action: "上传并解析文件", entityType: "document", entityId: documentId, operator: user.name, detail: automaticallyApproved ? `解析成功并自动批准；向量索引：${vectorResult.status}` : `文件待后续解析；解析状态：${parseStatus}`, createdAt: now });
    const [created] = await db.select().from(documents).where(eq(documents.id, documentId));
    if (batch) {
      await recordKnowledgeImportItem({ batchId: batch.id, clientFileKey: String(form.get("batchItemKey") || `${file.name}:${file.size}:${file.lastModified}`), fileName: file.name, fileSize: file.size, mimeType: file.type, status: "succeeded", documentId, versionId, parseStatus, chunkCount, indexStatus: created.indexStatus });
      await refreshKnowledgeImportBatch(batch.id);
    }
    return Response.json({ document: created, chunkCount }, { status: 201 });
  } catch (error) {
    if (storageWritten && bucket && storageKey) { try { await bucket.delete(storageKey); } catch { /* 仅回滚本次对象，绝不影响其他 R2 文件。 */ } }
    const reason = error instanceof Error ? error.message : "上传文件失败";
    try { await recordBatchTerminal(batch, form || new FormData(), file, "failed", reason); } catch { /* 结果记录失败不能覆盖原始错误。 */ }
    return accessError(error, "上传文件失败");
  }
}
