// 本脚本离线验证完整 RAG 取证到 grounded answer 链路；使用虚构候选与 mock transport，不连接 D1、模型、OA 或外部服务。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { selectTopEvidence } from "../lib/evidence-selection.ts";
import { fuseRankedEvidence } from "../lib/hybrid-fusion.ts";
import { callModelGateway, readModelGatewayConfig, resolveGroundedAnswer, type ModelGatewayCitation } from "../lib/model-gateway.ts";
import { readRerankerGatewayConfig, rerankCandidates } from "../lib/reranker-gateway.ts";

type FixtureEvidence = {
  documentId: string;
  versionId: string;
  chunkId: string;
  title: string;
  category: string;
  sourceOrganization: string | null;
  documentDate: string | null;
  version: number;
  excerpt: string;
  sourceType: string;
  chunkIndex: number;
  location: string;
  score: number;
};

const allowedKeyword: FixtureEvidence[] = [
  { documentId: "doc-keyword", versionId: "v1", chunkId: "chunk-keyword", title: "虚构盘点通知", category: "正式通知", sourceOrganization: "虚构单位", documentDate: "2026-01-01", version: 1, excerpt: "虚构盘点工作的一般安排。", sourceType: "manual", chunkIndex: 0, location: "第1段", score: 24 },
];
const allowedVector: FixtureEvidence[] = [
  { documentId: "doc-semantic", versionId: "v3", chunkId: "chunk-semantic", title: "虚构盘点方案", category: "工作方案", sourceOrganization: "虚构单位", documentDate: "2026-01-02", version: 3, excerpt: "虚构库存盘点的责任分工、复核和差异处理步骤。", sourceType: "manual", chunkIndex: 2, location: "第3段", score: 0.94 },
];
const forbiddenEvidence = { ...allowedVector[0], documentId: "doc-d4-or-denied", chunkId: "chunk-d4-or-denied", excerpt: "D4、旧版本或无权的虚构高相似资料。" };

// CASE 1/2/3/4/5：权限过滤后的 keyword/vector 候选融合后才重排；未授权、D4、旧版本候选不在 reranker 输入中。
const hybrid = fuseRankedEvidence(allowedKeyword, allowedVector, { fusionTopK: 20, rrfK: 60 });
const rerankerConfig = readRerankerGatewayConfig({ RERANKER_BASE_URL: "https://reranker.example.invalid/v1", RERANKER_MODEL: "virtual-reranker" });
let rerankerDocuments: string[] = [];
const reranked = await rerankCandidates(rerankerConfig, "虚构库存盘点如何复核", hybrid.map((candidate) => ({ text: candidate.excerpt })), async (_input, init) => {
  rerankerDocuments = (JSON.parse(String(init?.body)) as { documents: string[] }).documents;
  return Response.json({ results: [{ index: 1, relevance_score: 0.99 }, { index: 0, relevance_score: 0.30 }] });
});
assert.equal(reranked.status, "success");
assert.ok(!rerankerDocuments.includes(forbiddenEvidence.excerpt), "unauthorized evidence reaches reranker = NO");
if (reranked.status !== "success") throw new Error("虚构重排必须成功");
const rerankScores = new Map(reranked.scores.map((item) => [item.index, item.score]));
const rankedEvidence = hybrid
  .map((candidate, index) => ({ ...candidate, rerankScore: rerankScores.get(index)!, rerankRank: 0 }))
  .sort((left, right) => right.rerankScore - left.rerankScore)
  .map((candidate, index) => ({ ...candidate, rerankRank: index + 1 }));
const topEvidence = selectTopEvidence(rankedEvidence, { topK: 1, rerankerUsed: true });
assert.equal(topEvidence[0]?.chunkId, "chunk-semantic", "弱关键词但语义匹配的候选可经 vector + rerank 成为最终 evidence");

