import { and, eq, ne, gte } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../db";
import { documentAcl, documentChunks, documents, documentVersions } from "../db/schema";
import { AccessUser, canReadDocument } from "./access";
import {
  publicModelGatewayStatus,
  callModelGateway,
  readModelGatewayConfig,
  resolveGroundedAnswer,
  type ModelGatewayCitation,
} from "./model-gateway";
import { embedTexts, readEmbeddingGatewayConfig } from "./embedding-gateway";
import { DevD1VectorStore, type VectorStore } from "./vector-store";
import { fuseRankedEvidence, HYBRID_RETRIEVAL_DEFAULTS, type FusedEvidence } from "./hybrid-fusion";
import { readEvidenceSelectionConfig, selectTopEvidence } from "./evidence-selection";
import { readRerankerGatewayConfig, rerankCandidates } from "./reranker-gateway";

// 完整标准化问题命中时会额外获得 12 分，因此默认可靠依据门槛也使用 12 分。
// 这要求候选资料至少包含完整提问，或累积足够多个关键词命中，避免单个弱关键词触发回答。
const DEFAULT_MIN_RELIABLE_SCORE = 12;

export type KnowledgeCitation = {
  documentId: string;
  versionId: string;
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

type AuthorizedChunkRow = {
  chunk: typeof documentChunks.$inferSelect;
  document: typeof documents.$inferSelect;
  versionId: string;
  versionNo: number;
  versionStatus: string;
};

export type VectorKnowledgeEvidence = KnowledgeCitation & { chunkId: string };
export type HybridKnowledgeEvidence = FusedEvidence<VectorKnowledgeEvidence>;
export type RerankedKnowledgeEvidence = HybridKnowledgeEvidence & { rerankScore?: number; rerankRank?: number };

// 判断资料是否满足正式 evidence 门槛。输入是已从 D1 读取的资料元数据，输出不涉及正文或模型调用。
export function isFormalEvidenceDocument(document: typeof documents.$inferSelect, versionNo: number, versionStatus: string) {
  return document.knowledgeStatus === "approved" &&
    document.resourceStatus === "approved" &&
    document.lifecycleStatus === "effective" &&
    document.parseStatus === "parsed" &&
    document.indexStatus === "ready" &&
    document.securityLevel !== "D4" &&
    document.reliabilityScore >= 60 &&
    document.currentVersion === versionNo &&
    versionStatus === "approved";
}

// 从候选资料中建立当前用户可访问的正式 chunk 范围。权限在任何关键词或向量评分之前执行。
export function selectAuthorizedChunks(user: AccessUser, rows: AuthorizedChunkRow[], grants: typeof documentAcl.$inferSelect[]) {
  return rows.filter((row) => isFormalEvidenceDocument(row.document, row.versionNo, row.versionStatus) && canReadDocument(user, row.document, grants));
}

function terms(input: string) {
  const normalized = input.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const result = new Set<string>();
  if (normalized.length <= 4) result.add(normalized);
  for (let size = 2; size <= Math.min(4, normalized.length); size += 1) {
    for (let i = 0; i <= normalized.length - size; i += 1) result.add(normalized.slice(i, i + size));
  }
  for (const token of input.toLowerCase().match(/[a-z0-9]{2,}/g) || []) result.add(token);
  return [...result].filter(Boolean).slice(0, 80);
}

function relevance(query: string, content: string) {
  const haystack = content.toLowerCase();
  const queryTerms = terms(query);
  let score = 0;
  for (const term of queryTerms) {
    if (!haystack.includes(term)) continue;
    score += term.length >= 4 ? 4 : term.length === 3 ? 2.4 : 1;
  }
  if (haystack.includes(query.toLowerCase().replace(/\s+/g, ""))) score += 12;
  return score;
}

// 说明：读取关键词检索的最低可靠分，输入是本机或部署环境中的可选配置，输出是有效的分数门槛。
// 默认值与完整问题命中的 12 分加分保持一致；非法或过低配置不会放宽门槛，防止弱匹配被当作可靠依据。
function minimumReliableScore() {
  const configured = Number((env as Record<string, unknown>).RAG_MIN_RELIABLE_SCORE);
  if (Number.isFinite(configured) && configured >= DEFAULT_MIN_RELIABLE_SCORE && configured <= 100) {
    return configured;
  }
  return DEFAULT_MIN_RELIABLE_SCORE;
}

export async function collectAuthorizedChunks(user: AccessUser) {
  const db = getDb();
  const [grants, rows] = await Promise.all([
    db.select().from(documentAcl),
    db.select({
      chunk: documentChunks,
      document: documents,
      versionId: documentVersions.id,
      versionNo: documentVersions.versionNo,
      versionStatus: documentVersions.versionStatus,
    }).from(documentChunks)
      .innerJoin(documents, eq(documentChunks.documentId, documents.id))
      .innerJoin(documentVersions, eq(documentChunks.versionId, documentVersions.id))
      // 正式检索只读取已批准、有效、非 D4 且可靠性达标的当前版本；其余状态即使已有分段也不会参与评分或模型输入。
      .where(and(eq(documents.knowledgeStatus, "approved"), eq(documents.resourceStatus, "approved"), eq(documents.lifecycleStatus, "effective"), eq(documents.parseStatus, "parsed"), eq(documents.indexStatus, "ready"), ne(documents.securityLevel, "D4"), gte(documents.reliabilityScore, 60), eq(documentVersions.versionStatus, "approved")))
      .limit(3000),
  ]);
  return selectAuthorizedChunks(user, rows, grants);
}

function toKnowledgeEvidence(row: AuthorizedChunkRow, score: number): VectorKnowledgeEvidence {
  return {
    documentId: row.document.id, versionId: row.versionId, chunkId: row.chunk.id, title: row.document.title,
    category: row.document.resourceCategory, sourceOrganization: row.document.sourceOrganization, documentDate: row.document.documentDate,
    version: row.versionNo, excerpt: row.chunk.content.slice(0, 520), sourceType: row.document.sourceType,
    chunkIndex: row.chunk.chunkIndex, location: `第${row.chunk.chunkIndex + 1}段`, score,
  };
}

// 在已授权范围内执行原有关键词评分。输入已完成正式资料和 ACL 过滤，输出仅为候选排序，不读写数据库。
function retrieveKeywordWithinScope(rows: AuthorizedChunkRow[], query: string, topK = 5) {
  const reliableScore = minimumReliableScore();
  return rows
    // 说明：collectAuthorizedChunks 已在关键词评分之前完成当前账号的角色、部门、数据级别和 ACL 过滤。
    .map(row => ({ ...row, score: relevance(query, row.chunk.content) }))
    // 说明：权限通过后仍需达到可解释的可靠依据门槛，单个弱关键词命中不能触发问答。
    .filter(row => row.score >= reliableScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export async function retrieveAuthorized(user: AccessUser, query: string) {
  const rows = await collectAuthorizedChunks(user);
  return retrieveKeywordWithinScope(rows, query);
}

// 在已授权 chunk scope 内执行开发阶段 exact cosine retrieval。Embedding 未配置或失败时返回空 evidence，绝不伪造结果。
export async function retrieveAuthorizedVector(
  user: AccessUser,
  query: string,
  options: { topK?: number; store?: VectorStore } = {},
): Promise<{ status: "success" | "no_scope" | "not_configured" | "timeout" | "gateway_error" | "invalid_response"; evidence: VectorKnowledgeEvidence[] }> {
  return retrieveVectorWithinScope(await collectAuthorizedChunks(user), query, options);
}

// 在同一已授权范围内执行向量召回。调用方负责先取得 scope，避免融合路径重复查询或先全库向量检索。
async function retrieveVectorWithinScope(
  scopedRows: AuthorizedChunkRow[],
  query: string,
  options: { topK?: number; store?: VectorStore } = {},
): Promise<{ status: "success" | "no_scope" | "not_configured" | "timeout" | "gateway_error" | "invalid_response"; evidence: VectorKnowledgeEvidence[] }> {
  if (!scopedRows.length) return { status: "no_scope", evidence: [] };

  const config = readEmbeddingGatewayConfig(env as unknown as Record<string, string | undefined>);
  const embedding = await embedTexts(config, [query]);
  if (embedding.status !== "success") return { status: embedding.status, evidence: [] };

  // 调用向量存储前 scope 已同时完成 approved/effective/current/parsed/reliability/D4 与 ACL 过滤。
  const hits = await (options.store || new DevD1VectorStore()).searchVectors({
    queryVector: embedding.vectors[0],
    allowedChunkIds: scopedRows.map((row) => row.chunk.id),
    topK: options.topK || 5,
  });
  const rowsByChunkId = new Map(scopedRows.map((row) => [row.chunk.id, row]));
  return {
    status: "success",
    evidence: hits.flatMap((hit) => {
      const row = rowsByChunkId.get(hit.chunkId);
      if (!row) return [];
      return [toKnowledgeEvidence(row, Number(hit.score.toFixed(6)))];
    }),
  };
}

// 将同一权限范围内的关键词与向量候选按 RRF 排名融合。向量网关不可用时仅返回关键词候选，并显式标注降级状态。
export async function retrieveAuthorizedHybrid(
  user: AccessUser,
  query: string,
  options: { keywordTopK?: number; vectorTopK?: number; fusionTopK?: number; rrfK?: number; store?: VectorStore } = {},
): Promise<{ status: "hybrid" | "keyword_only" | "no_evidence"; vectorStatus: "success" | "no_scope" | "not_configured" | "timeout" | "gateway_error" | "invalid_response"; evidence: HybridKnowledgeEvidence[] }> {
  // 必须先建立当前用户的正式授权 scope，两个召回分支均不能跨越这个范围。
  const scopedRows = await collectAuthorizedChunks(user);
  const keywordRows = retrieveKeywordWithinScope(scopedRows, query, options.keywordTopK ?? HYBRID_RETRIEVAL_DEFAULTS.keywordTopK);
  const keywordEvidence = keywordRows.map((row) => toKnowledgeEvidence(row, Number(row.score.toFixed(1))));
  const vector = await retrieveVectorWithinScope(scopedRows, query, {
    topK: options.vectorTopK ?? HYBRID_RETRIEVAL_DEFAULTS.vectorTopK,
    store: options.store,
  });
  const evidence = fuseRankedEvidence(keywordEvidence, vector.evidence, {
    fusionTopK: options.fusionTopK ?? HYBRID_RETRIEVAL_DEFAULTS.fusionTopK,
    rrfK: options.rrfK ?? HYBRID_RETRIEVAL_DEFAULTS.rrfK,
  });
  if (!evidence.length) return { status: "no_evidence", vectorStatus: vector.status, evidence };
  return { status: vector.status === "success" ? "hybrid" : "keyword_only", vectorStatus: vector.status, evidence };
}

// 对已授权且已融合去重的 Hybrid 候选执行可选重排，并选择最终引用证据。失败仅按 RRF 顺序降级，绝不扩大候选范围或伪造分数。
export async function retrieveAuthorizedRerankedHybrid(
  user: AccessUser,
  query: string,
): Promise<{
  retrievalStatus: "hybrid" | "keyword_only" | "no_evidence";
  vectorStatus: "success" | "no_scope" | "not_configured" | "timeout" | "gateway_error" | "invalid_response";
  rerankerStatus: "success" | "no_candidates" | "not_configured" | "timeout" | "gateway_error" | "invalid_response";
  rerankerUsed: boolean;
  evidence: RerankedKnowledgeEvidence[];
}> {
  const runtime = env as unknown as Record<string, string | undefined>;
  const selectionConfig = readEvidenceSelectionConfig(runtime);
  // Hybrid 内部先完成权限 scope；这里只接收其输出，禁止额外从全库补充候选。
  const hybrid = await retrieveAuthorizedHybrid(user, query, { fusionTopK: selectionConfig.candidateLimit });
  const candidates = hybrid.evidence.slice(0, selectionConfig.candidateLimit);
  if (!candidates.length) {
    return { retrievalStatus: hybrid.status, vectorStatus: hybrid.vectorStatus, rerankerStatus: "no_candidates", rerankerUsed: false, evidence: [] };
  }

  const reranker = await rerankCandidates(
    readRerankerGatewayConfig(runtime),
    query,
    candidates.map((candidate) => ({ text: candidate.excerpt })),
  );
  if (reranker.status !== "success") {
    return {
      retrievalStatus: hybrid.status,
      vectorStatus: hybrid.vectorStatus,
      rerankerStatus: reranker.status,
      rerankerUsed: false,
      evidence: selectTopEvidence(candidates, { topK: selectionConfig.topK, rerankerUsed: false }),
    };
  }

  const scores = new Map(reranker.scores.map((item) => [item.index, item.score]));
  const ranked = candidates
    .map((candidate, index) => ({ ...candidate, rerankScore: scores.get(index)! }))
    .sort((left, right) => right.rerankScore - left.rerankScore || right.fusionScore - left.fusionScore || left.chunkId.localeCompare(right.chunkId))
    .map((candidate, index) => ({ ...candidate, rerankRank: index + 1 }));
  return {
    retrievalStatus: hybrid.status,
    vectorStatus: hybrid.vectorStatus,
    rerankerStatus: "success",
    rerankerUsed: true,
    evidence: selectTopEvidence(ranked, { topK: selectionConfig.topK, rerankerUsed: true }),
  };
}


// 说明：以真实 citations 生成最终问答模式，输入是已经完成权限与可靠依据筛选的引用，输出是 no_basis、extractive 或 model。
// 没有引用时绝不调用网关；网关超时、异常或引用不合格时不展示模型文本，而是安全回退到原文摘录。
export async function answerFromCitations(query: string, citations: KnowledgeCitation[], history: Array<{ role: "assistant"; content: string }> = []) {
  const config = readModelGatewayConfig(env as unknown as Record<string, string | undefined>);
  if (!citations.length) return { answer: "当前无可引用的正式资料，建议补充或检索已批准知识资源。", mode: "no_basis" as const, model: config.model, citations };
  const modelCitations: ModelGatewayCitation[] = citations.map(({ title, version, sourceType, location, excerpt }) => ({ title, version, sourceType, location, excerpt }));
  // 已配置的模型出现传输、超时或空响应时不回退成模型外推内容，仅保留已授权引用供用户核对。
  if (config.configured) {
    const result = await callModelGateway(config, query, modelCitations, undefined, history);
    if (result.status === "success") return { answer: result.answer, mode: "model" as const, model: config.model, citations };
    return { answer: "回答服务暂时不可用，未生成回答，请稍后重试。", mode: "failed" as const, model: config.model, citations };
  }
  const result = await resolveGroundedAnswer(query, modelCitations, config);
  return { ...result, citations };
}

export async function answerKnowledge(user: AccessUser, query: string, history: Array<{ role: "assistant"; content: string }> = []) {
  const matches = await retrieveAuthorized(user, query);
  const citations: KnowledgeCitation[] = matches.map(row => ({
    documentId: row.document.id,
    versionId: row.versionId,
    title: row.document.title,
    category: row.document.resourceCategory,
    sourceOrganization: row.document.sourceOrganization,
    documentDate: row.document.documentDate,
    version: row.versionNo,
    // 引用摘要只用于已完成权限过滤的模型上下文；浏览器默认不接收，预览需通过单独权限接口重新读取。
    excerpt: row.chunk.content.slice(0, 520),
    sourceType: row.document.sourceType,
    chunkIndex: row.chunk.chunkIndex,
    // 说明：分片序号来自 document_chunks.chunk_index，从零开始存储，对用户展示时转换为“第 N 段”。
    location: `第${row.chunk.chunkIndex + 1}段`,
    score: Number(row.score.toFixed(1)),
  }));
  return answerFromCitations(query, citations, history);
}

export function modelGatewayStatus() {
  return publicModelGatewayStatus(readModelGatewayConfig(env as unknown as Record<string, string | undefined>));
}
