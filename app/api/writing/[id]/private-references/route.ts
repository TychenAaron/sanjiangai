// 本接口管理单个公文工作区的私有参考材料：原文件写入专用私有 R2，解析摘要仅供当前工作区使用。
import { env } from "cloudflare:workers";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { auditLogs, writingDocuments, writingPrivateReferences } from "../../../../../db/schema";
import { AccessError, accessError, requireAccessUser } from "../../../../../lib/access";
import { findBlockedMatches } from "../../../../../lib/upload-control";
import { parseWritingReference } from "../../../../../lib/writing-reference-parser";
import { summarizePrivateReferences } from "../../../../../lib/writing";

export const runtime = "edge";

type BucketObject = { arrayBuffer: () => Promise<ArrayBuffer> };
type Bucket = {
  put: (key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }) => Promise<unknown>;
  get: (key: string) => Promise<BucketObject | null>;
  delete: (key: string) => Promise<unknown>;
};

const MAX_PRIVATE_REFERENCES = 3;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const SUPPORTED_FORMATS = new Set(["txt", "md", "csv", "tsv", "doc", "docx", "xls", "xlsx", "ppt", "pptx"]);

// 说明：统一核验创建人或系统管理员权限，普通员工不能借文件 ID 读取、上传或删除他人的私有材料。
async function requireWritingAccess(request: Request, writingId: string) {
  const user = await requireAccessUser(request);
  const db = getDb();
  const [writing] = await db.select().from(writingDocuments).where(eq(writingDocuments.id, writingId));
  if (!writing) throw new AccessError(404, "公文工作区不存在");
  if (user.role !== "system_admin" && writing.createdByUserId !== user.id) return { db, user, writing: null };
  return { db, user, writing };
}

// 说明：只返回页面需要的摘要，不返回 R2 存储键和原文件内容，避免私有材料跨工作区泄露。
function toSummary(rows: Array<typeof writingPrivateReferences.$inferSelect>) {
  return summarizePrivateReferences(rows.map((row) => ({
    id: row.id, fileName: row.fileName,
    parseStatus: row.parseStatus as "parsed" | "pending_conversion" | "pending_ocr" | "failed",
    parseFormat: row.parseFormat, parseReason: row.parseReason, parsedText: row.parsedText, locationsJson: row.locationsJson,
  })));
}

// 请求流程：验证工作区权限后读取 D1 的当前工作区记录；返回结果不含私有 R2 地址或存储键。
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { db, writing } = await requireWritingAccess(request, id);
    if (!writing) return Response.json({ error: "无权查看该公文的私有参考材料" }, { status: 403 });
    const rows = await db.select().from(writingPrivateReferences).where(eq(writingPrivateReferences.writingDocumentId, id)).orderBy(desc(writingPrivateReferences.updatedAt));
    return Response.json({ privateReferences: toSummary(rows) });
  } catch (error) { return accessError(error, "读取私有参考材料失败"); }
}

