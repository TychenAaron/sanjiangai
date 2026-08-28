// 知识问答接口：只使用当前用户有权的正式资料，并以 request_id 关联最小运行日志和审计记录。
import { getDb } from "../../../../db";
import { auditLogs } from "../../../../db/schema";
import { accessError, requireAccessUser } from "../../../../lib/access";
import { answerKnowledge } from "../../../../lib/rag";
import { ensureConversation, getValidConversationContext, saveConversationExchange } from "../../../../lib/knowledge-conversations";
import { getRequestId, observeResponse, withAuditRequestId } from "../../../../lib/runtime-observability";

export const runtime = "edge";

/**
 * 根据已授权正式知识回答问题。输入为用户问题和可选会话 ID；输出为回答和 citations，日志与审计不记录问题或资料正文。
 */
export async function POST(request: Request) {
  const startedAt = Date.now(); let user: Awaited<ReturnType<typeof requireAccessUser>> | undefined;
  try {
    user = await requireAccessUser(request);
    const body = await request.json() as { query?: string; conversationId?: string };
    const query = body.query?.trim();
    if (!query) return observeResponse(request, "knowledge.ask", startedAt, Response.json({ error: "请输入问题" }, { status: 400 }), user, "query_required");
    if (query.length > 500) return observeResponse(request, "knowledge.ask", startedAt, Response.json({ error: "单次问题不得超过500字" }, { status: 400 }), user, "query_too_long");
    const conversation = await ensureConversation(user, body.conversationId, query);
    const history = await getValidConversationContext(user, body.conversationId);
    const result = await answerKnowledge(user, query, history);
    await saveConversationExchange(conversation.id, query, result.answer, "answer", result.citations, result.mode === "failed" ? "answer_failed" : undefined);
    const requestId = getRequestId(request);
    // 只保留长度、引用数和结果模式；问题、提示词、片段和模型配置均不写审计。
    await getDb().insert(auditLogs).values({
      id: crypto.randomUUID(), action: "知识问答检索", entityType: "knowledge_query", entityId: crypto.randomUUID(), operator: user.name,
      detail: withAuditRequestId(`问题长度${query.length}｜引用${result.citations.length}条｜模式${result.mode}`, request), requestId, createdAt: new Date().toISOString(),
    });
    const citations = result.citations.map((citation) => ({ documentId: citation.documentId, title: citation.title, category: citation.category, sourceOrganization: citation.sourceOrganization, documentDate: citation.documentDate, version: citation.version, sourceType: citation.sourceType, chunkIndex: citation.chunkIndex, location: citation.location, score: citation.score }));
    return observeResponse(request, "knowledge.ask", startedAt, Response.json({ ...result, conversationId: conversation.id, citations }), user, result.mode === "failed" ? "answer_failed" : undefined);
  } catch (error) { return observeResponse(request, "knowledge.ask", startedAt, accessError(error, "知识检索失败"), user, "knowledge_request_failed"); }
}
