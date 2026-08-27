import { getDb } from "../../../../db";
import { auditLogs } from "../../../../db/schema";
import { accessError, requireAccessUser } from "../../../../lib/access";
import { answerKnowledge } from "../../../../lib/rag";
import { ensureConversation, getValidConversationContext, saveConversationExchange } from "../../../../lib/knowledge-conversations";

export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const user = await requireAccessUser(request);
    const body = await request.json() as { query?: string; conversationId?: string };
    const query = body.query?.trim();
    if (!query) return Response.json({ error: "请输入问题" }, { status: 400 });
    if (query.length > 500) return Response.json({ error: "单次问题不得超过500字" }, { status: 400 });
    const conversation = await ensureConversation(user, body.conversationId, query);
    const history = await getValidConversationContext(user, body.conversationId);
    const result = await answerKnowledge(user, query, history);
    await saveConversationExchange(conversation.id, query, result.answer, "answer", result.citations, result.mode === "failed" ? "answer_failed" : undefined);
    // 说明：问答审计只保留最小必要元数据，避免把员工完整问题、模型请求、资料正文或网关配置写入 audit_logs。
    await getDb().insert(auditLogs).values({
      id: crypto.randomUUID(), action: "知识问答检索", entityType: "knowledge_query", entityId: crypto.randomUUID(), operator: user.name,
      detail: `问题长度${query.length}｜引用${result.citations.length}条｜模式${result.mode}`, createdAt: new Date().toISOString(),
    });
    // 浏览器默认只获得可追溯元数据；正文片段必须在用户点击引用时重新走权限校验接口读取。
    const citations = result.citations.map((citation) => ({ documentId: citation.documentId, title: citation.title, category: citation.category, sourceOrganization: citation.sourceOrganization, documentDate: citation.documentDate, version: citation.version, sourceType: citation.sourceType, chunkIndex: citation.chunkIndex, location: citation.location, score: citation.score }));
    return Response.json({ ...result, conversationId: conversation.id, citations });
  } catch (error) { return accessError(error, "知识检索失败"); }
}
