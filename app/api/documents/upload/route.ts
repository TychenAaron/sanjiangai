import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { approvals, auditLogs, documents, documentVersions } from "../../../../db/schema";
import { accessError, canUploadDocument, requireAccessUser } from "../../../../lib/access";
import { extractUpload, indexDocumentVersion, safeStorageName } from "../../../../lib/ingestion";
import { findBlockedMatches } from "../../../../lib/upload-control";

export const runtime = "edge";

type Bucket = {
  put: (key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }) => Promise<unknown>;
  delete: (key: string) => Promise<unknown>;
};

export async function POST(request: Request) {
  let bucket: Bucket | undefined;
  let storageKey: string | undefined;
  let storageWritten = false;
  try {
    const user = await requireAccessUser(request);
    if (user.role !== "system_admin") return Response.json({ error: "仅系统管理员可以上传知识资源" }, { status: 403 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "请选择要上传的文件" }, { status: 400 });
    if (form.get("confirmedDesensitized") !== "true") return Response.json({ error: "试用文件必须先确认已经脱敏" }, { status: 400 });

    const trialDataClass = String(form.get("trialDataClass") || "T2-内部脱敏测试");
    if (!new Set(["T1-公开资料", "T2-内部脱敏测试", "T3-部门隔离测试"]).has(trialDataClass)) return Response.json({ error: "试用数据类别不符合标准" }, { status: 400 });
    const requestedSecurityLevel = String(form.get("securityLevel") || "内部");
    // 说明：机密资料不得进入当前在线上传链路，所有账号都必须转入后续机密资料专用流程。
    if (requestedSecurityLevel === "机密" || requestedSecurityLevel === "confidential") {
      return Response.json({ error: "机密资料不得通过当前在线上传入口提交，应按后续机密资料专用流程处理" }, { status: 403 });
    }

    let securityLevel = requestedSecurityLevel;
    let permissionScope = String(form.get("permissionScope") || "责任部门");
    if (trialDataClass === "T1-公开资料") { securityLevel = "公开"; permissionScope = "公司全员"; }
    if (trialDataClass === "T3-部门隔离测试") permissionScope = "责任部门";
    const ownerDepartment = user.positionLevel >= 4 ? String(form.get("ownerDepartment") || user.departmentName) : user.departmentName;
    // 说明：上传与读取共用角色、部门和数据级别规则，不能通过邮箱或前端字段绕过敏感资料限制。
    if (!canUploadDocument(user, securityLevel, ownerDepartment)) {
      return Response.json({ error: "当前账号无权上传该数据级别或责任部门的资料" }, { status: 403 });
    }

    // 格式、大小、伪造扩展名和空解析均在 R2/D1 写入前明确拒绝，不能落入通用 500 而误导批量汇总。
    let extracted: Awaited<ReturnType<typeof extractUpload>>;
    try { extracted = await extractUpload(file); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : "文件预检失败" }, { status: 400 }); }
    const { buffer, content, parseStatus, parseReason } = extracted;
    const title = String(form.get("title") || file.name.replace(/\.[^.]+$/, "")).trim();
    if (!title) return Response.json({ error: "请填写文件名称" }, { status: 400 });
    const db = getDb();
    const blocked = await findBlockedMatches({ title, fileName: file.name, content });
    if (blocked.length) {
      const now = new Date().toISOString();
      await db.insert(auditLogs).values({
        id: crypto.randomUUID(), action: "禁止词条拦截上传", entityType: "upload_control", entityId: crypto.randomUUID(), operator: user.name,
        detail: `${file.name}｜命中${blocked.map(item => `${item.term}(${item.matchedField})`).join("、")}｜原文件未保存`, createdAt: now,
      });
      return Response.json({ error: `文件命中后台禁止上传规则（${[...new Set(blocked.map(item => item.category))].join("、")}），原文件未保存，请联系管理员。` }, { status: 400 });
    }
    // 批量导入会逐文件请求本接口；同名且同大小的既有原文件视为明显重复，拒绝在写入 R2/D1 前再次入库。
    // 这不是内容相似度判断，不会把名称相同但大小不同的后续版本静默覆盖。
    const [duplicate] = await db.select({ id: documents.id }).from(documents)
      .where(and(eq(documents.sourceRef, file.name), eq(documents.fileSize, file.size))).limit(1);
    if (duplicate) return Response.json({ error: "发现同名且同大小的已入库文件，已跳过重复上传。" }, { status: 409 });
    const runtime = env as unknown as { BUCKET?: Bucket };
    bucket = runtime.BUCKET;
    if (!bucket) throw new Error("文件存储尚未启用");

    const now = new Date().toISOString();
    const documentId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    storageKey = `trial/${now.slice(0, 10)}/${documentId}/${safeStorageName(file.name)}`;
    await bucket.put(storageKey, buffer, {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
      customMetadata: { uploadedBy: user.id, trialDataClass },
    });
    storageWritten = true;

    await db.insert(documents).values({
      id: documentId, title, documentType: String(form.get("documentType") || "其他资料"), sourceType: "文件上传",
      sourceRef: file.name, ownerDepartment, securityLevel, permissionScope, lifecycleStatus: "effective", trialDataClass, isTrialData: true,
      fileName: file.name, storageKey, mimeType: file.type || "application/octet-stream", fileSize: file.size, parseStatus, indexStatus: parseStatus === "parsed" ? "ready" : "pending",
      resourceStatus: "pending_review", resourceCategory: String(form.get("resourceCategory") || form.get("documentType") || "其他"), sourceOrganization: String(form.get("sourceOrganization") || "").trim() || null,
      documentDate: String(form.get("documentDate") || "").trim() || null, applicableScope: String(form.get("applicableScope") || "").trim() || null, reliabilityScore: Number(form.get("reliabilityScore")) || 0,
      knowledgeStatus: "pending", currentVersion: 1, createdBy: user.name, createdByUserId: user.id, createdAt: now, updatedAt: now,
    });
    await db.insert(documentVersions).values({
      id: versionId, documentId, versionNo: 1, content, changeSummary: parseStatus === "parsed" ? "文件首次上传并自动解析" : `文件已保存，${parseReason || "等待后续解析"}`, versionStatus: "pending", createdBy: user.name, createdAt: now,
    });
    const chunkCount = await indexDocumentVersion(documentId, versionId, content);
    await db.insert(approvals).values({ id: crypto.randomUUID(), documentId, versionId, status: "pending", submittedBy: user.name, submittedAt: now });
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(), action: "上传并解析文件", entityType: "document", entityId: documentId, operator: user.name,
      detail: `${title}｜${file.name}｜${chunkCount}个检索片段｜等待审核`, createdAt: now,
    });
    const [created] = await db.select().from(documents).where(eq(documents.id, documentId));
    return Response.json({ document: created, chunkCount }, { status: 201 });
  } catch (error) {
    // 说明：R2 已写入但后续任一 D1 步骤失败时，只删除本次刚生成的唯一存储键，避免遗留孤儿文件。
    // 删除和失败审计均为尽力操作，绝不按前缀批量删除或触碰已有对象。
    if (storageWritten && bucket && storageKey) {
      try {
        await bucket.delete(storageKey);
        try {
          const now = new Date().toISOString();
          await getDb().insert(auditLogs).values({
            id: crypto.randomUUID(), action: "上传失败回滚本机存储", entityType: "upload_control", entityId: storageKey,
            operator: "系统", detail: `已删除本次上传对象：${storageKey}`, createdAt: now,
          });
        } catch {
          // 数据库故障时无法写审计，但 R2 回滚结果仍不能影响原始错误返回。
        }
      } catch {
        // R2 不可用时保留原始失败原因；不执行任何可能误删其他对象的补救动作。
      }
    }
    return accessError(error, "上传文件失败");
  }
}
