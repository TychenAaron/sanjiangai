// 本接口读取、重命名或软删除单个知识会话；历史回答会在读取时重新校验其正式资料引用。
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { knowledgeConversations } from "../../../../../db/schema";
import { accessError, requireAccessUser } from "../../../../../lib/access";
import { readConversation } from "../../../../../lib/knowledge-conversations";

export const runtime = "edge";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { try { const user = await requireAccessUser(request); return Response.json(await readConversation(user, (await context.params).id)); } catch (error) { return accessError(error, "读取会话失败"); } }
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { try { const user = await requireAccessUser(request); const id = (await context.params).id; const title = String((await request.json() as { title?: string }).title || "").trim().slice(0, 40); if (!title) return Response.json({ error: "请输入会话标题" }, { status: 400 }); const db = getDb(); const [conversation] = await db.select().from(knowledgeConversations).where(eq(knowledgeConversations.id, id)); if (!conversation || conversation.createdByUserId !== user.id) return Response.json({ error: "当前账号无权修改该会话" }, { status: 403 }); await db.update(knowledgeConversations).set({ title, updatedAt: new Date().toISOString() }).where(eq(knowledgeConversations.id, id)); return Response.json({ ok: true }); } catch (error) { return accessError(error, "重命名会话失败"); } }
// 仅创建人可将会话软删除；保留消息与引用快照用于审计，但所有会话读取路径都会排除 deleted_at，避免历史内容继续暴露。
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) { try { const user = await requireAccessUser(request); const id = (await context.params).id; const db = getDb(); const [conversation] = await db.select().from(knowledgeConversations).where(and(eq(knowledgeConversations.id, id), eq(knowledgeConversations.createdByUserId, user.id))); if (!conversation || conversation.deletedAt) return Response.json({ error: "会话不存在或当前账号无权删除" }, { status: 403 }); const now = new Date().toISOString(); await db.update(knowledgeConversations).set({ deletedAt: now, updatedAt: now }).where(and(eq(knowledgeConversations.id, id), eq(knowledgeConversations.createdByUserId, user.id))); return Response.json({ ok: true, deletedAt: now }); } catch (error) { return accessError(error, "删除会话失败"); } }
