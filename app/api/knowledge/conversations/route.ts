// 本接口提供当前用户自己的知识会话列表与新建入口；普通员工不能枚举或读取其他用户会话。
import { accessError, requireAccessUser } from "../../../../lib/access";
import { ensureConversation, listConversations } from "../../../../lib/knowledge-conversations";

export const runtime = "edge";
export async function GET(request: Request) { try { return Response.json({ conversations: await listConversations(await requireAccessUser(request)) }); } catch (error) { return accessError(error, "读取会话失败"); } }
export async function POST(request: Request) { try { const user = await requireAccessUser(request); const body = await request.json().catch(() => ({})) as { title?: string }; const conversation = await ensureConversation(user, undefined, body.title || "新建会话"); return Response.json({ conversation }, { status: 201 }); } catch (error) { return accessError(error, "创建会话失败"); } }
