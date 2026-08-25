import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../db";
import { documentAcl, documentChunks, documents, documentVersions } from "../db/schema";
import { AccessUser, canReadDocument } from "./access";

type RuntimeEnv = {
  QWEN_BASE_URL?: string;
  QWEN_API_KEY?: string;
  QWEN_MODEL?: string;
};

export type KnowledgeCitation = {
  documentId: string;
  title: string;
  version: number;
  excerpt: string;
  sourceType: string;
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

export async function retrieveAuthorized(user: AccessUser, query: string) {
  const db = getDb();
  const [grants, rows] = await Promise.all([
    db.select().from(documentAcl),
    db.select({
      chunk: documentChunks,
      document: documents,
      versionNo: documentVersions.versionNo,
    }).from(documentChunks)
      .innerJoin(documents, eq(documentChunks.documentId, documents.id))
      .innerJoin(documentVersions, eq(documentChunks.versionId, documentVersions.id))
      .where(and(eq(documents.knowledgeStatus, "approved"), eq(documentVersions.versionStatus, "approved")))
      .limit(3000),
  ]);
  return rows
    .filter(row => row.versionNo === row.document.currentVersion && canReadDocument(user, row.document, grants))
    .map(row => ({ ...row, score: relevance(query, row.chunk.content) }))
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function gatewayConfig() {
  const runtime = env as unknown as RuntimeEnv;
  return {
    baseUrl: runtime.QWEN_BASE_URL?.replace(/\/$/, "") || "",
    apiKey: runtime.QWEN_API_KEY || "",
    model: runtime.QWEN_MODEL || "Qwen3.8-27B",
  };
}

async function askQwen(query: string, citations: KnowledgeCitation[]) {
  const config = gatewayConfig();
  if (!config.baseUrl) return null;
  const materials = citations.map((item, index) => `[${index + 1}]《${item.title}》V${item.version}.0\n${item.excerpt}`).join("\n\n");
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.1,
      max_tokens: 1200,
      messages: [
        { role: "system", content: "你是集团内部知识助手。只能依据提供的资料作答，不得补充资料中不存在的事实。关键结论用[1][2]标注依据；依据不足时明确说明。" },
        { role: "user", content: `问题：${query}\n\n已通过账号权限过滤的资料：\n${materials}` },
      ],
    }),
  });
  if (!response.ok) throw new Error(`模型网关返回${response.status}`);
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content?.trim() || null;
}

export async function answerKnowledge(user: AccessUser, query: string) {
  const matches = await retrieveAuthorized(user, query);
  const citations: KnowledgeCitation[] = matches.map(row => ({
    documentId: row.document.id,
    title: row.document.title,
    version: row.versionNo,
    excerpt: row.chunk.content.slice(0, 520),
    sourceType: row.document.sourceType,
    score: Number(row.score.toFixed(1)),
  }));
  if (!citations.length) {
    return { answer: "在您当前有权查看且已经审核发布的资料中，没有找到足够依据。请换一种问法，或请资料管理员补充并审核相关文件。", citations, mode: "no_basis" as const, model: "Qwen3.8-27B" };
  }
  try {
    const answer = await askQwen(query, citations);
    if (answer) return { answer, citations, mode: "qwen" as const, model: gatewayConfig().model };
  } catch {
    // The retrieval result remains usable when the external model endpoint is unavailable.
  }
  const extracts = citations.slice(0, 3).map((item, index) => `${index + 1}. ${item.excerpt.slice(0, 220)}${item.excerpt.length > 220 ? "……" : ""}`).join("\n\n");
  return {
    answer: `已在您有权查看的正式资料中找到以下相关原文：\n\n${extracts}\n\n当前尚未配置Qwen3.8-27B云端模型地址，因此本次只显示检索原文，不对制度内容作进一步推断。`,
    citations,
    mode: "extractive" as const,
    model: "Qwen3.8-27B",
  };
}

export function modelGatewayStatus() {
  const config = gatewayConfig();
  return { configured: Boolean(config.baseUrl), model: config.model };
}
