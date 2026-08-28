// 本文件维护知识会话的最小持久化与历史引用复核；不读取 R2、不外发模型正文，也不保存资料全文。
import { and, desc, eq, isNull, ne, gte } from "drizzle-orm";
import { getDb } from "../db";
import { documentAcl, documentChunks, documents, documentVersions, knowledgeConversations, knowledgeMessageCitations, knowledgeMessages } from "../db/schema";
import type { AccessUser } from "./access";
import { AccessError, canReadDocument } from "./access";
import type { KnowledgeCitation } from "./rag";

export type ConversationMode = "answer" | "search";

// 输入为当前用户、可选会话和首个问题；输出为只属于该用户的会话，避免通过猜测 ID 写入他人会话。
export async function ensureConversation(user: AccessUser, conversationId: string | undefined, firstQuestion: string) {
  const db = getDb();
  if (conversationId) {
    const [existing] = await db.select().from(knowledgeConversations).where(and(eq(knowledgeConversations.id, conversationId), isNull(knowledgeConversations.deletedAt))).limit(1);
    if (!existing || (existing.createdByUserId !== user.id && user.role !== "system_admin")) throw new AccessError(403, "会话不存在或无权访问");
    return existing;
  }
  const now = new Date().toISOString(); const id = crypto.randomUUID();
  const title = firstQuestion.replace(/\s+/g, " ").slice(0, 40) || "新建会话";
  await db.insert(knowledgeConversations).values({ id, createdByUserId: user.id, title, createdAt: now, updatedAt: now });
  const [created] = await db.select().from(knowledgeConversations).where(eq(knowledgeConversations.id, id));
  if (!created) throw new Error("创建会话失败");
  return created;
}

// 保存一次问答或检索交换；引用只保存可追溯元数据，正文仍由正式资料表受权限保护地管理。
export async function saveConversationExchange(conversationId: string, question: string, answer: string, mode: ConversationMode, citations: KnowledgeCitation[], errorStatus?: string) {
  const db = getDb(); const now = new Date().toISOString(); const userMessageId = crypto.randomUUID(); const assistantMessageId = crypto.randomUUID();
  await db.insert(knowledgeMessages).values([
    { id: userMessageId, conversationId, role: "user", content: question, mode, createdAt: now },
    { id: assistantMessageId, conversationId, role: "assistant", content: answer, mode, errorStatus: errorStatus || null, createdAt: now },
  ]);
  if (citations.length) await db.insert(knowledgeMessageCitations).values(citations.map((citation) => ({ id: crypto.randomUUID(), messageId: assistantMessageId, documentId: citation.documentId, versionId: citation.versionId, chunkIndex: citation.chunkIndex, title: citation.title, category: citation.category, sourceOrganization: citation.sourceOrganization, documentDate: citation.documentDate, location: citation.location, createdAt: now })));
  await db.update(knowledgeConversations).set({ updatedAt: now }).where(eq(knowledgeConversations.id, conversationId));
  return assistantMessageId;
}

// 实时检查历史引用当前仍为正式、已解析、当前版本且该用户有权；资料状态变化后不再返回旧回答正文。
async function citationAvailable(user: AccessUser, citation: typeof knowledgeMessageCitations.$inferSelect) {
  const db = getDb();
  const [grants, rows] = await Promise.all([
    db.select().from(documentAcl).where(eq(documentAcl.documentId, citation.documentId)),
    db.select({ document: documents, version: documentVersions, chunk: documentChunks }).from(documentChunks).innerJoin(documents, eq(documentChunks.documentId, documents.id)).innerJoin(documentVersions, eq(documentChunks.versionId, documentVersions.id)).where(and(eq(documents.id, citation.documentId), eq(documentVersions.id, citation.versionId), eq(documentChunks.chunkIndex, citation.chunkIndex), eq(documents.knowledgeStatus, "approved"), eq(documents.resourceStatus, "approved"), eq(documents.lifecycleStatus, "effective"), eq(documents.parseStatus, "parsed"), eq(documents.indexStatus, "ready"), ne(documents.securityLevel, "D4"), gte(documents.reliabilityScore, 60), eq(documentVersions.versionStatus, "approved"))).limit(1),
  ]);
  const row = rows[0];
  return Boolean(row && row.version.versionNo === row.document.currentVersion && canReadDocument(user, row.document, grants));
}

// 读取历史会话时重新复核每个 assistant 消息的引用；输出不包含旧正文片段或 R2 存储信息。
export async function readConversation(user: AccessUser, conversationId: string) {
  const db = getDb(); const [conversation] = await db.select().from(knowledgeConversations).where(and(eq(knowledgeConversations.id, conversationId), isNull(knowledgeConversations.deletedAt))).limit(1);
  if (!conversation || (conversation.createdByUserId !== user.id && user.role !== "system_admin")) throw new AccessError(403, "会话不存在或无权访问");
  const messages = await db.select().from(knowledgeMessages).where(eq(knowledgeMessages.conversationId, conversationId)).orderBy(knowledgeMessages.createdAt);
  return { conversation, messages: await Promise.all(messages.map(async (message) => {
    const citations = message.role === "assistant" ? await db.select().from(knowledgeMessageCitations).where(eq(knowledgeMessageCitations.messageId, message.id)) : [];
    if (message.role === "assistant" && citations.length && !(await Promise.all(citations.map((citation) => citationAvailable(user, citation)))).every(Boolean)) return { ...message, content: "该历史回答关联资料已失效或当前无权查看。", citations: [], invalidated: true };
    return { ...message, citations, invalidated: false };
  })) };
}

export async function listConversations(user: AccessUser) {
  const db = getDb();
  // 会话侧栏只展示创建人自己的会话；管理员审计与用户私有会话读取严格分离，避免页面出现无权删除的他人会话。
  const scope = and(eq(knowledgeConversations.createdByUserId, user.id), isNull(knowledgeConversations.deletedAt));
  return db.select().from(knowledgeConversations).where(scope).orderBy(desc(knowledgeConversations.updatedAt)).limit(50);
}

// 仅返回仍通过实时引用复核的 assistant 历史，用于下一轮模型理解上下文；失效资料相关内容绝不外发。
export async function getValidConversationContext(user: AccessUser, conversationId: string | undefined) {
  if (!conversationId) return [];
  const history = await readConversation(user, conversationId);
  return history.messages.filter((message) => message.role === "assistant" && !message.invalidated).slice(-4).map((message) => ({ role: "assistant" as const, content: message.content }));
}
