import { desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { auditLogs, writingArtifacts, writingDocuments, writingPrivateReferences, writingVersions } from "../../../db/schema";
import { accessError, requireAccessUser } from "../../../lib/access";
import { buildOutline, buildWritingKnowledgeQuery, checkWriting, resolveWritingKnowledge, summarizePrivateReferences, WRITING_TYPES, type WritingKnowledgeRetrieval, type WritingType } from "../../../lib/writing";
import { normalizeStructuredWriting, structuredWritingToText } from "../../../lib/writing-structured";
import { generateWritingWithGateway, resolveWritingModelRuntime, type WritingGenerationResult } from "../../../lib/writing-model-gateway";

export const runtime = "edge";

function canManageWriting(user: { role: string }) { return user.role === "system_admin"; }

// 说明：把安全审计类别转换为页面可见的短提示。输入不包含模型原文，输出不会泄露提示词、私有材料或网关内部错误。
function writingGenerationError(category: WritingGenerationResult["category"]) {
  if (category === "model_disabled" || category === "model_not_configured") return "未配置可用写作模型，暂无法生成正文。";
  if (category === "model_invalid_json" || category === "model_invalid_structure" || category === "model_rejected") return "本地模型返回格式不符合要求，未生成正文，请重试。";
  if (category === "model_restricted_input") return "当前输入包含受限内容，未生成正文。";
  return "本地模型调用失败，未生成正文，请检查模型服务后重试。";
}

// 说明：读取写作网关的实际服务端运行时配置。Cloudflare 部署读取 Worker secret bindings；Vite/Miniflare 本机开发时，.env secrets 由 process.env 提供。
// 输出仅传给服务端网关，绝不返回页面、审计详情或普通日志。
function getWritingModelRuntime() {
  // Vinext/Cloudflare 的模块运行器无法可靠枚举整个 process.env；必须逐项静态读取，
  // 才能让本机 .env 的服务端变量进入 API Route，同时不会暴露给浏览器代码。
  const workerRuntime = {
    AI_MODEL_ENABLED: env.AI_MODEL_ENABLED,
    AI_GATEWAY_BASE_URL: env.AI_GATEWAY_BASE_URL,
    AI_GATEWAY_API_KEY: env.AI_GATEWAY_API_KEY,
    AI_WRITING_MODEL: env.AI_WRITING_MODEL,
    AI_MODEL_TIMEOUT_MS: env.AI_MODEL_TIMEOUT_MS,
  };
  const localRuntime = {
    AI_MODEL_ENABLED: process.env.AI_MODEL_ENABLED,
    AI_GATEWAY_BASE_URL: process.env.AI_GATEWAY_BASE_URL,
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
    AI_WRITING_MODEL: process.env.AI_WRITING_MODEL,
    AI_MODEL_TIMEOUT_MS: process.env.AI_MODEL_TIMEOUT_MS,
  };
  return resolveWritingModelRuntime(workerRuntime, localRuntime);
}

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

// 说明：记录模型生成的最小审计信息。输入为已完成权限过滤的生成结果和工作区标识，输出仅写 audit_logs，不保存正文、提示词、密钥、引用片段或私有材料内容。
async function writeWritingModelAudit(input: { db: ReturnType<typeof getDb>; user: { id: string; name: string }; writingId: string; result: WritingGenerationResult; elapsedMs: number }) {
  try {
    await input.db.insert(auditLogs).values({
      id: crypto.randomUUID(), action: "公文写作模型生成", entityType: "writing_document", entityId: input.writingId, operator: input.user.name,
      detail: `userId=${input.user.id}｜logicalModel=Qwen3.8-27B｜requestModel=${input.result.model}｜result=${input.result.mode}｜category=${input.result.category}｜elapsedMs=${input.elapsedMs}｜inputChars=${input.result.inputChars}｜outputChars=${input.result.outputChars}`,
      createdAt: new Date().toISOString(),
    });
  } catch { /* 审计故障不能让已安全生成的工作区写入失败。 */ }
}

// 记录写作时正式知识注入的最小审计。只保存是否使用、证据主键和检索状态，不保存私有材料、正文、提示词或证据文本。
async function writeWritingKnowledgeAudit(input: { db: ReturnType<typeof getDb>; user: { id: string; name: string }; writingId: string; retrieval: WritingKnowledgeRetrieval }) {
  try {
    const evidenceIds = input.retrieval.references.map((item) => `${item.documentId}/${item.versionId}/${item.chunkIndex}`).join(",") || "none";
    await input.db.insert(auditLogs).values({
      id: crypto.randomUUID(), action: "公文写作正式知识注入", entityType: "writing_document", entityId: input.writingId, operator: input.user.name,
      detail: `formalKnowledgeUsed=${input.retrieval.formalKnowledgeUsed}; evidence=${evidenceIds}; retrieval=${input.retrieval.retrievalStatus}; vector=${input.retrieval.vectorStatus}; reranker=${input.retrieval.rerankerStatus}; rerankerUsed=${input.retrieval.rerankerUsed}`,
      createdAt: new Date().toISOString(),
    });
  } catch { /* 审计故障不影响已完成权限过滤后的写作生成。 */ }
}

// 写入非正式 Writing Artifact。输入为当前工作区已成功生成的版本和最小关联标识；只写 D1 私有成果表，绝不写 documents、公共索引或 RAG。
async function createNonFormalWritingArtifact(input: { db: ReturnType<typeof getDb>; writingId: string; writingVersionId: string; user: { id: string; departmentName: string }; content: string; structuredContentJson: string; privateReferenceIds: string[]; formalEvidenceIds: string[]; now: string }) {
  await input.db.insert(writingArtifacts).values({
    id: crypto.randomUUID(), writingDocumentId: input.writingId, writingVersionId: input.writingVersionId, ownerUserId: input.user.id, ownerDepartment: input.user.departmentName,
    content: input.content, structuredContentJson: input.structuredContentJson, privateReferenceIdsJson: JSON.stringify(input.privateReferenceIds), formalEvidenceIdsJson: JSON.stringify(input.formalEvidenceIds), status: "NON_FORMAL", createdAt: input.now, updatedAt: input.now,
  });
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
      const knowledge = await resolveWritingKnowledge(user, buildWritingKnowledgeQuery({ documentType, title, recipient, facts, referenceQuery }));
      const references = knowledge.references;
      const privateReferences = await loadPrivateReferences(id);
      const outline = buildOutline(documentType, title, recipient, facts, references, privateReferences);
      // 结构化初稿只使用已确认事实、已授权正式依据和私有材料数量；网关绝不接收私有原文、文件名或无权资料。
      const startedAt = Date.now();
      const generation = await generateWritingWithGateway({ documentType, title, recipient, submittingDepartment: writing.submittingDepartment, facts, referenceQuery, references, privateReferenceGuidance: privateReferences.map((item) => ({ format: item.parseFormat, excerpt: item.excerpt, locations: item.locations })) }, getWritingModelRuntime());
      await writeWritingKnowledgeAudit({ db, user, writingId: id, retrieval: knowledge });
      // 模型失败时只记录最小审计，保留已有工作区和正文，不创建或覆盖 writing_versions。
      if (generation.mode !== "model" || !generation.content) {
        await writeWritingModelAudit({ db, user, writingId: id, result: generation, elapsedMs: Date.now() - startedAt });
        return Response.json({ error: writingGenerationError(generation.category) }, { status: 503 });
      }
      const structured = generation.structured;
      const generatedText = generation.content;
      const versions = await db.select().from(writingVersions).where(eq(writingVersions.writingDocumentId, id));
      const now = new Date().toISOString(); const checks = checkWriting(title, recipient, facts, outline);
      const nextVersionNo = Math.max(0, ...versions.map((version) => version.versionNo)) + 1;
      await db.update(writingDocuments).set({ documentType, title, recipient, facts, referenceQuery, referencesJson: "[]", status: "generated", updatedAt: now }).where(eq(writingDocuments.id, id));
      const writingVersionId = crypto.randomUUID(); const structuredContentJson = structured ? JSON.stringify(structured) : "";
      await db.insert(writingVersions).values({ id: writingVersionId, writingDocumentId: id, versionNo: nextVersionNo, stage: "generated", content: generatedText, structuredContentJson, checksJson: JSON.stringify(checks), createdByUserId: user.id, createdBy: user.name, createdAt: now });
      await createNonFormalWritingArtifact({ db, writingId: id, writingVersionId, user, content: generatedText, structuredContentJson, privateReferenceIds: privateReferences.map((item) => item.id), formalEvidenceIds: references.map((item) => `${item.documentId}/${item.versionId}/${item.chunkIndex}`), now });
      await writeWritingModelAudit({ db, user, writingId: id, result: generation, elapsedMs: Date.now() - startedAt });
      await db.insert(auditLogs).values({ id: crypto.randomUUID(), action: "更新公文提纲与引用依据", entityType: "writing_document", entityId: id, operator: user.name, detail: `${documentType}｜引用${references.length}条｜仅工作区`, createdAt: now });
      return Response.json({ id, outline, generated: structured, content: generatedText, references: [], privateReferences, checks, generation: { mode: generation.mode }, status: writing.status });
    }
    if (action === "create") {
      const documentType = String(body.documentType || "") as WritingType;
      const title = String(body.title || "").trim();
      const recipient = String(body.recipient || "").trim();
      const facts = String(body.facts || "").trim();
      const referenceQuery = String(body.referenceQuery || "").trim();
      if (!WRITING_TYPES.has(documentType) || !title) return Response.json({ error: "请选择文种并填写标题" }, { status: 400 });
      const knowledge = await resolveWritingKnowledge(user, buildWritingKnowledgeQuery({ documentType, title, recipient, facts, referenceQuery }));
      const references = knowledge.references;
      const outline = buildOutline(documentType, title, recipient, facts, references, []);
      const now = new Date().toISOString(); const id = crypto.randomUUID(); const versionId = crypto.randomUUID(); const startedAt = Date.now();
      const generation = await generateWritingWithGateway({ documentType, title, recipient, submittingDepartment: user.departmentName, facts, referenceQuery, references, privateReferenceGuidance: [] }, getWritingModelRuntime());
      await writeWritingKnowledgeAudit({ db, user, writingId: id, retrieval: knowledge });
      // 首次模型失败不创建 writing_documents 或 writing_versions，避免失败时留下模拟或空白正文。
      if (generation.mode !== "model" || !generation.content) {
        await writeWritingModelAudit({ db, user, writingId: id, result: generation, elapsedMs: Date.now() - startedAt });
        return Response.json({ error: writingGenerationError(generation.category) }, { status: 503 });
      }
      const structured = generation.structured;
      const generatedText = generation.content;
      const checks = checkWriting(title, recipient, facts, outline);
      await db.insert(writingDocuments).values({ id, documentType, title, submittingDepartment: user.departmentName, recipient, facts, referenceQuery, referencesJson: "[]", status: "outline", createdByUserId: user.id, createdBy: user.name, createdAt: now, updatedAt: now });
      const structuredContentJson = structured ? JSON.stringify(structured) : "";
      await db.insert(writingVersions).values({ id: versionId, writingDocumentId: id, versionNo: 1, stage: "generated", content: generatedText, structuredContentJson, checksJson: JSON.stringify(checks), createdByUserId: user.id, createdBy: user.name, createdAt: now });
      await createNonFormalWritingArtifact({ db, writingId: id, writingVersionId: versionId, user, content: generatedText, structuredContentJson, privateReferenceIds: [], formalEvidenceIds: references.map((item) => `${item.documentId}/${item.versionId}/${item.chunkIndex}`), now });
      await writeWritingModelAudit({ db, user, writingId: id, result: generation, elapsedMs: Date.now() - startedAt });
      await db.insert(auditLogs).values({ id: crypto.randomUUID(), action: "创建公文提纲", entityType: "writing_document", entityId: id, operator: user.name, detail: `${documentType}｜引用${references.length}条｜仅工作区`, createdAt: now });
      return Response.json({ id, outline, generated: structured, content: generatedText, references: [], privateReferences: [], checks, generation: { mode: generation.mode }, status: "generated" }, { status: 201 });
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
