import { getDb } from "../../../../db";
import { auditLogs } from "../../../../db/schema";
import { accessError, requireAccessUser } from "../../../../lib/access";
import { retrieveAuthorized, retrieveAuthorizedRerankedHybrid, retrieveAuthorizedVector } from "../../../../lib/rag";
import { ensureConversation, saveConversationExchange } from "../../../../lib/knowledge-conversations";

export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const user = await requireAccessUser(request);
    const body = await request.json() as { query?: string; conversationId?: string; mode?: "keyword" | "vector" | "hybrid" };
    const query = body.query?.trim();
    if (!query) return Response.json({ error: "请输入搜索内容" }, { status: 400 });
    if (query.length > 300) return Response.json({ error: "单次搜索不得超过300字" }, { status: 400 });

    // hybrid 模式只重排同一授权范围内的融合候选，不调用问答模型；默认关键词模式保持原有行为。
    if (body.mode === "hybrid") {
      const hybrid = await retrieveAuthorizedRerankedHybrid(user, query);
      const results = hybrid.evidence.map((citation) => ({
        title: citation.title, category: citation.category, sourceOrganization: citation.sourceOrganization,
        documentDate: citation.documentDate, sourceType: citation.sourceType, version: citation.version,
        excerpt: citation.excerpt.slice(0, 260), location: citation.location, score: citation.fusionScore,
        retrievalSources: citation.retrievalSources, keywordRank: citation.keywordRank, vectorRank: citation.vectorRank,
        keywordScore: citation.keywordScore, vectorSimilarity: citation.vectorSimilarity, fusionScore: citation.fusionScore,
        rerankScore: citation.rerankScore, rerankRank: citation.rerankRank,
      }));
      const conversation = await ensureConversation(user, body.conversationId, query);
      await saveConversationExchange(conversation.id, query, results.length ? `已找到${results.length}条融合匹配的正式资料。` : "当前无可引用的正式资料，建议补充或检索已批准知识资源。", "search", hybrid.evidence);
      await getDb().insert(auditLogs).values({
        id: crypto.randomUUID(), action: "融合资料检索", entityType: "knowledge_search", entityId: crypto.randomUUID(), operator: user.name,
        // 审计仅保留分支状态与数量，避免记录查询原文、分片正文或向量数据。
        detail: `status=${hybrid.retrievalStatus}; vector=${hybrid.vectorStatus}; reranker=${hybrid.rerankerStatus}; results=${results.length}`, createdAt: new Date().toISOString(),
      });
      return Response.json({ results, conversationId: conversation.id, retrievalMode: "permission_scoped_hybrid", fusionStatus: hybrid.retrievalStatus, vectorStatus: hybrid.vectorStatus, rerankerStatus: hybrid.rerankerStatus, rerankerUsed: hybrid.rerankerUsed });
    }

    // vector 模式只做受限资料检索，不调用问答模型；默认关键词模式保持原有行为。
    if (body.mode === "vector") {
      const vector = await retrieveAuthorizedVector(user, query);
      const results = vector.evidence.map((citation) => ({
        title: citation.title, category: citation.category, sourceOrganization: citation.sourceOrganization,
        documentDate: citation.documentDate, sourceType: citation.sourceType, version: citation.version,
        excerpt: citation.excerpt.slice(0, 260), location: citation.location, score: citation.score,
      }));
      const conversation = await ensureConversation(user, body.conversationId, query);
      await saveConversationExchange(conversation.id, query, results.length ? `已找到${results.length}条语义匹配的正式资料。` : "当前无可引用的正式资料，建议补充或检索已批准知识资源。", "search", vector.evidence);
      await getDb().insert(auditLogs).values({
        id: crypto.randomUUID(), action: "向量资料检索", entityType: "knowledge_search", entityId: crypto.randomUUID(), operator: user.name,
        detail: `status=${vector.status}; results=${results.length}`, createdAt: new Date().toISOString(),
      });
      return Response.json({ results, conversationId: conversation.id, retrievalMode: "permission_scoped_vector", vectorStatus: vector.status });
    }

    const matches = await retrieveAuthorized(user, query);
    const citations = matches.map(row => ({ documentId: row.document.id, versionId: row.versionId, title: row.document.title, category: row.document.resourceCategory, sourceOrganization: row.document.sourceOrganization, documentDate: row.document.documentDate, version: row.versionNo, excerpt: row.chunk.content.slice(0, 520), sourceType: row.document.sourceType, chunkIndex: row.chunk.chunkIndex, location: `第${row.chunk.chunkIndex + 1}段`, score: Number(row.score.toFixed(1)) }));
    const results = citations.map(citation => ({
      title: citation.title, category: citation.category, sourceOrganization: citation.sourceOrganization, documentDate: citation.documentDate, sourceType: citation.sourceType, version: citation.version, excerpt: citation.excerpt.slice(0, 260), location: citation.location, score: citation.score,
    }));
    const conversation = await ensureConversation(user, body.conversationId, query);
    await saveConversationExchange(conversation.id, query, results.length ? `已找到 ${results.length} 条匹配的正式资料。` : "当前无可引用的正式资料，建议补充或检索已批准知识资源。", "search", citations);

    await getDb().insert(auditLogs).values({
      id: crypto.randomUUID(), action: "智能搜索", entityType: "knowledge_search", entityId: crypto.randomUUID(), operator: user.name,
      detail: `${query.slice(0, 80)}｜权限内命中${results.length}条`, createdAt: new Date().toISOString(),
    });
    return Response.json({ results, conversationId: conversation.id, retrievalMode: "authorized_fulltext" });
  } catch (error) { return accessError(error, "智能搜索失败"); }
}
