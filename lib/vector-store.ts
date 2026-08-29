// 本文件定义可替换的向量存储接口；当前 D1 实现仅用于开发阶段 exact cosine scan，后续可替换为 Qdrant。
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { documentEmbeddings } from "../db/schema";
import { splitVectorLookupChunkIds } from "./vector-lookup-batches";

export type VectorRecord = {
  id: string;
  documentId: string;
  versionId: string;
  chunkId: string;
  model: string;
  vector: number[];
};

export type VectorHit = Pick<VectorRecord, "documentId" | "versionId" | "chunkId" | "model"> & { score: number };

export interface VectorStore {
  upsertEmbedding(record: VectorRecord): Promise<void>;
  deleteDocumentVectors(documentId: string): Promise<void>;
  deleteVersionVectors(versionId: string): Promise<void>;
  searchVectors(input: { queryVector: number[]; allowedChunkIds: string[]; topK: number }): Promise<VectorHit[]>;
}

function validVector(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

// 计算余弦相似度。输入必须是同维有限向量；无效输入返回最低分而非猜测结果。
export function cosineSimilarity(left: number[], right: number[]) {
  if (!validVector(left) || !validVector(right) || left.length !== right.length) return -1;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  return leftMagnitude && rightMagnitude ? dot / Math.sqrt(leftMagnitude * rightMagnitude) : -1;
}

function parseStoredVector(value: string) {
  try {
    const parsed = JSON.parse(value);
    return validVector(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// D1 开发存储只按调用方给出的已授权 chunk 范围读取向量，绝不执行全库候选扫描。
export class DevD1VectorStore implements VectorStore {
  async upsertEmbedding(record: VectorRecord) {
    if (!validVector(record.vector)) throw new Error("Embedding vector is invalid");
    const db = getDb();
    await db.insert(documentEmbeddings).values({
      id: record.id,
      documentId: record.documentId,
      versionId: record.versionId,
      chunkId: record.chunkId,
      model: record.model,
      vectorJson: JSON.stringify(record.vector),
      createdAt: new Date().toISOString(),
    }).onConflictDoUpdate({
      target: [documentEmbeddings.versionId, documentEmbeddings.chunkId],
      set: { model: record.model, vectorJson: JSON.stringify(record.vector), createdAt: new Date().toISOString() },
    });
  }

  async deleteDocumentVectors(documentId: string) {
    await getDb().delete(documentEmbeddings).where(eq(documentEmbeddings.documentId, documentId));
  }

  async deleteVersionVectors(versionId: string) {
    await getDb().delete(documentEmbeddings).where(eq(documentEmbeddings.versionId, versionId));
  }

  async searchVectors({ queryVector, allowedChunkIds, topK }: { queryVector: number[]; allowedChunkIds: string[]; topK: number }) {
    if (!validVector(queryVector) || !allowedChunkIds.length || topK <= 0) return [];
    const db = getDb();
    const rows = [] as Array<typeof documentEmbeddings.$inferSelect>;
    // SQLite 参数数量有限，按 D1 安全批次查询；每一批仍由上层已授权 chunk ID 严格限定。
    for (const ids of splitVectorLookupChunkIds(allowedChunkIds)) {
      rows.push(...await db.select().from(documentEmbeddings).where(inArray(documentEmbeddings.chunkId, ids)));
    }
    return rows
      .map((row) => ({ row, vector: parseStoredVector(row.vectorJson) }))
      .filter((item): item is { row: typeof documentEmbeddings.$inferSelect; vector: number[] } => item.vector !== null)
      .map(({ row, vector }) => ({ documentId: row.documentId, versionId: row.versionId, chunkId: row.chunkId, model: row.model, score: cosineSimilarity(queryVector, vector) }))
      .filter((item) => item.score > -1)
      .sort((left, right) => right.score - left.score)
      .slice(0, Math.min(topK, 50));
  }
}

// 仅供离线虚构验证的内存实现，用来验证 scope 与排序，不参与 Worker 运行时。
export class InMemoryVectorStore implements VectorStore {
  private readonly records = new Map<string, VectorRecord>();

  async upsertEmbedding(record: VectorRecord) { this.records.set(`${record.versionId}:${record.chunkId}`, record); }
  async deleteDocumentVectors(documentId: string) { for (const [key, record] of this.records) if (record.documentId === documentId) this.records.delete(key); }
  async deleteVersionVectors(versionId: string) { for (const [key, record] of this.records) if (record.versionId === versionId) this.records.delete(key); }
  async searchVectors({ queryVector, allowedChunkIds, topK }: { queryVector: number[]; allowedChunkIds: string[]; topK: number }) {
    const allowed = new Set(allowedChunkIds);
    return [...this.records.values()]
      .filter((record) => allowed.has(record.chunkId))
      .map((record) => ({ documentId: record.documentId, versionId: record.versionId, chunkId: record.chunkId, model: record.model, score: cosineSimilarity(queryVector, record.vector) }))
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);
  }
}
