import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLogs, writingDocuments, writingPrivateReferences, writingVersions } from "../../../db/schema";
import { accessError, requireAccessUser } from "../../../lib/access";
import { buildOutline, checkWriting, resolveWritingReferences, summarizePrivateReferences, WRITING_TYPES, type WritingType } from "../../../lib/writing";
import { generateStructuredWriting, normalizeStructuredWriting, structuredWritingToText } from "../../../lib/writing-structured";

export const runtime = "edge";

function canManageWriting(user: { role: string }) { return user.role === "system_admin"; }

async function loadPrivateReferences(id: string) {
  const db = getDb();
  const rows = await db.select().from(writingPrivateReferences).where(eq(writingPrivateReferences.writingDocumentId, id)).orderBy(desc(writingPrivateReferences.updatedAt));
  return summarizePrivateReferences(rows.map((row) => ({
    id: row.id,
    fileName: row.fileName,
    parseStatus: row.parseStatus as "parsed" | "pending_conversion" | "pending_ocr" | "failed",
    parseFormat: row.parseFormat,
    parseReason: row.parseReason,
    parsedText: row.parsedText,
    locationsJson: row.locationsJson,
  })));
}

// 说明：读取公文工作区，创建人只读取自己的草稿，系统管理员读取全部；最终稿不自动进入正式知识库。
export async function GET(request: Request) {
  try {
    const user = await requireAccessUser(request);
    const db = getDb();
    const rows = canManageWriting(user)
      ? await db.select().from(writingDocuments).orderBy(desc(writingDocuments.updatedAt)).limit(100)
      : await db.select().from(writingDocuments).where(eq(writingDocuments.createdByUserId, user.id)).orderBy(desc(writingDocuments.updatedAt)).limit(100);
    return Response.json({ writings: rows });
  } catch (error) { return accessError(error, "读取公文草稿失败"); }
}

