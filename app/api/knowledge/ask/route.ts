import { getDb } from "../../../../db";
import { auditLogs } from "../../../../db/schema";
import { accessError, requireAccessUser } from "../../../../lib/access";
import { answerKnowledge } from "../../../../lib/rag";

export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const user = await requireAccessUser(request);
    const body = await request.json() as { query?: string };
    const query = body.query?.trim();
    if (!query) return Response.json({ error: "请输入问题" }, { status: 400 });
    if (query.length > 500) return Response.json({ error: "单次问题不得超过500字" }, { status: 400 });
    const result = await answerKnowledge(user, query);
    await getDb().insert(auditLogs).values({
      id: crypto.randomUUID(), action: "知识问答检索", entityType: "knowledge_query", entityId: crypto.randomUUID(), operator: user.name,
      detail: `${query.slice(0, 80)}｜命中${result.citations.length}条｜${result.mode}`, createdAt: new Date().toISOString(),
    });
    return Response.json(result);
  } catch (error) { return accessError(error, "知识检索失败"); }
}
