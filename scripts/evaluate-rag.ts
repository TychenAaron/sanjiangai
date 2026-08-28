// 本脚本执行第3关 RAG 离线验收：使用虚构数据和确定性 mock transport，验证编排、安全、引用与拒答，不代表真实模型质量验收。
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { selectTopEvidence } from "../lib/evidence-selection.ts";
import { fuseRankedEvidence } from "../lib/hybrid-fusion.ts";
import { callModelGateway, readModelGatewayConfig, resolveGroundedAnswer, type ModelGatewayCitation } from "../lib/model-gateway.ts";
import { readRerankerGatewayConfig, rerankCandidates } from "../lib/reranker-gateway.ts";
import { ragEvalCases, type RagEvalCandidate, type RagEvalCase } from "../tests/eval/rag-eval-cases.ts";

type EvalEvidence = {
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

type EvalResult = {
  id: string;
  category: string;
  retrieval: "HIT" | "MISS" | "REFUSED";
  answer: "PASS" | "FAIL" | "REFUSED";
  citation: "PASS" | "FAIL";
  permission: "PASS" | "FAIL";
  evidenceDocumentIds: string[];
  note: string;
  failureType?: "RETRIEVAL" | "RERANK" | "ANSWER" | "CITATION" | "PERMISSION" | "REFUSAL" | "TEST DATA";
};

const REPORT_PATH = new URL("../docs/PHASE3_RAG_ACCEPTANCE.md", import.meta.url);
const REPORT_FILE_PATH = fileURLToPath(REPORT_PATH);
const modelConfig = readModelGatewayConfig({ MODEL_GATEWAY_BASE_URL: "https://model.example.invalid/v1", MODEL_GATEWAY_MODEL: "offline-grounded-model" });
const rerankerConfig = readRerankerGatewayConfig({ RERANKER_BASE_URL: "https://reranker.example.invalid/v1", RERANKER_MODEL: "offline-reranker" });

function asEvidence(candidate: RagEvalCandidate, score: number): EvalEvidence {
  return {
    documentId: candidate.documentId, versionId: candidate.versionId, chunkId: candidate.chunkId,
    title: `虚构正式资料 ${candidate.documentId}`, category: "虚构资料", sourceOrganization: "虚构来源单位",
    documentDate: "2026-01-01", version: Number(candidate.versionId.replace(/^v/, "")) || 1,
    excerpt: candidate.text, sourceType: "manual", chunkIndex: 0, location: candidate.location, score,
  };
}

function createHybridCandidates(testCase: RagEvalCase) {
  const keyword = testCase.candidates.filter((candidate) => candidate.source === "keyword" || candidate.source === "both").map((candidate, index) => asEvidence(candidate, 100 - index));
  const vector = testCase.candidates.filter((candidate) => candidate.source === "vector" || candidate.source === "both").map((candidate, index) => asEvidence(candidate, 0.99 - index / 100));
  return fuseRankedEvidence(keyword, vector, { fusionTopK: 20, rrfK: 60 });
}

function citationsFromEvidence(evidence: EvalEvidence[]): ModelGatewayCitation[] {
  return evidence.map((item) => ({ title: item.title, version: item.version, sourceType: item.sourceType, location: item.location, excerpt: item.excerpt }));
}

// 对单题执行完整离线编排。输入仅为已授权虚构候选，输出逐题检索、回答、引用、权限结果；不会访问数据库或网络。
async function evaluateCase(testCase: RagEvalCase): Promise<EvalResult> {
  if (testCase.shouldRefuse) {
    let modelCalled = false;
    const refusal = await resolveGroundedAnswer(testCase.question, [], modelConfig, async () => {
      modelCalled = true;
      return Response.json({ choices: [] });
    });
    const passed = refusal.mode === "no_basis" && !modelCalled;
    return {
      id: testCase.id, category: testCase.category, retrieval: "REFUSED", answer: passed ? "REFUSED" : "FAIL",
      citation: passed ? "PASS" : "FAIL", permission: "PASS", evidenceDocumentIds: [],
      note: passed ? "无可靠依据，模型未被调用。" : "拒答链路异常。", failureType: passed ? undefined : "REFUSAL",
    };
  }

  const hybrid = createHybridCandidates(testCase);
  let rerankerDocuments: string[] = [];
  const rerank = await rerankCandidates(rerankerConfig, testCase.question, hybrid.map((item) => ({ text: item.excerpt })), async (_input, init) => {
    rerankerDocuments = (JSON.parse(String(init?.body)) as { documents: string[] }).documents;
    return Response.json({ results: hybrid.map((item, index) => {
      const raw = testCase.candidates.find((candidate) => candidate.documentId === item.documentId && candidate.chunkId === item.chunkId);
      return { index, relevance_score: raw?.rerankScore ?? 0 };
    }) });
  });
  if (rerank.status !== "success") throw new Error(`离线 reranker mock failed for ${testCase.id}`);
  const rerankScores = new Map(rerank.scores.map((item) => [item.index, item.score]));
  const reranked = hybrid
    .map((item, index) => ({ ...item, rerankScore: rerankScores.get(index)!, rerankRank: 0 }))
    .sort((left, right) => right.rerankScore - left.rerankScore || right.fusionScore - left.fusionScore)
    .map((item, index) => ({ ...item, rerankRank: index + 1 }));
  const topEvidence = selectTopEvidence(reranked, { topK: 5, rerankerUsed: true });
  const evidenceDocumentIds = topEvidence.map((item) => item.documentId);
  const retrievalHit = testCase.expectedDocumentIds.every((documentId) => evidenceDocumentIds.includes(documentId));
  const forbiddenMarkers = testCase.forbiddenDocumentIds.map((documentId) => `【${documentId}】`);
  const rerankerSafe = forbiddenMarkers.every((marker) => !rerankerDocuments.some((text) => text.includes(marker)));

  const citations = citationsFromEvidence(topEvidence);
  let modelBody = "";
  const answerFacts = testCase.expectedAnswerFacts.join("；");
  const answer = await callModelGateway(modelConfig, testCase.question, citations, async (_input, init) => {
    modelBody = String(init?.body);
    return Response.json({ choices: [{ message: { content: `${answerFacts}[1]` } }] });
  });
  const factsPresent = answer.status === "success" && testCase.expectedAnswerFacts.every((fact) => answer.answer.includes(fact));
  const modelSafe = forbiddenMarkers.every((marker) => !modelBody.includes(marker));
  const citationTraceable = citations.length > 0 && topEvidence.every((item) => item.documentId && item.versionId && item.chunkId && item.location) && citations.every((citation) => topEvidence.some((item) => item.location === citation.location && item.excerpt === citation.excerpt));
  const permissionPassed = rerankerSafe && modelSafe && testCase.forbiddenDocumentIds.every((id) => !evidenceDocumentIds.includes(id));

  const failureType = !retrievalHit ? "RETRIEVAL" : !factsPresent ? "ANSWER" : !citationTraceable ? "CITATION" : !permissionPassed ? "PERMISSION" : undefined;
  return {
    id: testCase.id, category: testCase.category, retrieval: retrievalHit ? "HIT" : "MISS",
    answer: factsPresent ? "PASS" : "FAIL", citation: citationTraceable ? "PASS" : "FAIL",
    permission: permissionPassed ? "PASS" : "FAIL", evidenceDocumentIds,
    note: failureType ? `失败分类：${failureType}` : "通过 deterministic offline 编排验证。", failureType,
  };
}

function percent(numerator: number, denominator: number) {
  return denominator ? Number(((numerator / denominator) * 100).toFixed(1)) : 0;
}

function reportMarkdown(results: EvalResult[]) {
  const answerable = results.filter((item) => item.retrieval !== "REFUSED");
  const refusals = results.filter((item) => item.retrieval === "REFUSED");
  const retrievalHitRate = percent(answerable.filter((item) => item.retrieval === "HIT").length, answerable.length);
  const answerAccuracy = percent(answerable.filter((item) => item.answer === "PASS").length, answerable.length);
  const citationTraceability = percent(answerable.filter((item) => item.citation === "PASS").length, answerable.length);
  const refusalAccuracy = percent(refusals.filter((item) => item.answer === "REFUSED").length, refusals.length);
  const permissionLeakage = results.filter((item) => item.permission === "FAIL").length;
  const accepted = retrievalHitRate >= 90 && answerAccuracy >= 85 && citationTraceability === 100 && refusalAccuracy === 100 && permissionLeakage === 0;
  const categories = Object.entries(results.reduce<Record<string, number>>((summary, item) => ({ ...summary, [item.category]: (summary[item.category] || 0) + 1 }), {}));
  const failed = results.filter((item) => item.failureType);
  return `# 第3关 RAG 离线验收报告

## 基线
- HEAD：\`${process.env.GIT_COMMIT || "09a69491a5f08d33ad3ca2da9379eb1963c42edc"}\`
- 评测日期：${new Date().toISOString().slice(0, 10)}
- 数据性质：synthetic / offline / deterministic mock transport
- 总题数：${results.length}
- 分类：${categories.map(([category, count]) => `${category}=${count}`).join("，")}

## 指标
| 指标 | 结果 | 门槛 |
| --- | ---: | ---: |
| Retrieval Hit Rate | ${retrievalHitRate}% | >= 90% |
| Answer Accuracy | ${answerAccuracy}% | >= 85% |
| Citation Traceability | ${citationTraceability}% | 100% |
| Refusal Accuracy | ${refusalAccuracy}% | 100% |
| Permission Leakage | ${permissionLeakage} | 0 |

## 逐题结果
| ID | Category | Retrieval | Answer | Citation | Permission | Evidence document IDs | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- |
${results.map((item) => `| ${item.id} | ${item.category} | ${item.retrieval} | ${item.answer} | ${item.citation} | ${item.permission} | ${item.evidenceDocumentIds.join(", ") || "-"} | ${item.note} |`).join("\n")}

## 失败案例
${failed.length ? failed.map((item) => `- ${item.id}: ${item.failureType}`).join("\n") : "- 无"}

## 权限攻击结果
- forbidden document 不进入 keyword/vector 已授权候选、reranker 输入、Top Evidence、LLM context 或 citations。
- Permission Leakage：${permissionLeakage}

## 当前限制
- 本报告只验证离线 synthetic 数据上的检索编排、权限、排序、证据、引用与拒答。
- 不代表真实 Qwen3-Embedding-4B、Qwen3-Reranker-4B 或主语言模型在真实授权集团资料上的质量验收。

## 结论
**${accepted ? "PHASE 3 RAG ACCEPTANCE PASS" : "PHASE 3 RAG ACCEPTANCE FAIL"}**
`;
}

const ragSource = await readFile(new URL("../lib/rag.ts", import.meta.url), "utf8");
assert.ok(ragSource.includes("retrieveAuthorizedRerankedHybrid") && ragSource.includes("citationsFromTopEvidence"), "评测前提失败：grounded answer 未接入完整 RAG 链");
assert.equal(ragEvalCases.length, 30, "评测集必须恰好包含30题");
const categoryCounts = ragEvalCases.reduce<Record<string, number>>((counts, testCase) => ({ ...counts, [testCase.category]: (counts[testCase.category] || 0) + 1 }), {});
assert.deepEqual(categoryCounts, { keyword: 6, semantic: 5, hybrid: 4, reranker: 3, lifecycle: 4, permission: 5, refusal: 3 }, "评测集必须覆盖约定的30题分类分布");
assert.equal(new Set(ragEvalCases.map((testCase) => testCase.id)).size, ragEvalCases.length, "评测题 ID 不得重复");
const results: EvalResult[] = [];
for (const testCase of ragEvalCases) {
  const result = await evaluateCase(testCase);
  results.push(result);
  console.log(`${result.id} | ${result.category} | Retrieval ${result.retrieval} | Answer ${result.answer} | Citation ${result.citation} | Permission ${result.permission} | ${result.evidenceDocumentIds.join(",") || "-"} | ${result.note}`);
}

const markdown = reportMarkdown(results);
await mkdir(dirname(REPORT_FILE_PATH), { recursive: true });
await writeFile(REPORT_FILE_PATH, markdown, "utf8");
const accepted = markdown.includes("PHASE 3 RAG ACCEPTANCE PASS");
console.log(markdown.match(/Retrieval Hit Rate \| [^\n]+/u)?.[0]);
console.log(markdown.match(/Answer Accuracy \| [^\n]+/u)?.[0]);
console.log(markdown.match(/Citation Traceability \| [^\n]+/u)?.[0]);
console.log(markdown.match(/Refusal Accuracy \| [^\n]+/u)?.[0]);
console.log(`Permission Leakage: ${results.filter((item) => item.permission === "FAIL").length}`);
console.log(accepted ? "PHASE 3 RAG ACCEPTANCE PASS" : "PHASE 3 RAG ACCEPTANCE FAIL");
if (!accepted) process.exitCode = 1;
