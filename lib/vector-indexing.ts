// 本文件负责把已审批正式资料的既有分段写入向量存储；它不解析文件、不改变资料生命周期。
import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../db";
import { documentChunks } from "../db/schema";
import { embedTexts, readEmbeddingGatewayConfig, type EmbeddingRuntime } from "./embedding-gateway";
import { DevD1VectorStore, type VectorStore } from "./vector-store";

export type VectorIndexResult = {
  status: "ready" | "pending" | "failed";
  count: number;
  reason?: "not_configured" | "timeout" | "gateway_error" | "invalid_response";
};

const EMBEDDING_BATCH_SIZE = 24;

// 为一个已获批准版本创建真实 Embedding。输入为文档/版本 ID；只读取 document_chunks，失败时清理本版本向量且不写入模拟数据。
export async function indexApprovedDocumentVersion(
  documentId: string,
  versionId: string,
  runtime: EmbeddingRuntime = env as unknown as EmbeddingRuntime,
  store: VectorStore = new DevD1VectorStore(),
): Promise<VectorIndexResult> {
  const config = readEmbeddingGatewayConfig(runtime);
  // 新版审批或重复审批前先移除同一资料的旧向量，确保旧版本永远不能继续作为 current evidence。
  await store.deleteDocumentVectors(documentId);
  if (!config.configured) return { status: "pending", count: 0, reason: "not_configured" };

  const chunks = await getDb().select().from(documentChunks)
    .where(and(eq(documentChunks.documentId, documentId), eq(documentChunks.versionId, versionId)))
    .orderBy(documentChunks.chunkIndex);
  if (!chunks.length) return { status: "failed", count: 0, reason: "invalid_response" };

  try {
    for (let offset = 0; offset < chunks.length; offset += EMBEDDING_BATCH_SIZE) {
      const batch = chunks.slice(offset, offset + EMBEDDING_BATCH_SIZE);
      const result = await embedTexts(config, batch.map((chunk) => chunk.content));
      if (result.status !== "success") {
        await store.deleteDocumentVectors(documentId);
        return { status: "failed", count: 0, reason: result.status };
      }
      await Promise.all(batch.map((chunk, index) => store.upsertEmbedding({
        id: crypto.randomUUID(), documentId, versionId, chunkId: chunk.id, model: config.model, vector: result.vectors[index],
      })));
    }
    return { status: "ready", count: chunks.length };
  } catch {
    await store.deleteDocumentVectors(documentId);
    return { status: "failed", count: 0, reason: "gateway_error" };
  }
}
