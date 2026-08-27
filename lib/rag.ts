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

export async function retrieveAuthorized(user: AccessUser, query: string) {
  const db = getDb();
  const [grants, rows] = await Promise.all([
    db.select().from(documentAcl),
    db.select({
      chunk: documentChunks,
      document: documents,
      versionId: documentVersions.id,
      versionNo: documentVersions.versionNo,
    }).from(documentChunks)
      .innerJoin(documents, eq(documentChunks.documentId, documents.id))
      .innerJoin(documentVersions, eq(documentChunks.versionId, documentVersions.id))
      // 正式检索只读取已批准、有效、非 D4 且可靠性达标的当前版本；其余状态即使已有分段也不会参与评分或模型输入。
      .where(and(eq(documents.knowledgeStatus, "approved"), eq(documents.resourceStatus, "approved"), eq(documents.lifecycleStatus, "effective"), eq(documents.parseStatus, "parsed"), eq(documents.indexStatus, "ready"), ne(documents.securityLevel, "D4"), gte(documents.reliabilityScore, 60), eq(documentVersions.versionStatus, "approved")))
      .limit(3000),
  ]);
  const reliableScore = minimumReliableScore();
  return rows
    // 说明：必须先按当前账号的角色、部门、数据级别和 ACL 过滤，任何无权分片都不能参与评分、引用或模型上下文。
    .filter(row => row.versionNo === row.document.currentVersion && canReadDocument(user, row.document, grants))
    .map(row => ({ ...row, score: relevance(query, row.chunk.content) }))
    // 说明：权限通过后仍需达到可解释的可靠依据门槛，单个弱关键词命中不能触发问答。
    .filter(row => row.score >= reliableScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
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
