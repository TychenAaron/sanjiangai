// 管理员批量资料导入的批次账本工具：只记录文件处理结果，不保存正文或 R2 存储键。
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { knowledgeImportBatches, knowledgeImportItems } from "../db/schema";

export type ImportItemResult = {
  batchId: string;
  clientFileKey: string;
  fileName: string;
  fileSize: number;
  mimeType?: string;
  status: "succeeded" | "failed" | "skipped";
  reason?: string;
  documentId?: string;
  versionId?: string;
  parseStatus?: string;
  chunkCount?: number;
  indexStatus?: string;
};

/**
 * 保存一个批次中文件的最终处理结果。
 * 输入为已完成预检或上传的最小元数据；输出为无返回值。只写 knowledge_import_items，绝不写正文或存储密钥。
 */
export async function recordKnowledgeImportItem(result: ImportItemResult) {
  const db = getDb();
  const now = new Date().toISOString();
  await db.insert(knowledgeImportItems).values({
    id: crypto.randomUUID(), batchId: result.batchId, clientFileKey: result.clientFileKey, fileName: result.fileName, fileSize: result.fileSize,
    mimeType: result.mimeType || null, status: result.status, reason: result.reason || null, documentId: result.documentId || null, versionId: result.versionId || null,
    parseStatus: result.parseStatus || null, chunkCount: result.chunkCount || 0, indexStatus: result.indexStatus || null, createdAt: now, completedAt: now,
  }).onConflictDoUpdate({
    target: [knowledgeImportItems.batchId, knowledgeImportItems.clientFileKey],
    set: { status: result.status, reason: result.reason || null, documentId: result.documentId || null, versionId: result.versionId || null, parseStatus: result.parseStatus || null, chunkCount: result.chunkCount || 0, indexStatus: result.indexStatus || null, completedAt: now },
  });
}

/**
 * 根据逐文件结果重新计算批次汇总并在完成时封存时间。
 * 输入为批次 ID 和是否完成；输出为最新批次记录。只读写批次及其结果表，不能影响 documents 生命周期。
 */
export async function refreshKnowledgeImportBatch(batchId: string, completed = false) {
  const db = getDb();
  const [counts] = await db.select({
    successCount: sql<number>`sum(case when ${knowledgeImportItems.status} = 'succeeded' then 1 else 0 end)`,
    failedCount: sql<number>`sum(case when ${knowledgeImportItems.status} = 'failed' then 1 else 0 end)`,
    skippedCount: sql<number>`sum(case when ${knowledgeImportItems.status} = 'skipped' then 1 else 0 end)`,
  }).from(knowledgeImportItems).where(eq(knowledgeImportItems.batchId, batchId));
  const now = new Date().toISOString();
  await db.update(knowledgeImportBatches).set({
    successCount: Number(counts?.successCount || 0), failedCount: Number(counts?.failedCount || 0), skippedCount: Number(counts?.skippedCount || 0),
    status: completed ? "completed" : "uploading", completedAt: completed ? now : null,
  }).where(eq(knowledgeImportBatches.id, batchId));
  return db.query.knowledgeImportBatches.findFirst({ where: (table, { eq: equals }) => equals(table.id, batchId) });
}