// 说明：创建公文提纲或保存后续版本；输入只接受用户填写的事实与已授权引用，输出为工作区记录和人工检查结果。
// 不会自动审批、发文或把最终稿写入 documents 知识库。
export async function POST(request: Request) {
  try {
    const user = await requireAccessUser(request);
    const body = await request.json() as Record<string, unknown>;
    // 说明：首次请求没有 id 时创建提纲；已有 id 的请求保存人工版本，避免前端把版本保存误判为再次创建。
    const action = String(body.action || (body.id ? "save" : "create"));
    const db = getDb();
    if (action === "create_workspace") {
      const documentType = String(body.documentType || "") as WritingType;
      const title = String(body.title || "").trim();
      const recipient = String(body.recipient || "").trim();
      const facts = String(body.facts || "").trim();
      const referenceQuery = String(body.referenceQuery || "").trim();
      if (!WRITING_TYPES.has(documentType) || !title) return Response.json({ error: "请选择文种并填写标题" }, { status: 400 });
      const now = new Date().toISOString(); const id = crypto.randomUUID();
      // 说明：选择私有文件时只创建当前用户的空工作区，暂不检索、生成正文或创建版本；后续主按钮必须更新同一 ID。
      await db.insert(writingDocuments).values({ id, documentType, title, submittingDepartment: user.departmentName, recipient, facts, referenceQuery, referencesJson: "[]", status: "outline", createdByUserId: user.id, createdBy: user.name, createdAt: now, updatedAt: now });
      await db.insert(auditLogs).values({ id: crypto.randomUUID(), action: "创建公文空工作区", entityType: "writing_document", entityId: id, operator: user.name, detail: `${documentType}｜仅供私有参考材料绑定`, createdAt: now });
      return Response.json({ id, status: "outline" }, { status: 201 });
    }
    if (action === "update_outline") {
      const id = String(body.id || "");
      const documentType = String(body.documentType || "") as WritingType;
      const title = String(body.title || "").trim();
      const recipient = String(body.recipient || "").trim();
      const facts = String(body.facts || "").trim();
      const referenceQuery = String(body.referenceQuery || "").trim();
      if (!id || !WRITING_TYPES.has(documentType) || !title) return Response.json({ error: "请填写完整的提纲参数" }, { status: 400 });
      const [writing] = await db.select().from(writingDocuments).where(eq(writingDocuments.id, id));
      if (!writing) return Response.json({ error: "公文草稿不存在" }, { status: 404 });
      if (!canManageWriting(user) && writing.createdByUserId !== user.id) return Response.json({ error: "只能更新自己的公文提纲" }, { status: 403 });
      // 说明：重新检索只使用当前账号仍有权查看的资料，并把新提纲作为同一工作区的 outline 历史版本保存；不会读取无权资料或创建新的公文记录。
      const references = referenceQuery ? await resolveWritingReferences(user, referenceQuery) : [];
      const privateReferences = await loadPrivateReferences(id);
      const outline = buildOutline(documentType, title, recipient, facts, references, privateReferences);
      // 结构化初稿仅使用已确认事实和权限过滤后的正式依据；私有材料数量只影响组织提示，不能成为事实或引用。
      const structured = generateStructuredWriting({ type: documentType, title, recipient, submittingDepartment: writing.submittingDepartment, facts, references, privateReferenceCount: privateReferences.length });
      const generatedText = structuredWritingToText(structured);
      const versions = await db.select().from(writingVersions).where(eq(writingVersions.writingDocumentId, id));
      const now = new Date().toISOString(); const checks = checkWriting(title, recipient, facts, outline);
      const nextVersionNo = Math.max(0, ...versions.map((version) => version.versionNo)) + 1;
      await db.update(writingDocuments).set({ documentType, title, recipient, facts, referenceQuery, referencesJson: JSON.stringify(references), status: "generated", updatedAt: now }).where(eq(writingDocuments.id, id));
      await db.insert(writingVersions).values({ id: crypto.randomUUID(), writingDocumentId: id, versionNo: nextVersionNo, stage: "generated", content: generatedText, structuredContentJson: JSON.stringify(structured), checksJson: JSON.stringify(checks), createdByUserId: user.id, createdBy: user.name, createdAt: now });
      await db.insert(auditLogs).values({ id: crypto.randomUUID(), action: "更新公文提纲与引用依据", entityType: "writing_document", entityId: id, operator: user.name, detail: `${documentType}｜引用${references.length}条｜仅工作区`, createdAt: now });
      return Response.json({ id, outline, generated: structured, references, privateReferences, checks, status: writing.status });
    }
    if (action === "create") {
      const documentType = String(body.documentType || "") as WritingType;
      const title = String(body.title || "").trim();
      const recipient = String(body.recipient || "").trim();
      const facts = String(body.facts || "").trim();
      const referenceQuery = String(body.referenceQuery || "").trim();
      if (!WRITING_TYPES.has(documentType) || !title) return Response.json({ error: "请选择文种并填写标题" }, { status: 400 });
      const references = referenceQuery ? await resolveWritingReferences(user, referenceQuery) : [];
      const outline = buildOutline(documentType, title, recipient, facts, references, []);
      const structured = generateStructuredWriting({ type: documentType, title, recipient, submittingDepartment: user.departmentName, facts, references, privateReferenceCount: 0 });
      const generatedText = structuredWritingToText(structured);
      const now = new Date().toISOString(); const id = crypto.randomUUID(); const versionId = crypto.randomUUID();
      const checks = checkWriting(title, recipient, facts, outline);
      await db.insert(writingDocuments).values({ id, documentType, title, submittingDepartment: user.departmentName, recipient, facts, referenceQuery, referencesJson: JSON.stringify(references), status: "outline", createdByUserId: user.id, createdBy: user.name, createdAt: now, updatedAt: now });
      await db.insert(writingVersions).values({ id: versionId, writingDocumentId: id, versionNo: 1, stage: "generated", content: generatedText, structuredContentJson: JSON.stringify(structured), checksJson: JSON.stringify(checks), createdByUserId: user.id, createdBy: user.name, createdAt: now });
      await db.insert(auditLogs).values({ id: crypto.randomUUID(), action: "创建公文提纲", entityType: "writing_document", entityId: id, operator: user.name, detail: `${documentType}｜引用${references.length}条｜仅工作区`, createdAt: now });
      return Response.json({ id, outline, generated: structured, references, privateReferences: [], checks, status: "generated" }, { status: 201 });
    }
    if (action === "save_structured") {
      const id = String(body.id || "");
      const structured = normalizeStructuredWriting(body.structured);
      if (!id || !structured || !structured.title || !WRITING_TYPES.has(structured.documentType)) return Response.json({ error: "结构化正文内容不完整" }, { status: 400 });
      const [writing] = await db.select().from(writingDocuments).where(eq(writingDocuments.id, id));
      if (!writing) return Response.json({ error: "公文工作区不存在" }, { status: 404 });
      if (!canManageWriting(user) && writing.createdByUserId !== user.id) return Response.json({ error: "只能修改自己的公文正文" }, { status: 403 });
      const versions = await db.select().from(writingVersions).where(eq(writingVersions.writingDocumentId, id));
      const content = structuredWritingToText(structured); const now = new Date().toISOString();
      const latest = versions.sort((left, right) => right.versionNo - left.versionNo)[0];
      if (latest?.structuredContentJson === JSON.stringify(structured)) return Response.json({ ok: true, unchanged: true });
      const checks = checkWriting(writing.title, writing.recipient, writing.facts, content);
      const nextVersionNo = Math.max(0, ...versions.map((version) => version.versionNo)) + 1;
      // 说明：导出前把人工修改的区块写为 edited 版本，仅用于同一工作区追溯，不写入 documents 知识库。
      await db.insert(writingVersions).values({ id: crypto.randomUUID(), writingDocumentId: id, versionNo: nextVersionNo, stage: "edited", content, structuredContentJson: JSON.stringify(structured), checksJson: JSON.stringify(checks), createdByUserId: user.id, createdBy: user.name, createdAt: now });
      await db.update(writingDocuments).set({ documentType: structured.documentType, title: structured.title, recipient: structured.recipient, submittingDepartment: structured.submittingDepartment || writing.submittingDepartment, status: "generated", updatedAt: now }).where(eq(writingDocuments.id, id));
      await db.insert(auditLogs).values({ id: crypto.randomUUID(), action: "更新结构化公文正文", entityType: "writing_document", entityId: id, operator: user.name, detail: `V${nextVersionNo}.0｜仅工作区，不自动入库`, createdAt: now });
      return Response.json({ ok: true, checks });
    }
    const id = String(body.id || ""); const content = String(body.content || "").trim(); const requestedStage = String(body.stage || "");
    if (!id || !content || (requestedStage && requestedStage !== "final" && requestedStage !== "draft" && requestedStage !== "revised")) return Response.json({ error: "版本参数不完整" }, { status: 400 });
    const [writing] = await db.select().from(writingDocuments).where(eq(writingDocuments.id, id));
    if (!writing) return Response.json({ error: "公文草稿不存在" }, { status: 404 });
    if (!canManageWriting(user) && writing.createdByUserId !== user.id) return Response.json({ error: "只能修改自己的公文草稿" }, { status: 403 });
    const versions = await db.select().from(writingVersions).where(eq(writingVersions.writingDocumentId, id));
    const latestEditable = versions
      .filter((version) => version.stage === "draft" || version.stage === "revised")
      .sort((left, right) => right.versionNo - left.versionNo)[0];
    // 说明：普通“保存草稿”不再由前端指定 draft 或 revised。首次人工保存创建 draft，之后仅在正文变化时创建 revised；相同内容直接返回，避免一次点击或重复点击产生两条相同版本。
    const isFinal = requestedStage === "final";
    if (!isFinal && latestEditable?.content === content) {
      return Response.json({ ok: true, unchanged: true, stage: latestEditable.stage, checks: JSON.parse(latestEditable.checksJson) as string[] });
    }
    const stage = isFinal ? "final" : latestEditable ? "revised" : "draft";
    const now = new Date().toISOString(); const checks = checkWriting(writing.title, writing.recipient, writing.facts, content);
    const nextVersionNo = Math.max(0, ...versions.map((version) => version.versionNo)) + 1;
    await db.insert(writingVersions).values({ id: crypto.randomUUID(), writingDocumentId: id, versionNo: nextVersionNo, stage, content, checksJson: JSON.stringify(checks), createdByUserId: user.id, createdBy: user.name, createdAt: now });
    await db.update(writingDocuments).set({ status: stage, updatedAt: now }).where(eq(writingDocuments.id, id));
    await db.insert(auditLogs).values({ id: crypto.randomUUID(), action: stage === "final" ? "标记公文最终定稿" : "保存公文版本", entityType: "writing_document", entityId: id, operator: user.name, detail: `${stage}｜人工工作区，不自动入库`, createdAt: now });
    return Response.json({ ok: true, stage, checks });
  } catch (error) { return accessError(error, "保存公文草稿失败"); }
}
