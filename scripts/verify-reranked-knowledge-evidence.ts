// 本脚本离线验证 Reranker Gateway、Hybrid 候选重排和 Top Evidence 选择；只使用虚构文本，不连接 D1、模型、OA 或外部服务。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readEvidenceSelectionConfig, selectTopEvidence } from "../lib/evidence-selection.ts";
import { readRerankerGatewayConfig, rerankCandidates } from "../lib/reranker-gateway.ts";

type FixtureEvidence = {
  documentId: string;
  versionId: string;
  chunkId: string;
  location: string;
  excerpt: string;
  fusionScore: number;
  retrievalSources: string[];
  keywordRank?: number;
  vectorRank?: number;
};

const allowedCandidates: FixtureEvidence[] = [
  { documentId: "doc-alpha", versionId: "v1", chunkId: "chunk-a", location: "第1段", excerpt: "虚构的通用工作安排。", fusionScore: 0.032, retrievalSources: ["keyword"], keywordRank: 1 },
  { documentId: "doc-beta", versionId: "v2", chunkId: "chunk-b", location: "第2段", excerpt: "虚构的库存盘点责任分工和复核步骤。", fusionScore: 0.031, retrievalSources: ["vector"], vectorRank: 2 },
  { documentId: "doc-gamma", versionId: "v1", chunkId: "chunk-c", location: "工作表盘点!A2", excerpt: "虚构的资料归档要求。", fusionScore: 0.029, retrievalSources: ["keyword", "vector"], keywordRank: 3, vectorRank: 3 },
];
const deniedCandidate = { ...allowedCandidates[0], documentId: "doc-denied", chunkId: "chunk-denied", excerpt: "无权虚构资料" };
const config = readRerankerGatewayConfig({
  RERANKER_BASE_URL: "https://reranker.example.invalid/v1",
  RERANKER_API_KEY: "virtual-key-only",
  RERANKER_MODEL: "virtual-reranker",
  RERANKER_PATH: "/rerank",
  RERANKER_TIMEOUT_MS: "1000",
});
let requestedUrl = "";
let requestedModel = "";
let sentDocuments: string[] = [];

// CASE 1/2/3/10：mock 仅接收已授权候选，并把原融合第一名之外的更相关候选提升到第一名。
const rerank = await rerankCandidates(config, "虚构库存盘点", allowedCandidates.map((candidate) => ({ text: candidate.excerpt })), async (input, init) => {
  requestedUrl = String(input);
  const body = JSON.parse(String(init?.body)) as { model: string; documents: string[] };
  requestedModel = body.model;
  sentDocuments = body.documents;
  return Response.json({ results: [
    { index: 1, relevance_score: 0.98 },
    { index: 0, relevance_score: 0.42 },
    { index: 2, relevance_score: 0.31 },
  ] });
});
assert.equal(rerank.status, "success");
assert.ok(requestedUrl.endsWith("/v1/rerank") && requestedModel === "virtual-reranker");
assert.deepEqual(sentDocuments, allowedCandidates.map((candidate) => candidate.excerpt));
assert.ok(!sentDocuments.includes(deniedCandidate.excerpt), "NO unauthorized candidate reaches reranker");
if (rerank.status !== "success") throw new Error("虚构 reranker 应返回成功结果");
const scores = new Map(rerank.scores.map((item) => [item.index, item.score]));
const reranked = allowedCandidates
  .map((candidate, index) => ({ ...candidate, rerankScore: scores.get(index)!, rerankRank: 0 }))
  .sort((left, right) => right.rerankScore - left.rerankScore)
  .map((candidate, index) => ({ ...candidate, rerankRank: index + 1 }));
assert.equal(reranked[0]?.chunkId, "chunk-b", "reranker 必须能提升最相关候选");
assert.equal(reranked.length, allowedCandidates.length, "重排不能创建或丢失候选");
assert.equal(reranked[0]?.documentId, "doc-beta");
assert.equal(reranked[0]?.versionId, "v2");
assert.equal(reranked[0]?.location, "第2段");
assert.deepEqual(reranked[0]?.retrievalSources, ["vector"]);

// CASE 9/11：Top K 受集中配置控制，空候选仍为空。
const selectionConfig = readEvidenceSelectionConfig({ RERANK_CANDIDATE_LIMIT: "20", RERANK_TOP_K: "2" });
const selected = selectTopEvidence(reranked, { topK: selectionConfig.topK, rerankerUsed: true });
assert.equal(selected.length, 2);
assert.equal(selected[0]?.chunkId, "chunk-b");
assert.deepEqual(selectTopEvidence([], { topK: 5, rerankerUsed: false }), []);

// CASE 5/6/7/8：失败时没有伪造重排分数，改按融合分数选择相同候选池中的 Top Evidence。
const fallback = selectTopEvidence(allowedCandidates, { topK: 2, rerankerUsed: false });
assert.deepEqual(fallback.map((candidate) => candidate.chunkId), ["chunk-a", "chunk-b"]);
assert.equal((await rerankCandidates(readRerankerGatewayConfig({}), "虚构问题", [{ text: "虚构文本" }])).status, "not_configured");
assert.equal((await rerankCandidates(config, "虚构问题", [{ text: "虚构文本" }], async () => new Response("failed", { status: 500 }))).status, "gateway_error");
assert.equal((await rerankCandidates(config, "虚构问题", [{ text: "虚构文本" }], async () => Response.json({ results: [{ index: 9, relevance_score: 1 }] }))).status, "invalid_response");
assert.equal((await rerankCandidates({ ...config, timeoutMs: 1 }, "虚构问题", [{ text: "虚构文本" }], async (_input, init) => new Promise((_resolve, reject) => {
  init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
}))).status, "timeout");

// 静态验证 RAG 只能把 Hybrid 已授权输出送往重排，并保留正式资料、D4、版本和 ACL 过滤在前。
const [ragSource, routeSource] = await Promise.all([
  readFile(new URL("../lib/rag.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/knowledge/search/route.ts", import.meta.url), "utf8"),
]);
for (const required of [
  "const hybrid = await retrieveAuthorizedHybrid(user, query",
  "candidates.map((candidate) => ({ text: candidate.excerpt }))",
  "selectTopEvidence(candidates, { topK: selectionConfig.topK, rerankerUsed: false })",
  "document.securityLevel !== \"D4\"",
  "document.currentVersion === versionNo",
  "canReadDocument(user, row.document, grants)",
]) assert.ok(ragSource.includes(required), `缺少 Reranker 权限或降级保护：${required}`);
assert.ok(routeSource.includes("retrieveAuthorizedRerankedHybrid"), "Hybrid API 必须使用重排后的 Top Evidence");

console.log("Reranked knowledge evidence verification passed.");
