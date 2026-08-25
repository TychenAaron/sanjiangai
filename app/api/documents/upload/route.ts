import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { approvals, auditLogs, documents, documentVersions } from "../../../../db/schema";
import { accessError, requireAccessUser } from "../../../../lib/access";
import { extractUpload, indexDocumentVersion, safeStorageName } from "../../../../lib/ingestion";
import { findBlockedMatches } from "../../../../lib/upload-control";

export const runtime = "edge";

type Bucket = { put: (key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }) => Promise<unknown> };

export async function POST(request: Request) {
  try {
    const user = await requireAccessUser(request);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "请选择要上传的文件" }, { status: 400 });
    if (form.get("confirmedDesensitized") !== "true") return Response.json({ error: "试用文件必须先确认已经脱敏" }, { status: 400 });

    const trialDataClass = String(form.get("trialDataClass") || "T2-内部脱敏测试");
    if (!new Set(["T1-公开资料", "T2-内部脱敏测试", "T3-部门隔离测试"]).has(trialDataClass)) return Response.json({ error: "试用数据类别不符合标准" }, { status: 400 });
    let securityLevel = String(form.get("securityLevel") || "内部");
    let permissionScope = String(form.get("permissionScope") || "责任部门");
    if (trialDataClass === "T1-公开资料") { securityLevel = "公开"; permissionScope = "公司全员"; }
    if (trialDataClass === "T3-部门隔离测试") permissionScope = "责任部门";
    const level = ({ "公开": 1, "内部": 2, "敏感": 3 } as Record<string, number>)[securityLevel];
    if (!level || level > user.clearanceLevel) return Response.json({ error: "当前账号无权上传该数据级别" }, { status: 403 });

    const { buffer, content } = await extractUpload(file);
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
    const runtime = env as unknown as { BUCKET?: Bucket };
    if (!runtime.BUCKET) throw new Error("文件存储尚未启用");

    const now = new Date().toISOString();
    const documentId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const storageKey = `trial/${now.slice(0, 10)}/${documentId}/${safeStorageName(file.name)}`;
    const ownerDepartment = user.positionLevel >= 4 ? String(form.get("ownerDepartment") || user.departmentName) : user.departmentName;
    await runtime.BUCKET.put(storageKey, buffer, {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
      customMetadata: { uploadedBy: user.id, trialDataClass },
    });

    await db.insert(documents).values({
      id: documentId, title, documentType: String(form.get("documentType") || "其他资料"), sourceType: "文件上传",
      sourceRef: file.name, ownerDepartment, securityLevel, permissionScope, lifecycleStatus: "effective", trialDataClass, isTrialData: true,
      fileName: file.name, storageKey, mimeType: file.type || "application/octet-stream", fileSize: file.size, parseStatus: "parsed", indexStatus: "ready",
      knowledgeStatus: "pending", currentVersion: 1, createdBy: user.name, createdByUserId: user.id, createdAt: now, updatedAt: now,
    });
    await db.insert(documentVersions).values({
      id: versionId, documentId, versionNo: 1, content, changeSummary: "文件首次上传并自动解析", versionStatus: "pending", createdBy: user.name, createdAt: now,
    });
    const chunkCount = await indexDocumentVersion(documentId, versionId, content);
    await db.insert(approvals).values({ id: crypto.randomUUID(), documentId, versionId, status: "pending", submittedBy: user.name, submittedAt: now });
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(), action: "上传并解析文件", entityType: "document", entityId: documentId, operator: user.name,
      detail: `${title}｜${file.name}｜${chunkCount}个检索片段｜等待审核`, createdAt: now,
    });
    const [created] = await db.select().from(documents).where(eq(documents.id, documentId));
    return Response.json({ document: created, chunkCount }, { status: 201 });
  } catch (error) { return accessError(error, "上传文件失败"); }
}
