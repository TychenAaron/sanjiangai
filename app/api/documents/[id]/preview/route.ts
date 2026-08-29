// 正式知识资源预览接口：复用 document ACL 后返回当前版本的安全预览数据，绝不下发 R2 key。
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { documentAcl, documents, documentVersions, knowledgeDatasets } from "../../../../../db/schema";
import { accessError, canReadDocument, requireAccessUser } from "../../../../../lib/access";
import { buildDocumentPreview } from "../../../../../lib/document-preview";

export const runtime = "edge";
type BucketObject = { arrayBuffer: () => Promise<ArrayBuffer> };
type Bucket = { get: (key: string) => Promise<BucketObject | null> };

// 说明：读取一份当前资料的预览。输入为文档 ID 和当前登录用户；输出只含获授权的元数据、当前版本和预览数据，不含原始存储地址或 R2 key。
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAccessUser(request); const id = (await context.params).id; const db = getDb();
    const [[document], grants] = await Promise.all([db.select().from(documents).where(eq(documents.id, id)).limit(1), db.select().from(documentAcl)]);
    if (!document) return Response.json({ error: "资料不存在" }, { status: 404 });
    if (!canReadDocument(user, document, grants)) return Response.json({ error: "无权预览该资料" }, { status: 403 });
    // 预览必须对应 documents.currentVersion，不能把尚未生效的新版本误展示为当前正式资料。
    const [version] = await db.select().from(documentVersions).where(and(eq(documentVersions.documentId, id), eq(documentVersions.versionNo, document.currentVersion))).limit(1);
    if (!version) return Response.json({ error: "资料当前没有可预览版本" }, { status: 404 });
    const [dataset] = document.datasetId ? await db.select().from(knowledgeDatasets).where(eq(knowledgeDatasets.id, document.datasetId)).limit(1) : [];
    let buffer: ArrayBuffer | undefined;
    if (document.storageKey && document.fileName && document.parseStatus === "parsed" && !/\.pdf$/i.test(document.fileName)) {
      const object = await (env as unknown as { BUCKET?: Bucket }).BUCKET?.get(document.storageKey);
      if (object) buffer = await object.arrayBuffer();
    }
    const preview = buildDocumentPreview({ fileName: document.fileName || document.title, buffer, fallbackText: version.content, parseStatus: document.parseStatus });
    return Response.json({
      document: { id: document.id, title: document.title, fileName: document.fileName, mimeType: document.mimeType, createdAt: document.createdAt, createdBy: document.createdBy, securityLevel: document.securityLevel, resourceStatus: document.resourceStatus, lifecycleStatus: document.lifecycleStatus, parseStatus: document.parseStatus, datasetName: dataset?.name || null },
      version: { id: version.id, versionNo: version.versionNo, createdAt: version.createdAt }, preview,
      fileUrl: document.storageKey ? `/api/documents/${encodeURIComponent(document.id)}/file` : null,
    });
  } catch (error) { return accessError(error, "读取资料预览失败"); }
}
