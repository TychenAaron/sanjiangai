// 管理员重解析与重建知识索引：从受 ACL 保护的 R2 原文件重建当前版本内容、分段和向量，不改变正式资料审批或权限。
import { env } from "cloudflare:workers";
import { and, eq, ne } from "drizzle-orm";
import { getDb } from "../../../../db";
import { documentChunks, documents, documentVersions } from "../../../../db/schema";
import { accessError, canManageFormalDocuments, requireAccessUser } from "../../../../lib/access";
import { extractDocumentBytes, indexDocumentVersion } from "../../../../lib/ingestion";
import { indexApprovedDocumentVersion } from "../../../../lib/vector-indexing";
import { DevD1VectorStore } from "../../../../lib/vector-store";

export const runtime = "edge";
type BucketObject = { arrayBuffer: () => Promise<ArrayBuffer> };
type Bucket = { get: (key: string) => Promise<BucketObject | null> };
type RebuildRequest = { documentIds?: string[]; datasetId?: string; reparse?: boolean };

/**
 * 受控重建入口。
 * 输入为资料管理角色选择的文档/资料集及是否从原文件重新解析；输出仅包含计数和状态，不返回正文、R2 key 或向量。
 * 读取 documents、document_versions、document_chunks 与 R2；只更新当前版本解析内容和索引状态，ACL/D1-D4/批准状态保持不变。
 */
export async function POST(request: Request) {
  try {
    const user = await requireAccessUser(request); if (!canManageFormalDocuments(user)) return Response.json({ error: "仅资料管理角色可重建知识索引" }, { status: 403 });
    const body = await request.json().catch(() => ({})) as RebuildRequest;
    const db = getDb(); let rows = await db.select({ document: documents, version: documentVersions }).from(documents).innerJoin(documentVersions, and(eq(documentVersions.documentId, documents.id), eq(documentVersions.versionNo, documents.currentVersion))).where(and(eq(documents.knowledgeStatus, "approved"), eq(documents.resourceStatus, "approved"), eq(documents.lifecycleStatus, "effective"), ne(documents.securityLevel, "D4"), eq(documentVersions.versionStatus, "approved")));
    if (body.datasetId) rows = rows.filter(row => row.document.datasetId === body.datasetId); if (body.documentIds?.length) rows = rows.filter(row => body.documentIds!.includes(row.document.id));
    const store = new DevD1VectorStore(); const bucket = (env as unknown as { BUCKET?: Bucket }).BUCKET;
    let ready = 0; let pending = 0; let failed = 0; let reparsed = 0;
    for (const row of rows) {
      let content = row.version.content; let parseStatus = row.document.parseStatus; let parseReason: string | null = null;
      if (body.reparse && row.document.storageKey && row.document.fileName) {
        const source = await bucket?.get(row.document.storageKey);
        if (!source) { failed += 1; await db.update(documents).set({ parseStatus: "failed", indexStatus: "pending", vectorStatus: "failed", updatedAt: new Date().toISOString() }).where(eq(documents.id, row.document.id)); continue; }
        const extracted = await extractDocumentBytes({ fileName: row.document.fileName, mimeType: row.document.mimeType || undefined, buffer: await source.arrayBuffer() });
        parseStatus = extracted.parseStatus; parseReason = extracted.parseReason; content = extracted.content; reparsed += 1;
        await db.update(documentVersions).set({ content, changeSummary: "重新解析原文件并重建知识索引" }).where(eq(documentVersions.id, row.version.id));
      }
      if (parseStatus !== "parsed") {
        await db.delete(documentChunks).where(eq(documentChunks.versionId, row.version.id)); await store.deleteDocumentVectors(row.document.id);
        await db.update(documents).set({ parseStatus, indexStatus: "pending", vectorStatus: "pending", reviewNote: parseReason || row.document.reviewNote, updatedAt: new Date().toISOString() }).where(eq(documents.id, row.document.id));
        pending += 1; continue;
      }
      await indexDocumentVersion(row.document.id, row.version.id, content, { title: row.document.title });
      const result = await indexApprovedDocumentVersion(row.document.id, row.version.id);
      await db.update(documents).set({ parseStatus: "parsed", indexStatus: "ready", vectorStatus: result.status, reviewNote: parseReason, updatedAt: new Date().toISOString() }).where(eq(documents.id, row.document.id));
      if (result.status === "ready") ready += 1; else if (result.status === "pending") pending += 1; else failed += 1;
    }
    return Response.json({ total: rows.length, reparsed, ready, pending, failed });
  } catch (error) { return accessError(error, "重建知识索引失败"); }
}
