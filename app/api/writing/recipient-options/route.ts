// 公文报送/发送对象配置接口：普通员工仅读取启用项，只有系统管理员可以新增配置。
import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { auditLogs, writingRecipientOptions } from "../../../../db/schema";
import { accessError, requireAccessUser } from "../../../../lib/access";

export const runtime = "edge";

// 说明：读取对象下拉选项。输入为当前账号和可选 includeDisabled，输出按排序后的安全字段；非管理员永远看不到停用项。
export async function GET(request: Request) {
  try {
    const user = await requireAccessUser(request);
    const includeDisabled = user.role === "system_admin" && new URL(request.url).searchParams.get("includeDisabled") === "true";
    const db = getDb();
    const options = await db.select().from(writingRecipientOptions)
      .where(includeDisabled ? undefined : eq(writingRecipientOptions.enabled, true))
      .orderBy(asc(writingRecipientOptions.sortOrder), asc(writingRecipientOptions.name));
    return Response.json({ options });
  } catch (error) { return accessError(error, "读取报送/发送对象失败"); }
}

// 说明：新增管理员维护的对象。输入为名称和可选排序值，输出新配置；只写 writing_recipient_options 与最小审计，不影响历史公文。
export async function POST(request: Request) {
  try {
    const user = await requireAccessUser(request);
    if (user.role !== "system_admin") return Response.json({ error: "仅系统管理员可以维护报送/发送对象" }, { status: 403 });
    const body = await request.json() as { name?: string; sortOrder?: number; enabled?: boolean };
    const name = String(body.name || "").trim().slice(0, 100);
    if (!name) return Response.json({ error: "请填写报送/发送对象名称" }, { status: 400 });
    const db = getDb();
    const exists = await db.select({ id: writingRecipientOptions.id }).from(writingRecipientOptions).where(eq(writingRecipientOptions.name, name)).limit(1);
    if (exists.length) return Response.json({ error: "该报送/发送对象已存在" }, { status: 409 });
    const now = new Date().toISOString(); const id = crypto.randomUUID();
    await db.insert(writingRecipientOptions).values({ id, name, enabled: body.enabled !== false, sortOrder: Number.isFinite(body.sortOrder) ? Number(body.sortOrder) : 0, createdBy: user.name, createdAt: now, updatedAt: now });
    await db.insert(auditLogs).values({ id: crypto.randomUUID(), action: "新增报送发送对象", entityType: "writing_recipient_option", entityId: id, operator: user.name, detail: `name=${name}`, createdAt: now });
    const [option] = await db.select().from(writingRecipientOptions).where(eq(writingRecipientOptions.id, id));
    return Response.json({ option }, { status: 201 });
  } catch (error) { return accessError(error, "新增报送/发送对象失败"); }
}