const topCitations: ModelGatewayCitation[] = topEvidence.map((item) => ({ title: item.title, version: item.version, sourceType: item.sourceType, location: item.location, excerpt: item.excerpt }));
const modelConfig = readModelGatewayConfig({ MODEL_GATEWAY_BASE_URL: "https://model.example.invalid/v1", MODEL_GATEWAY_MODEL: "virtual-grounded-model" });
let modelBody = "";
const answer = await callModelGateway(modelConfig, "虚构库存盘点如何复核", topCitations, async (_input, init) => {
  modelBody = String(init?.body);
  return Response.json({ choices: [{ message: { content: "应按责任分工和复核步骤执行。[1]" } }] });
});
assert.equal(answer.status, "success");
assert.ok(modelBody.includes(allowedVector[0].excerpt), "最终 Top Evidence 必须进入 grounded LLM context");
assert.ok(!modelBody.includes(allowedKeyword[0].excerpt) && !modelBody.includes(forbiddenEvidence.excerpt), "unauthorized evidence reaches LLM context = NO，且非 Top Evidence 不得进入上下文");
const tolerantAnswer = await callModelGateway(modelConfig, "虚构格式兼容问题", topCitations, async () => Response.json({ choices: [{ message: { content: "本机虚构模型返回的连续正文。" } }] }));
assert.equal(tolerantAnswer.status, "success", "非空连续正文不应因未带模型编号而被误判为网关失败");

// CASE 6：Embedding 故障时，空向量分支仍能以关键词候选形成最终 evidence 并供 grounded answer 使用。
const keywordFallback = fuseRankedEvidence(allowedKeyword, [], { fusionTopK: 20, rrfK: 60 });
assert.equal(selectTopEvidence(keywordFallback, { topK: 5, rerankerUsed: false })[0]?.chunkId, "chunk-keyword");
// CASE 7：Reranker 失败时，候选池不变且按 RRF fusion 顺序选择。
assert.equal((await rerankCandidates(rerankerConfig, "虚构问题", [{ text: "虚构文本" }], async () => new Response("failed", { status: 500 }))).status, "gateway_error");
assert.equal(selectTopEvidence(hybrid, { topK: 1, rerankerUsed: false })[0]?.chunkId, "chunk-keyword");

// CASE 8：没有可靠 evidence 时直接返回标准拒答，mock model transport 不得被调用。
let modelCalledWithoutEvidence = false;
const refusal = await resolveGroundedAnswer("虚构无依据问题", [], modelConfig, async () => {
  modelCalledWithoutEvidence = true;
  return Response.json({ choices: [] });
});
assert.equal(refusal.mode, "no_basis");
assert.equal(modelCalledWithoutEvidence, false, "无 reliable evidence 时不得调用模型猜答案");
// CASE 9：模型 citations 仅为 Top Evidence，模型输出引用编号也只能落在该范围。
assert.equal(topCitations.length, 1);
assert.ok(answer.status === "success" && answer.answer.includes("[1]"));

// CASE 10/11：新会话请求仍经 answerKnowledge，持久化与历史 citation 失效复核继续沿用原有实现。
const [ragSource, askSource, conversationsSource] = await Promise.all([
  readFile(new URL("../lib/rag.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/knowledge/ask/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/knowledge-conversations.ts", import.meta.url), "utf8"),
]);
for (const required of [
  "const retrieval = await retrieveAuthorizedRerankedHybrid(user, query)",
  "const citations = citationsFromTopEvidence(retrieval.evidence)",
  "return answerFromCitations(query, citations, history)",
  "const hybrid = await retrieveAuthorizedHybrid(user, query",
  "candidates.map((candidate) => ({ text: candidate.excerpt }))",
  "document.securityLevel !== \"D4\"",
  "document.currentVersion === versionNo",
  "canReadDocument(user, row.document, grants)",
]) assert.ok(ragSource.includes(required), `完整 RAG 链缺少安全或取证步骤：${required}`);
assert.ok(askSource.includes("answerKnowledge(user, query, history)") && askSource.includes("saveConversationExchange"), "会话新回答必须使用新 RAG 链并持久化");
assert.ok(conversationsSource.includes("citationAvailable") && conversationsSource.includes("当前无权查看"), "历史 citation 失效复核不得回归");

console.log("Full RAG grounded answer verification passed.");
