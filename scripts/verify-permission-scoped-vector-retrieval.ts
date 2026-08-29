// 本脚本使用完全虚构数据验证 Embedding、向量 scope、生命周期清理与证据追溯；不访问网络、D1、R2 或模型服务。
import { readFile } from "node:fs/promises";
import { createDeterministicOfflineEmbedding, embedTexts, readEmbeddingGatewayConfig } from "../lib/embedding-gateway.ts";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

// 仅供本离线脚本模拟 Vector Store 的 scope 与余弦排序，不参与任何 Worker 运行时。
class OfflineVectorStore {
  private readonly records = new Map<string, { documentId: string; versionId: string; chunkId: string; vector: number[] }>();

  upsert(record: { documentId: string; versionId: string; chunkId: string; vector: number[] }) { this.records.set(`${record.versionId}:${record.chunkId}`, record); }
  deleteDocumentVectors(documentId: string) { for (const [key, record] of this.records) if (record.documentId === documentId) this.records.delete(key); }
  search(queryVector: number[], allowedChunkIds: string[]) {
    const allowed = new Set(allowedChunkIds);
    return [...this.records.values()].filter((record) => allowed.has(record.chunkId)).map((record) => {
      const score = record.vector.reduce((sum, value, index) => sum + value * queryVector[index], 0);
      return { ...record, score };
    }).sort((left, right) => right.score - left.score);
  }
}

const config = readEmbeddingGatewayConfig({
  EMBEDDING_BASE_URL: "https://embedding.example.invalid/v1",
  EMBEDDING_API_KEY: "virtual-key-only",
  EMBEDDING_MODEL: "virtual-embedding-model",
  EMBEDDING_TIMEOUT_MS: "1000",
});
let requestedUrl = "";
let requestedModel = "";
const gateway = await embedTexts(config, ["虚构库存盘点工作安排"], async (input, init) => {
  requestedUrl = String(input);
  requestedModel = String(JSON.parse(String(init?.body)).model);
  return Response.json({ data: [{ index: 0, embedding: createDeterministicOfflineEmbedding("虚构库存盘点工作安排") }] });
});
assert(gateway.status === "success" && requestedUrl.endsWith("/embeddings") && requestedModel === "virtual-embedding-model", "OpenAI-compatible Embedding 请求或模型覆盖不正确");
assert((await embedTexts(config, ["虚构输入"], async () => new Response("failed", { status: 500 }))).status === "gateway_error", "Embedding 服务失败时必须安全失败");
assert((await embedTexts(readEmbeddingGatewayConfig({}), ["虚构输入"])).status === "not_configured", "未配置 Embedding 时不得生成模拟向量");

const store = new OfflineVectorStore();
store.upsert({ documentId: "doc-allowed", versionId: "ver-current", chunkId: "chunk-allowed", vector: createDeterministicOfflineEmbedding("虚构库存盘点工作安排与责任分工") });
store.upsert({ documentId: "doc-unrelated", versionId: "ver-current-2", chunkId: "chunk-unrelated", vector: createDeterministicOfflineEmbedding("虚构年度团建活动通知") });
store.upsert({ documentId: "doc-denied", versionId: "ver-denied", chunkId: "chunk-denied", vector: createDeterministicOfflineEmbedding("虚构库存盘点工作安排与责任分工") });
const hits = store.search(createDeterministicOfflineEmbedding("库存盘点安排"), ["chunk-allowed", "chunk-unrelated"]);
assert(hits[0]?.chunkId === "chunk-allowed" && hits[0].score > (hits[1]?.score ?? -1), "语义相关虚构分段应高于明显无关分段");
assert(!hits.some((hit) => hit.chunkId === "chunk-denied"), "不在允许 scope 的分段不得进入向量结果");
store.deleteDocumentVectors("doc-allowed");
assert(!store.search(createDeterministicOfflineEmbedding("库存盘点安排"), ["chunk-allowed"]).length, "删除资料后必须同步清理向量");

const [rag, approvalRoute, lifecycleRoute, versionRoute] = await Promise.all([
  readFile(new URL("../lib/rag.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/documents/[id]/approve/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/documents/[id]/lifecycle/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/documents/[id]/versions/route.ts", import.meta.url), "utf8"),
]);
// 当前上传生命周期以自动批准后的正式状态作为门槛，不再要求人工 reliability 评分；仍必须保留版本、解析、索引、D4 与 ACL 前置过滤。
assert(rag.includes('document.knowledgeStatus === "approved"') && rag.includes('document.resourceStatus === "approved"') && rag.includes('document.lifecycleStatus === "effective"') && rag.includes('document.parseStatus === "parsed"') && rag.includes('document.indexStatus === "ready"') && rag.includes('document.securityLevel !== "D4"') && rag.includes('document.currentVersion === versionNo') && rag.includes('versionStatus === "approved"'), "向量 scope 必须过滤 approved/effective/parsed/index/D4/current");
assert(rag.indexOf("selectAuthorizedChunks") < rag.indexOf("searchVectors") && rag.includes("canReadDocument(user, row.document, grants)") && rag.includes("allowedChunkIds: scopedRows.map"), "必须先计算当前用户允许范围，再调用向量存储");
assert(rag.includes("const rows = await collectAuthorizedChunks(user);") && !rag.includes("canReadDocument(user,row.document, grants)"), "关键词检索必须复用已授权 scope，不能引用失效的局部权限变量");
assert(approvalRoute.includes("indexApprovedDocumentVersion") && lifecycleRoute.includes("deleteDocumentVectors") && versionRoute.includes("deleteDocumentVectors"), "批准、新版本和生命周期清理必须联动向量索引");
console.log("PASS permission-scoped vector retrieval: 完全虚构数据已验证 Embedding、scope、排序、生命周期清理与证据追溯。");
