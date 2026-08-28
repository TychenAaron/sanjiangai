// 本脚本离线验证 RRF 混合检索：仅使用完全虚构候选，不连接 D1、模型、OA 或外部向量服务。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fuseRankedEvidence } from "../lib/hybrid-fusion.ts";

type FixtureEvidence = {
  documentId: string;
  versionId: string;
  chunkId: string;
  score: number;
  title: string;
};

const keyword: FixtureEvidence[] = [
  { documentId: "doc-alpha", versionId: "v1", chunkId: "chunk-a", score: 28, title: "虚构关键词资料" },
  { documentId: "doc-beta", versionId: "v1", chunkId: "chunk-b", score: 18, title: "虚构补充资料" },
];
const vector: FixtureEvidence[] = [
  { documentId: "doc-alpha", versionId: "v1", chunkId: "chunk-a", score: 0.96, title: "虚构关键词资料" },
  { documentId: "doc-gamma", versionId: "v1", chunkId: "chunk-c", score: 0.84, title: "虚构语义资料" },
];

// 验证 RRF 以排名融合、跨分支相同 chunk 去重，并保留来源与原始分数供 API 追溯。
const fused = fuseRankedEvidence(keyword, vector, { rrfK: 60, fusionTopK: 8 });
assert.equal(fused.length, 3, "相同 document/version/chunk 必须只保留一条");
const shared = fused.find((item) => item.chunkId === "chunk-a");
assert.ok(shared, "两路都命中的虚构 chunk 应保留");
assert.deepEqual(shared.retrievalSources, ["keyword", "vector"]);
assert.equal(shared.keywordRank, 1);
assert.equal(shared.vectorRank, 1);
assert.equal(shared.keywordScore, 28);
assert.equal(shared.vectorSimilarity, 0.96);
assert.ok(shared.fusionScore > (fused.find((item) => item.chunkId === "chunk-b")?.fusionScore || 0), "双路命中应得到更高 RRF 分数");
assert.ok(fused.some((item) => item.chunkId === "chunk-c" && item.retrievalSources.includes("vector")), "语义单路候选必须保留");

// 向量网关不可用时，空向量输入等价于关键词降级，不得丢弃已经授权的关键词候选。
const keywordOnly = fuseRankedEvidence(keyword, [], { fusionTopK: 8 });
assert.equal(keywordOnly.length, 2);
assert.ok(keywordOnly.every((item) => item.retrievalSources.length === 1 && item.retrievalSources[0] === "keyword"));
assert.deepEqual(fuseRankedEvidence([], [], { fusionTopK: 8 }), [], "两路均无候选时必须返回空 evidence");

// 静态核验服务端先建立授权 scope，再分别检索和融合；不允许全库召回后再过滤。
const [ragSource, routeSource] = await Promise.all([
  readFile(new URL("../lib/rag.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/knowledge/search/route.ts", import.meta.url), "utf8"),
]);
for (const required of [
  "collectAuthorizedChunks(user)",
  "retrieveKeywordWithinScope(scopedRows, query",
  "retrieveVectorWithinScope(scopedRows, query",
  "isFormalEvidenceDocument",
  "canReadDocument",
  "securityLevel !== \"D4\"",
  "reliabilityScore >= 60",
  "fuseRankedEvidence(keywordEvidence, vector.evidence",
]) assert.ok(ragSource.includes(required), `缺少正式资料或权限融合保护：${required}`);
assert.ok(routeSource.includes('body.mode === "hybrid"'), "搜索 API 必须提供显式 hybrid 模式");
assert.ok(routeSource.includes("permission_scoped_hybrid"), "API 必须标注权限范围内融合结果");

console.log("Hybrid knowledge retrieval verification passed.");