// 请求流程：先解析并检查禁止词与文件级别，全部通过后才写私有 R2；D1 写入失败时精确删除本次 R2 对象。
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let bucket: Bucket | undefined;
  let storageKey: string | undefined;
  let databaseWritten = false;
  try {
    const { id } = await context.params;
    const { db, user, writing } = await requireWritingAccess(request, id);
    if (!writing) return Response.json({ error: "只能为自己的公文上传私有参考材料" }, { status: 403 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "请选择要上传的私有参考材料" }, { status: 400 });
    const securityLevel = String(form.get("securityLevel") || "internal").toLowerCase();
    // 安全限制：机密材料不进入当前在线私有材料链路，管理员也不能绕过。
    if (securityLevel === "confidential" || securityLevel === "机密") return Response.json({ error: "confidential 机密材料不得通过当前私有参考材料入口上传" }, { status: 403 });
    if (file.size > MAX_FILE_SIZE) return Response.json({ error: "私有参考材料单文件不能超过 5MB" }, { status: 400 });
    const format = file.name.split(".").pop()?.toLowerCase() || "";
    if (!SUPPORTED_FORMATS.has(format)) return Response.json({ error: "仅支持 txt、md、csv、tsv、doc、docx、xls、xlsx、ppt、pptx 格式" }, { status: 400 });
    const existing = await db.select({ id: writingPrivateReferences.id }).from(writingPrivateReferences).where(eq(writingPrivateReferences.writingDocumentId, id));
    if (existing.length >= MAX_PRIVATE_REFERENCES) return Response.json({ error: "每份公文最多上传 3 个私有参考材料，第 4 个文件已拒绝" }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const parsed = await parseWritingReference({ fileName: file.name, mimeType: file.type || "application/octet-stream", buffer });
    // 安全限制：禁止词检查发生在任何 D1/R2 写入之前；旧版 doc/ppt 只检查文件名，绝不伪造正文。
    const blocked = await findBlockedMatches({ fileName: file.name, content: parsed.text });
    if (blocked.length) {
      // 命中后直接返回，严格保证本次请求不向 D1（包括审计表）或私有 R2 写入任何内容。
      return Response.json({ error: "文件命中后台禁止词条，未保存原文件或解析结果" }, { status: 400 });
    }

    bucket = (env as unknown as { WRITING_REFERENCES_BUCKET?: Bucket }).WRITING_REFERENCES_BUCKET;
    if (!bucket) throw new Error("私有参考材料 R2 尚未配置");
    const referenceId = crypto.randomUUID();
    const now = new Date().toISOString();
    // 存储键固定隔离在 writing-references/，不允许使用公共 documents 的 trial/ 或其他前缀。
    storageKey = `writing-references/${id}/${referenceId}/${encodeURIComponent(file.name)}`;
    await bucket.put(storageKey, buffer, { httpMetadata: { contentType: file.type || "application/octet-stream" }, customMetadata: { writingDocumentId: id, referenceId, uploadedBy: user.id } });
    await db.insert(writingPrivateReferences).values({
      id: referenceId, writingDocumentId: id, fileName: file.name, mimeType: file.type || "application/octet-stream", fileSize: file.size, storageKey,
      parseFormat: parsed.format, parseStatus: parsed.status, parsedText: parsed.text, locationsJson: JSON.stringify(parsed.locations), parseReason: parsed.reason || null,
      createdByUserId: user.id, createdBy: user.name, createdAt: now, updatedAt: now,
    });
    databaseWritten = true;
    try { await db.insert(auditLogs).values({ id: crypto.randomUUID(), action: "上传公文私有参考材料", entityType: "writing_document", entityId: id, operator: user.name, detail: `${file.name} · ${parsed.status} · 仅当前工作区可见`, createdAt: now }); } catch { /* 审计故障不回滚已完成的主写入。 */ }
    const [saved] = await db.select().from(writingPrivateReferences).where(eq(writingPrivateReferences.id, referenceId));
    return Response.json({ privateReference: toSummary([saved])[0] }, { status: 201 });
  } catch (error) {
    // R2 成功而 D1 插入失败时，仅删除本请求刚创建的唯一对象，绝不按前缀批量删除。
    if (!databaseWritten && bucket && storageKey) {
      try { await bucket.delete(storageKey); } catch { /* 保留原始失败原因。 */ }
    }
    return accessError(error, "上传私有参考材料失败");
  }
}

// 请求流程：先删私有 R2 对象再删 D1；若 D1 删除失败则恢复同一个对象，避免半删除状态。
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const referenceId = new URL(request.url).searchParams.get("referenceId") || "";
    if (!referenceId) return Response.json({ error: "缺少要删除的私有参考材料 ID" }, { status: 400 });
    const { db, user, writing } = await requireWritingAccess(request, id);
    if (!writing) return Response.json({ error: "只能删除自己公文的私有参考材料" }, { status: 403 });
    const [reference] = await db.select().from(writingPrivateReferences).where(and(eq(writingPrivateReferences.id, referenceId), eq(writingPrivateReferences.writingDocumentId, id)));
    if (!reference) return Response.json({ error: "私有参考材料不存在" }, { status: 404 });
    if (!reference.storageKey.startsWith("writing-references/")) return Response.json({ error: "私有材料存储键异常，已拒绝删除" }, { status: 409 });
    const bucket = (env as unknown as { WRITING_REFERENCES_BUCKET?: Bucket }).WRITING_REFERENCES_BUCKET;
    if (!bucket) throw new Error("私有参考材料 R2 尚未配置");
    const original = await bucket.get(reference.storageKey);
    if (!original) return Response.json({ error: "私有 R2 原文件不存在，拒绝删除 D1 记录以便人工核查" }, { status: 409 });
    const originalBytes = await original.arrayBuffer();
    await bucket.delete(reference.storageKey);
    try { await db.delete(writingPrivateReferences).where(eq(writingPrivateReferences.id, reference.id)); }
    catch (error) { await bucket.put(reference.storageKey, originalBytes, { httpMetadata: { contentType: reference.mimeType } }); throw error; }
    try { await db.insert(auditLogs).values({ id: crypto.randomUUID(), action: "删除公文私有参考材料", entityType: "writing_document", entityId: id, operator: user.name, detail: `${reference.fileName} 已同步删除 D1 记录与私有 R2 原文件`, createdAt: new Date().toISOString() }); } catch { /* 删除已完成，审计故障不影响返回。 */ }
    return Response.json({ ok: true, id: reference.id });
  } catch (error) { return accessError(error, "删除私有参考材料失败"); }
}
