import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLogs, blockedTerms } from "../../../db/schema";
import { accessError, canManageUploadRules, requireAccessUser } from "../../../lib/access";
import { normalizeBlockedTerm } from "../../../lib/upload-control";

export const runtime = "edge";

export async function GET(request: Request) {
  try {
    const user = await requireAccessUser(request);
    if (!canManageUploadRules(user)) return Response.json({ error: "当前账号无权管理禁止上传词条" }, { status: 403 });
    const terms = await getDb().select().from(blockedTerms).orderBy(desc(blockedTerms.updatedAt)).limit(500);
    return Response.json({ terms });
  } catch (error) { return accessError(error, "读取禁止上传词条失败"); }
}

export async function POST(request: Request) {
  try {
    const user = await requireAccessUser(request);
    if (!canManageUploadRules(user)) return Response.json({ error: "当前账号无权管理禁止上传词条" }, { status: 403 });
    const body = await request.json() as { term?: string; category?: string; matchScope?: string; note?: string };
    const term = body.term?.normalize("NFKC").trim() || "";
    const normalizedTerm = normalizeBlockedTerm(term);
    if (normalizedTerm.length < 2 || normalizedTerm.length > 100) return Response.json({ error: "词条应为2—100个字符，避免单字误拦截" }, { status: 400 });
    const matchScope = new Set(["all", "filename", "content"]).has(body.matchScope || "") ? String(body.matchScope) : "all";
    const category = (body.category?.trim() || "自定义禁止项").slice(0, 40);
    const db = getDb();
    const existing = await db.select().from(blockedTerms).where(eq(blockedTerms.normalizedTerm, normalizedTerm)).limit(1);
    if (existing.length) return Response.json({ error: "该词条已经存在，请勿重复添加" }, { status: 409 });
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await db.insert(blockedTerms).values({ id, term, normalizedTerm, category, matchScope, note: body.note?.trim().slice(0, 200) || null, enabled: true, createdBy: user.name, createdAt: now, updatedAt: now });
    await db.insert(auditLogs).values({ id: crypto.randomUUID(), action: "新增禁止上传词条", entityType: "blocked_term", entityId: id, operator: user.name, detail: `${term}｜${category}｜${matchScope}`, createdAt: now });
    const [created] = await db.select().from(blockedTerms).where(eq(blockedTerms.id, id));
    return Response.json({ term: created }, { status: 201 });
  } catch (error) { return accessError(error, "新增禁止上传词条失败"); }
}
