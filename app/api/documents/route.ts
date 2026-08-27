import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { approvals, auditLogs, documentAcl, documents, documentVersions } from "../../../db/schema";
import { accessError, canReadDocument, requireAccessUser } from "../../../lib/access";
import { indexDocumentVersion } from "../../../lib/ingestion";
import { findBlockedMatches } from "../../../lib/upload-control";

export const runtime = "edge";

export async function GET(request: Request) {
  try {
    const user = await requireAccessUser(request);
    const db = getDb();
    const [allRows, grants] = await Promise.all([
      db.select().from(documents).orderBy(desc(documents.updatedAt)).limit(500), db.select().from(documentAcl),
    ]);
    const rows = allRows.filter(document => canReadDocument(user, document, grants));
    const summary = { total: rows.length, pending: rows.filter(x => x.knowledgeStatus === "pending").length,
      approved: rows.filter(x => x.knowledgeStatus === "approved").length, draft: rows.filter(x => x.knowledgeStatus === "draft").length };
    return Response.json({ documents: rows.slice(0, 100), summary });
  } catch (error) { return accessError(error, "读取资料失败"); }
}

export async function POST(request: Request) {
  try {
    const user = await requireAccessUser(request);
    if (user.role !== "system_admin") return Response.json({ error: "仅系统管理员可以录入知识资源" }, { status: 403 });
    const body = (await request.json()) as Record<string, string | boolean>;
    const title = String(body.title || "").trim();
    const content = String(body.content || "").trim();
    if (!title || !content) return Response.json({ error: "文件名称和正文内容不能为空" }, { status: 400 });
    if (body.confirmedDesensitized !== true) return Response.json({ error: "试用资料必须先确认已脱敏且不含禁止上传内容" }, { status: 400 });

    const db = getDb();
    const blocked = await findBlockedMatches({ title, content });
    if (blocked.length) {
      const now = new Date().toISOString();
      await db.insert(auditLogs).values({
        id: crypto.randomUUID(), action: "禁止词条拦截录入", entityType: "upload_control", entityId: crypto.randomUUID(), operator: user.name,
        detail: `${title}｜命中${blocked.map(item => `${item.term}(${item.matchedField})`).join("、")}｜正文未保存`, createdAt: now,
      });
      return Response.json({ error: `内容命中后台禁止上传规则（${[...new Set(blocked.map(item => item.category))].join("、")}），本次录入已拒绝。` }, { status: 400 });
    }

    const trialDataClass = String(body.trialDataClass || "T2-内部脱敏测试");
    if (!new Set(["T1-公开资料", "T2-内部脱敏测试", "T3-部门隔离测试"]).has(trialDataClass)) return Response.json({ error: "试用数据类别不符合标准" }, { status: 400 });
    let securityLevel = String(body.securityLevel || "内部");
    let permissionScope = String(body.permissionScope || "责任部门");
    if (trialDataClass === "T1-公开资料") { securityLevel = "公开"; permissionScope = "公司全员"; }
    if (trialDataClass === "T3-部门隔离测试") permissionScope = "责任部门";
    const level = { "公开": 1, "内部": 2, "敏感": 3 }[securityLevel];
    if (!level || level > user.clearanceLevel) return Response.json({ error: "当前账号无权创建该数据级别" }, { status: 403 });

    const now = new Date().toISOString();
    const documentId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const approvalId = crypto.randomUUID();
    const operator = user.name;
    const status = body.submitMode === "draft" ? "draft" : "pending";
    const ownerDepartment = user.positionLevel >= 4 ? String(body.ownerDepartment || user.departmentName) : user.departmentName;

    await db.insert(documents).values({
      id: documentId, title, documentType: String(body.documentType || "其他资料"), sourceType: String(body.sourceType || "人工录入"),
      sourceRef: String(body.sourceRef || "") || null, ownerDepartment, securityLevel, permissionScope,
      lifecycleStatus: "effective", trialDataClass, isTrialData: true, resourceStatus: status === "draft" ? "draft" : "pending_review", resourceCategory: String(body.resourceCategory || body.documentType || "其他"),
      sourceOrganization: String(body.sourceOrganization || "").trim() || null, documentDate: String(body.documentDate || "").trim() || null, applicableScope: String(body.applicableScope || "").trim() || null, reliabilityScore: Number(body.reliabilityScore) || 0, knowledgeStatus: status, currentVersion: 1,
      createdBy: operator, createdByUserId: user.id, createdAt: now, updatedAt: now,
    });
    await db.insert(documentVersions).values({
      id: versionId, documentId, versionNo: 1, content, changeSummary: "首次入库", versionStatus: status, createdBy: operator, createdAt: now,
    });
    const chunkCount = await indexDocumentVersion(documentId, versionId, content);
    if (status === "pending") await db.insert(approvals).values({ id: approvalId, documentId, versionId, status: "pending", submittedBy: operator, submittedAt: now });
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(), action: status === "pending" ? "提交审核" : "保存草稿", entityType: "document", entityId: documentId,
      operator, detail: `${title}｜${trialDataClass}｜${securityLevel}｜${permissionScope}｜${ownerDepartment}｜${chunkCount}个检索片段`, createdAt: now,
    });

    const [created] = await db.select().from(documents).where(eq(documents.id, documentId));
    return Response.json({ document: created }, { status: 201 });
  } catch (error) { return accessError(error, "保存资料失败"); }
}
